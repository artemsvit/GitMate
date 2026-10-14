import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { thoughtFilter } from '../server/externalModels';
import { friendlyModelName } from '../src/aiEngine';

test('streamed thinking blocks are removed even when tags split across chunks', () => {
  const filter = thoughtFilter();
  const out = ['Hello <thi', 'nk>secret plan</th', 'ink> world', ' <think>more</think>!'].map(filter).join('');
  assert.equal(out, 'Hello  world !');
  assert.equal(thoughtFilter()('a < b and c > d'), 'a < b and c > d');
});

test('model names are short and friendly', () => {
  assert.equal(friendlyModelName('lmstudio-community/Qwen2.5-Coder-7B-Instruct-GGUF/qwen2.5-coder-7b-instruct-q4_k_m.gguf'), 'Qwen2.5 Coder 7B');
  assert.equal(friendlyModelName('qwen3:8b'), 'Qwen3 8B');
  assert.equal(friendlyModelName('mistral-small-3.2-24b-instruct-2506-mlx'), 'Mistral Small 24B');
  assert.equal(friendlyModelName('openai/gpt-oss-20b'), 'GPT OSS 20B');
});

test('local models can be chosen, listed, and deleted without touching other models', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-models-'));
  process.env.GITMATE_CONFIG_DIR = dir;
  const service = await import('../server/copilotService');
  const models = path.join(dir, 'models'); fs.mkdirSync(models);
  const light = service.modelCatalog.find(model => model.id === 'light')!; const balanced = service.modelCatalog.find(model => model.id === 'balanced')!;
  fs.writeFileSync(path.join(models, light.file), 'x'); fs.writeFileSync(path.join(models, balanced.file + '.partial'), 'xy');
  const listed = service.listModels();
  assert.deepEqual(listed.models.map(model => model.id), ['tiny', 'mini', 'light', 'balanced', 'powerful']);
  assert.deepEqual(listed.models.filter(model => model.active).map(model => model.id), ['light'], 'only a downloaded model is in use');
  assert.equal(listed.models.find(model => model.id === 'light')!.state, 'ready');
  assert.equal(listed.models.find(model => model.id === 'balanced')!.state, 'paused');
  assert.equal(listed.models.find(model => model.id === 'powerful')!.fits, os.totalmem() / 1024 ** 3 >= 31.5);
  await service.selectModel('light');
  assert.equal(service.activeModelSpec().id, 'light'); assert.equal(service.getModelStatus().label, 'Qwen3.5 4B');
  await assert.rejects(service.selectModel('huge'), /Unknown model/);
  await service.deleteModel('balanced');
  assert.equal(fs.existsSync(path.join(models, balanced.file + '.partial')), false); assert.equal(fs.existsSync(path.join(models, light.file)), true);
  const tiny = service.modelCatalog.find(model => model.id === 'tiny')!; fs.writeFileSync(path.join(models, tiny.file), 'x');
  await service.deleteModel('light'); assert.equal(service.listModels().models.find(model => model.id === 'light')!.state, 'missing');
  assert.equal(service.activeModelSpec().id, 'tiny', 'deleting the model in use moves to another downloaded model');
  await service.deleteModel('tiny');
  assert.deepEqual(service.listModels().models.filter(model => model.active), [], 'with nothing downloaded, no model is marked in use');
  assert.equal(service.listModels().models.filter(model => model.suggested).length, 1);
});

test('data from the earlier Gitler locations moves once and never overwrites new data', async () => {
  const { migrateLegacyStorage } = await import('../server/paths');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gitmate-home-'));
  const previous = process.env.GITMATE_CONFIG_DIR; delete process.env.GITMATE_CONFIG_DIR;
  try {
    fs.mkdirSync(path.join(home, '.gitler', 'models'), { recursive: true }); fs.writeFileSync(path.join(home, '.gitler', 'providers.json'), '{"a":1}');
    fs.mkdirSync(path.join(home, '.ssh')); fs.writeFileSync(path.join(home, '.ssh', 'gitler_ed25519'), 'old'); fs.writeFileSync(path.join(home, '.ssh', 'gitler_ed25519.pub'), 'old pub');
    fs.writeFileSync(path.join(home, '.ssh', 'gitmate_rsa'), 'new'); fs.writeFileSync(path.join(home, '.ssh', 'gitler_rsa'), 'stale');
    const moved = migrateLegacyStorage(home);
    assert.equal(fs.readFileSync(path.join(home, '.gitmate', 'providers.json'), 'utf8'), '{"a":1}'); assert.equal(fs.existsSync(path.join(home, '.gitler')), false);
    assert.equal(fs.readFileSync(path.join(home, '.ssh', 'gitmate_ed25519'), 'utf8'), 'old'); assert.equal(fs.readFileSync(path.join(home, '.ssh', 'gitmate_ed25519.pub'), 'utf8'), 'old pub');
    assert.equal(fs.readFileSync(path.join(home, '.ssh', 'gitmate_rsa'), 'utf8'), 'new', 'existing new data is kept'); assert.equal(fs.existsSync(path.join(home, '.ssh', 'gitler_rsa')), true);
    assert.equal(moved.length, 3); assert.deepEqual(migrateLegacyStorage(home), [], 'a second run moves nothing');
  } finally { if (previous !== undefined) process.env.GITMATE_CONFIG_DIR = previous; }
});

test('a custom data folder keeps SSH keys out of the real ~/.ssh', async () => {
  const { sshKeyPaths } = await import('../server/paths');
  const previous = process.env.GITMATE_CONFIG_DIR; process.env.GITMATE_CONFIG_DIR = '/tmp/gitmate-test-config';
  try {
    assert.equal(sshKeyPaths().ed25519, '/tmp/gitmate-test-config/ssh/gitmate_ed25519');
    delete process.env.GITMATE_CONFIG_DIR; assert.equal(sshKeyPaths().ed25519, path.join(os.homedir(), '.ssh', 'gitmate_ed25519'));
  } finally { if (previous === undefined) delete process.env.GITMATE_CONFIG_DIR; else process.env.GITMATE_CONFIG_DIR = previous; }
});
