import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { layoutGraph } from '../src/graphLayout';
import { getCommitDetails, getCommitFileDiff, getGraph, parseRefs } from '../server/graphService';
const run = promisify(execFile);

test('graph layout keeps a straight line, opens a lane for a branch, and joins it at the merge', () => {
  // M merges F into C; F and C both come from B; B from A.
  const { rows, lanes } = layoutGraph([
    { hash: 'M', parents: ['C', 'F'] }, { hash: 'F', parents: ['B'] }, { hash: 'C', parents: ['B'] }, { hash: 'B', parents: ['A'] }, { hash: 'A', parents: [] }
  ]);
  assert.equal(lanes, 2);
  assert.deepEqual(rows.map(row => row.lane), [0, 1, 0, 0, 0]);
  assert.deepEqual(rows[0].segments.filter(segment => segment.half === 'bottom').map(segment => segment.to), [0, 1], 'the merge draws to both parents');
  assert.ok(rows[1].segments.some(segment => segment.half === 'full' && segment.from === 0), 'the main line passes the branch commit');
  assert.ok(rows[3].segments.some(segment => segment.half === 'top' && segment.from === 1 && segment.to === 0), 'the branch joins the main lane at the shared parent');
  assert.ok(rows[2].segments.some(segment => segment.half === 'full' && segment.from === 1), 'the branch line passes the main commit');
  assert.equal(rows[4].segments.filter(segment => segment.half === 'bottom').length, 0, 'the root commit has no line below');
  assert.notEqual(rows[0].color, rows[1].color, 'the branch has its own color');
});

test('graph service lists commits, refs, details, and file diffs for a real repository', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-graph-'));
  const git = (...args: string[]) => run('git', ['-C', repo, '-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args]);
  await git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'one\n'); await git('add', '.'); await git('commit', '-q', '-m', 'first');
  await git('checkout', '-q', '-b', 'feature'); fs.writeFileSync(path.join(repo, 'b.txt'), 'two\n'); await git('add', '.'); await git('commit', '-q', '-m', 'feature work');
  await git('checkout', '-q', 'main'); fs.appendFileSync(path.join(repo, 'a.txt'), 'more\n'); await git('commit', '-q', '-am', 'main work');
  await git('merge', '-q', '--no-ff', '-m', 'merge feature', 'feature'); await git('tag', 'v1');
  const graph = await getGraph(repo);
  assert.deepEqual(graph.branches.sort(), ['feature', 'main']);
  assert.equal(graph.commits[0].subject, 'merge feature'); assert.equal(graph.commits[0].parents.length, 2); assert.equal(graph.commits[0].author, 'Ada');
  assert.deepEqual(graph.commits[0].refs.map(ref => ref.type).sort(), ['branch', 'head', 'tag']);
  assert.equal((await getGraph(repo, { branch: 'feature' })).commits.length, 2);
  await assert.rejects(getGraph(repo, { branch: '--all' }), /Unknown branch/);
  const merge = await getCommitDetails(repo, graph.commits[0].hash);
  assert.deepEqual(merge.files.map(file => file.path), ['b.txt'], 'a merge shows what it brought in');
  assert.match(await getCommitFileDiff(repo, graph.commits[0].hash, 'b.txt'), /\+two/);
  await assert.rejects(getCommitFileDiff(repo, graph.commits[0].hash, '../etc/passwd'), /not part of this commit/);
  await assert.rejects(getCommitDetails(repo, '--help'), /Invalid commit/);
  assert.deepEqual(parseRefs('HEAD -> main, origin/main, origin/HEAD, tag: v2', ['origin']), [
    { name: 'HEAD', type: 'head' }, { name: 'main', type: 'branch' }, { name: 'origin/main', type: 'remote' }, { name: 'v2', type: 'tag' }
  ]);
});

test('choosing a remote branch creates a local tracking branch once', async () => {
  const { checkout, getRepoDetails } = await import('../server/gitService');
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-origin-')); const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-clone-'));
  const git = (dir: string, ...args: string[]) => run('git', ['-C', dir, '-c', 'user.name=Ada', '-c', 'user.email=ada@example.com', ...args]);
  await git(origin, 'init', '-q', '-b', 'main'); fs.writeFileSync(path.join(origin, 'a.txt'), 'a'); await git(origin, 'add', '.'); await git(origin, 'commit', '-q', '-m', 'a');
  await git(origin, 'branch', 'feature');
  await run('git', ['clone', '-q', origin, clone]);
  const before = await getRepoDetails(clone);
  assert.ok(before.branches.remote.some((name: string) => name.endsWith('origin/feature')));
  assert.equal(await checkout(clone, 'origin/feature', false, true), 'Switched to feature');
  assert.equal((await git(clone, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')).stdout.trim(), 'origin/feature');
  await git(clone, 'checkout', '-q', 'main');
  assert.equal(await checkout(clone, 'origin/feature', false, true), 'Switched to feature', 'an existing local branch is reused');
  await assert.rejects(checkout(clone, 'origin/missing', false, true), /Unknown remote branch/);
});
