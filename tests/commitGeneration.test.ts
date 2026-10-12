import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateEmbeddedCommit } from '../server/aiService';

test('commit generator handles artifact media files with topic detection', () => {
  const files = [
    '.codex/artifacts/web-actor-page.jpg',
    '.codex/artifacts/web-actor-flow.jpg',
    '.codex/artifacts/web-actor-run.jpg'
  ];
  const diff = 'diff --git a/image.jpg b/image.jpg\nnew file mode 100644\n';
  const msg = generateEmbeddedCommit(files, diff, 'Open-Pi');

  // Conventional format: chore(artifacts): add web actor preview artifacts
  assert.match(msg, /^feat\(artifacts\): add web actor preview artifacts/);
  assert.ok(msg.includes('- Add and update visual capture assets for web actor'));
  assert.ok(msg.includes('web-actor-page, web-actor-flow, web-actor-run'));

  // Subject line constraints
  const subjectLine = msg.split('\n')[0];
  assert.ok(subjectLine.length <= 72);
  assert.ok(!subjectLine.endsWith('.'));
});

test('commit generator formats UI fixes with appropriate scope and bullets', () => {
  const files = ['src/components/MainWorkspace.tsx'];
  const diff = `
@@ -395,3 +395,3 @@
-        <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
+        <div className="flex items-center gap-2.5 min-w-0 flex-1">
+          {/* fix dropdown clipping and dismiss */}
`;
  const msg = generateEmbeddedCommit(files, diff, 'Gitler');

  assert.match(msg, /^fix\(main-workspace\): resolve MainWorkspace interaction issues/);
  assert.ok(msg.includes('- Fix component behavior and edge-case handling in MainWorkspace'));

  const subjectLine = msg.split('\n')[0];
  assert.ok(subjectLine.length <= 72);
  assert.ok(!subjectLine.endsWith('.'));
});

test('commit generator formats documentation commits', () => {
  const files = ['README.md'];
  const diff = '+# Gitler Guide\n';
  const msg = generateEmbeddedCommit(files, diff, 'Gitler');

  assert.match(msg, /^docs\(readme\): update README\.md and specifications/);
  assert.ok(msg.includes('- Update project documentation in README.md'));
});

test('commit generator formats dependency and build updates', () => {
  const files = ['package.json', 'package-lock.json'];
  const diff = '+"lucide-react": "^1.55.0"\n';
  const msg = generateEmbeddedCommit(files, diff, 'Gitler');

  assert.match(msg, /^build\(deps\): update project dependencies and configuration/);
  assert.ok(msg.includes('- Synchronize package dependencies and build toolchain settings'));
});
