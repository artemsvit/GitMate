import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveDestinations, destinationStatus, type PushDestination } from '../src/useRepositoryPush';
const remote = (name: string, ...pushUrls: string[]) => ({ name, fetchUrl: pushUrls[0], pushUrl: pushUrls[0], pushUrls, hasEmbeddedCredentials: false });
test('without a saved choice every push URL of the preferred remote is selected, like git push', () => {
  const repo = { remotes: [remote('origin', 'git@a:x.git', 'git@b:x.git'), remote('mirror', 'git@c:x.git')], sync: { pushRemote: 'origin' } };
  const { all, destinations, stale } = resolveDestinations(repo, undefined);
  assert.equal(all.length, 3); assert.equal(stale, false);
  assert.deepEqual(destinations.map(target => target.url), ['git@a:x.git', 'git@b:x.git']);
});
test('a saved choice across two remotes is kept, and a changed URL marks it stale instead of dropping it silently', () => {
  const saved: PushDestination[] = [{ remote: 'origin', pushIndex: 0, url: 'https://a/x.git' }, { remote: 'mirror', pushIndex: 0, url: 'git@c:x.git' }];
  const before = resolveDestinations({ remotes: [remote('origin', 'https://a/x.git'), remote('mirror', 'git@c:x.git')], sync: {} }, saved);
  assert.equal(before.destinations.length, 2); assert.equal(before.stale, false);
  const after = resolveDestinations({ remotes: [remote('origin', 'git@a:x.git'), remote('mirror', 'git@c:x.git')], sync: {} }, saved);
  assert.equal(after.stale, true); assert.deepEqual(after.destinations.map(target => target.remote), ['mirror']);
});
test('each destination shows what a push would do, and extra push URLs show nothing they cannot know', () => {
  const repo = { remotes: [
    { ...remote('origin', 'git@a:x.git', 'git@b:x.git'), branch: { ahead: 2, behind: 0 } },
    { ...remote('mirror', 'git@c:x.git'), branch: null },
    { ...remote('backup', 'git@d:x.git'), branch: { ahead: 0, behind: 3 } },
    { ...remote('same', 'git@e:x.git'), branch: { ahead: 0, behind: 0 } }] };
  const label = (name: string, url: string, pushIndex = 0) => destinationStatus(repo, { remote: name, pushIndex, url })?.label;
  assert.equal(label('origin', 'git@a:x.git'), '2 to push');
  assert.equal(label('origin', 'git@b:x.git', 1), undefined);
  assert.equal(label('mirror', 'git@c:x.git'), 'new branch');
  assert.equal(label('backup', 'git@d:x.git'), '3 to pull');
  assert.equal(label('same', 'git@e:x.git'), 'up to date');
});
