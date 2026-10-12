import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readProvidersConfig,
  writeProvidersConfig,
  getProvidersStatus,
  disconnectProvider
} from '../server/providerService';

test('providerService persists and sanitizes provider configuration', async t => {
  const initial = readProvidersConfig();
  t.after(() => writeProvidersConfig(initial));

  writeProvidersConfig({
    github: {
      connected: true,
      username: 'octocat',
      displayName: 'The Octocat',
      token: 'secret-token-123',
      authMethod: 'token',
      instanceUrl: 'https://github.com'
    },
    gitea: {
      connected: true,
      username: 'giteauser',
      displayName: 'Gitea User',
      token: 'gitea-secret-456',
      authMethod: 'token',
      instanceUrl: 'http://192.168.0.102:3000',
      sshKeySynced: true
    }
  });

  const status = await getProvidersStatus();
  assert.equal(status.github.connected, true);
  assert.equal(status.github.username, 'octocat');
  // Token must not be leaked in status
  assert.equal((status.github as any).token, undefined);

  assert.equal(status.gitea.connected, true);
  assert.equal(status.gitea.username, 'giteauser');
  assert.equal(status.gitea.sshKeySynced, true);
  assert.equal((status.gitea as any).token, undefined);

  await disconnectProvider('github');
  const afterDisconnect = await getProvidersStatus();
  assert.equal(afterDisconnect.github.connected, false);
});
