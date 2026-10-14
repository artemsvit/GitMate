import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateEmbeddedCommit } from '../server/aiService';
import { buildCommitPrompt, commitInstructions, finalizeCommitMessage, prepareDiff, splitDiff, usesConventionalCommits } from '../server/commitMessage';

const fileDiff = (file: string, body: string, mode = '') => `diff --git a/${file} b/${file}\n${mode}--- a/${file}\n+++ b/${file}\n${body}`;

test('fallback suggestions keep the header format and list only real file facts', () => {
  const media = generateEmbeddedCommit(['.codex/artifacts/web-actor-page.jpg', '.codex/artifacts/web-actor-run.jpg'], ['web-actor-page', 'web-actor-run'].map(name => `diff --git a/.codex/artifacts/${name}.jpg b/.codex/artifacts/${name}.jpg\nnew file mode 100644\nBinary files /dev/null and b/.codex/artifacts/${name}.jpg differ\n`).join(''), 'Open-Pi');
  assert.equal(media, 'feat(artifacts): add web actor preview artifacts\n\n- Add .codex/artifacts/web-actor-page.jpg\n- Add .codex/artifacts/web-actor-run.jpg');
  assert.equal(generateEmbeddedCommit(['README.md'], '+# Guide\n', 'Git Mate'), 'docs(readme): update README.md');
  const deps = generateEmbeddedCommit(['package.json', 'package-lock.json'], fileDiff('package.json', '-"a": "1"\n+"a": "2"\n') + fileDiff('package-lock.json', '+x\n'), 'Git Mate');
  assert.equal(deps, 'build(deps): update project dependencies and configuration\n\n- Change package.json (+1 -1)\n- Change package-lock.json (+1 -0)');
  const ui = generateEmbeddedCommit(['src/components/MainWorkspace.tsx'], '+  {/* fix dropdown clipping */}\n', 'Git Mate');
  assert.equal(ui, 'fix(main-workspace): resolve MainWorkspace interaction issues', 'a single-file change has no invented body');
  for (const message of [media, deps, ui]) { const header = message.split('\n')[0]; assert.ok(header.length <= 72 && !header.endsWith('.')); }
});

test('fallback suggestions no longer contain Git Mate-specific or invented sentences', () => {
  const message = generateEmbeddedCommit(['package.json', 'electron-builder.yml'], fileDiff('package.json', '+"electron": "43"\n'), 'Other');
  assert.doesNotMatch(message, /Electron packaging|hardened runtime|SSH key|Clarify system instructions/);
});

test('diff preparation omits lock and binary content and shares space fairly', () => {
  const diff = fileDiff('src/a.ts', '+' + 'a'.repeat(20000) + '\n') + fileDiff('src/b.ts', '+small change\n') + fileDiff('package-lock.json', '+lock\n') + 'diff --git a/logo.png b/logo.png\nBinary files a/logo.png and b/logo.png differ\n';
  assert.deepEqual(splitDiff(diff).map(file => [file.path, file.skipped, file.binary]), [['src/a.ts', false, false], ['src/b.ts', false, false], ['package-lock.json', true, false], ['logo.png', false, true]]);
  const prepared = prepareDiff(diff, 6000);
  assert.ok(prepared.truncated); assert.ok(prepared.text.includes('+small change'), 'a large file cannot hide a small one');
  assert.ok(!prepared.text.includes('+lock')); assert.match(prepared.summary, /package-lock\.json \(\+1 -0\) generated or lock file/); assert.match(prepared.summary, /logo\.png .* binary/);
  const prompt = buildCommitPrompt({ repoName: 'demo', diff, changedFiles: [], recentSubjects: ['feat(ui): add zoom levels'], budget: 6000 });
  assert.ok(prompt.includes("never reuse their wording:\n- feat(ui): add zoom levels")); assert.ok(prompt.length < 8000);
  assert.match(commitInstructions, /imperative mood/); assert.match(commitInstructions, /Never invent/); assert.match(commitInstructions, /BREAKING CHANGE/);
});

test('model output is cleaned into a well-formed commit message', () => {
  assert.equal(finalizeCommitMessage('<think>x</think>\n```\nFeat(ui): Add zoom shortcuts.\nAdds keyboard shortcuts.\n```'), 'feat(ui): add zoom shortcuts\n\nAdds keyboard shortcuts.');
  assert.equal(finalizeCommitMessage('Commit message:\n"fix: handle empty remotes"'), 'fix: handle empty remotes');
  const long = finalizeCommitMessage('feat(copilot): use the larger on-device model for commit message generation everywhere in the app\n\n- ' + 'word '.repeat(30).trim());
  const [header, blank, ...body] = long.split('\n');
  assert.ok(header.length <= 72 && !/\s$/.test(header)); assert.equal(blank, '');
  assert.ok(body.every(line => line.length <= 72)); assert.ok(body[0].startsWith('- ') && body[1].startsWith('  '));
  assert.equal(finalizeCommitMessage('feat!: drop Node 18\n\nBREAKING CHANGE: Node 20 or newer is required to run the server from now on and later.'), 'feat!: drop Node 18\n\nBREAKING CHANGE: Node 20 or newer is required to run the server from now on and later.');
});

test('repository convention is detected and model output is reduced to one message', () => {
  assert.equal(usesConventionalCommits(['feat: a', 'fix(ui): b', 'Release 1.0', 'chore: c']), true);
  assert.equal(usesConventionalCommits(['Keep previews loading', 'Make shelf smoother', 'Release Clipso 1.1.17', 'fix: a']), false);
  assert.match(buildCommitPrompt({ repoName: 'c', diff: '', changedFiles: ['a'], recentSubjects: ['Keep previews loading', 'Make shelf smoother', 'Cut sync cost'] }), /does not use Conventional Commits/);
  assert.doesNotMatch(buildCommitPrompt({ repoName: 'c', diff: '', changedFiles: ['a'], recentSubjects: ['feat: a', 'fix: b', 'docs: c'] }), /does not use Conventional Commits/);
  assert.equal(finalizeCommitMessage('perf(LinkSnapshotRenderer): limit renders\n\nFirst body.\n\nfix(ShelfView): handle scroll end\n\nSecond body.'), 'perf(link-snapshot-renderer): limit renders\n\nFirst body.');
  assert.equal(finalizeCommitMessage('feat(Core): add `legacySeparator` support'), 'feat(core): add `legacySeparator` support');
  assert.equal(finalizeCommitMessage('fix: x\n\n- Use `--literal-pathspecs` for git show'), 'fix: x\n\n- Use --literal-pathspecs for git show');
});

test('a shortened header never ends on a connecting word', () => {
  const header = finalizeCommitMessage('feat(push-status): add commit notice tracking and verification for retried pushes in the copilot panel');
  assert.ok(header.length <= 72); assert.doesNotMatch(header, /\s(?:for|and|to|of|in)$/);
  assert.equal(header, 'feat(push-status): add commit notice tracking and verification');
});

test('a long header is shortened at a clause boundary', () => {
  assert.equal(finalizeCommitMessage('Keep shelf previews loading after scrolling by deferring periodic iCloud sync passes'), 'Keep shelf previews loading after scrolling');
});
