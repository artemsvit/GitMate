import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeContextFile, gatherContext } from '../server/copilotContext';
import { saveConversation, readConversation, listConversations, deleteConversation, hashFile, chat } from '../server/copilotService';
const run = promisify(execFile);
async function fixture(t: any) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'gitmate-chat-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo'); await run('git', ['init', '-b', 'main', repo]);
  const git = (...args: string[]) => run('git', ['-C', repo, ...args]); await git('config', 'user.name', 'Fixture'); await git('config', 'user.email', 'fixture@example.invalid');
  return {root, repo, git};
}
test('Copilot context excludes secrets, dependencies, binary data, and escaped paths', async t => {
  const {root,repo,git} = await fixture(t);
  await fs.writeFile(path.join(repo, 'README.md'), 'Public project documentation'); await fs.writeFile(path.join(repo, '.env'), 'PASSWORD=fixture-private-secret');
  await fs.mkdir(path.join(repo, 'node_modules')); await fs.writeFile(path.join(repo, 'node_modules', 'secret.txt'), 'private-dependency');
  await fs.writeFile(path.join(root, 'outside.txt'), 'escaped-secret'); await fs.symlink(path.join(root, 'outside.txt'), path.join(repo, 'escape.txt'));
  await git('add', '.'); await git('commit', '-m', 'base'); await fs.writeFile(path.join(repo, '.env'), 'PASSWORD=updated-private-secret');
  const context = await gatherContext([repo], 'Summarize project README');
  assert.match(context.text, /Public project documentation/);
  for (const secret of ['fixture-private-secret', 'updated-private-secret', 'private-dependency', 'escaped-secret']) assert.equal(context.text.includes(secret), false);
  for (const file of ['.env', 'node_modules/secret.txt', 'escape.txt', '../outside.txt']) assert.throws(() => safeContextFile(repo, file));
});
test('Copilot context explains a commit from evidence and reports truncation', async t => {
  const {repo,git} = await fixture(t); await fs.writeFile(path.join(repo, 'README.md'), 'base'); await git('add', '.'); await git('commit', '-m', 'base');
  await fs.writeFile(path.join(repo, 'README.md'), 'Detailed documentation '.repeat(1000)); await git('commit', '-am', 'Expand documentation');
  const hash = (await git('rev-parse', 'HEAD')).stdout.trim(); const context = await gatherContext([repo], 'Explain this commit', hash);
  assert.equal(context.truncated, true); assert.ok(context.sources.some(source => source.commit === hash)); assert.ok(context.text.length < 22000);
  await assert.rejects(gatherContext([repo], 'Explain', '--all'), /Invalid commit/);
});
test('conversation history is private, persistent, and isolated by repository; failed requests release generation lock', async t => {
  const {root,repo} = await fixture(t); const previous = process.env.GITMATE_CONFIG_DIR; process.env.GITMATE_CONFIG_DIR = path.join(root,'config');
  t.after(() => { if (previous === undefined) delete process.env.GITMATE_CONFIG_DIR; else process.env.GITMATE_CONFIG_DIR = previous; });
  const id = crypto.randomUUID(); saveConversation(repo,{id,title:'Fixture',updated:new Date().toISOString(),messages:[{id:crypto.randomUUID(),role:'user',content:'Question'}]});
  assert.equal(listConversations(repo).length,1); assert.equal(listConversations(root).length,0); assert.equal(readConversation(repo,id).messages[0].content,'Question');
  assert.throws(() => readConversation(repo,'../../escape'));
  const file = path.join(root,'hash.txt'); await fs.writeFile(file,'fixture'); assert.equal(await hashFile(file),crypto.createHash('sha256').update('fixture').digest('hex'));
  const options={repo,repos:[repo],id:crypto.randomUUID(),question:'Question',signal:new AbortController().signal,emit:()=>{}};
  await assert.rejects(chat(options), /ENOENT/); await assert.rejects(chat(options), /ENOENT/);
  deleteConversation(repo,id); assert.equal(listConversations(repo).length,0);
});

test('model download verifies checksums, resumes partial data, and rejects a corrupted artifact', async t => {
  const {root} = await fixture(t); const { downloadArtifact } = await import('../server/modelDownload'); const http = await import('node:http');
  const bytes = Buffer.from('fixture model content'); let range = '';
  const server = http.createServer((req,res) => { range = req.headers.range || ''; const offset = Number(range.match(/bytes=(\d+)-/)?.[1] || 0); if (range) res.writeHead(206, { 'Content-Range': `bytes ${offset}-${bytes.length - 1}/${bytes.length}` }); res.end(bytes.subarray(offset)); }).listen(0,'127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve)); t.after(() => new Promise<void>(resolve => server.close(() => resolve())));
  const spec={url:`http://127.0.0.1:${(server.address() as any).port}`,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}; const file=path.join(root,'model');
  await fs.writeFile(file+'.partial',bytes.subarray(0,7)); await downloadArtifact(spec,file,new AbortController().signal,()=>{}); assert.equal(range,'bytes=7-'); assert.deepEqual(await fs.readFile(file),bytes);
  const corrupt=path.join(root,'corrupt'); await assert.rejects(downloadArtifact({...spec,sha256:'0'.repeat(64)},corrupt,new AbortController().signal,()=>{}),/checksum/); await assert.rejects(fs.stat(corrupt)); await assert.rejects(fs.stat(corrupt+'.partial'));
  const cancelled=path.join(root,'cancelled'); const controller=new AbortController(); controller.abort(); await assert.rejects(downloadArtifact(spec,cancelled,controller.signal,()=>{}),/abort/i);
});

test('an interrupted model download can resume and a complete partial file is verified without requesting bytes again', async t => {
  const {root} = await fixture(t); const {downloadArtifact} = await import('../server/modelDownload'); const http = await import('node:http');
  const bytes=Buffer.alloc(4096,65); let requests=0;
  const server=http.createServer((req,res)=>{ requests++; const offset=Number(req.headers.range?.match(/bytes=(\d+)-/)?.[1]||0); if(offset) res.writeHead(206,{'Content-Range':`bytes ${offset}-${bytes.length-1}/${bytes.length}`}); let next=offset;
    const timer=setInterval(()=>{ if(next>=bytes.length) {clearInterval(timer);res.end();return;} res.write(bytes.subarray(next,next+256));next+=256; },5); res.on('close',()=>clearInterval(timer));
  }).listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve)); t.after(()=>{server.closeAllConnections();server.close();});
  const spec={url:`http://127.0.0.1:${(server.address() as any).port}`,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')}; const file=path.join(root,'interrupted'); const controller=new AbortController();
  await assert.rejects(downloadArtifact(spec,file,controller.signal,(received)=>{if(received>=512)setTimeout(()=>controller.abort(),1);}),/abort/i);
  assert.ok((await fs.stat(file+'.partial')).size<bytes.length); await downloadArtifact(spec,file,new AbortController().signal,()=>{}); assert.deepEqual(await fs.readFile(file),bytes);
  const complete=path.join(root,'complete'); await fs.writeFile(complete+'.partial',bytes); const previous=requests; await downloadArtifact(spec,complete,new AbortController().signal,()=>{}); assert.equal(requests,previous); assert.deepEqual(await fs.readFile(complete),bytes);
});

test('commit context treats wildcard filenames literally and cannot include excluded secret diffs', async t => {
  const {repo,git}=await fixture(t);await fs.writeFile(path.join(repo,'*'),'public marker');await fs.writeFile(path.join(repo,'.env'),'PRIVATE_VALUE=fixture-hidden-value');await git('add','.');await git('commit','-m','fixture');const hash=(await git('rev-parse','HEAD')).stdout.trim();
  const context=await gatherContext([repo],'Explain this commit',hash);assert.match(context.text,/public marker/);assert.equal(context.text.includes('fixture-hidden-value'),false);
});

test('chat history keeps the newest messages within the budget', async () => {
  const { recentHistory } = await import('../server/copilotService');
  const messages = ['first', 'second', 'third'].map(content => ({ id: content, role: 'user' as const, content }));
  assert.equal(recentHistory(messages, 1000), 'user: first\nuser: second\nuser: third');
  assert.equal(recentHistory(messages, 25), 'user: second\nuser: third');
  assert.equal(recentHistory([{ id: 'x', role: 'assistant', content: 'y'.repeat(9000) }], 100000).length, 'assistant: '.length + 4000);
});

test('evidence budget scales with the available context', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs'); const { tmpdir } = await import('node:os'); const { join } = await import('node:path'); const { execFileSync } = await import('node:child_process');
  const repo = mkdtempSync(join(tmpdir(), 'gitmate-budget-')); execFileSync('git', ['init', '-q', repo]);
  writeFileSync(join(repo, 'README.md'), 'readme '.repeat(8000));
  const small = await gatherContext([repo], 'Summarize the readme'); const large = await gatherContext([repo], 'Summarize the readme', undefined, 60000);
  assert.ok(small.text.length <= 18000); assert.ok(large.text.length > small.text.length + 8000 && large.text.length <= 60000);
});
