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
  process.env.GITLER_CONFIG_DIR = dir;
  const service = await import('../server/copilotService');
  const models = path.join(dir, 'models'); fs.mkdirSync(models);
  const light = service.modelCatalog.find(model => model.id === 'light')!; const balanced = service.modelCatalog.find(model => model.id === 'balanced')!;
  fs.writeFileSync(path.join(models, light.file), 'x'); fs.writeFileSync(path.join(models, balanced.file + '.partial'), 'xy');
  const listed = service.listModels();
  assert.deepEqual(listed.models.map(model => model.id), ['light', 'balanced', 'powerful']);
  assert.equal(listed.models.find(model => model.id === 'light')!.state, 'ready');
  assert.equal(listed.models.find(model => model.id === 'balanced')!.state, 'paused');
  assert.equal(listed.models.find(model => model.id === 'powerful')!.fits, os.totalmem() / 1024 ** 3 >= 31.5);
  await service.selectModel('light');
  assert.equal(service.activeModelSpec().id, 'light'); assert.equal(service.getModelStatus().label, 'Qwen3.5 4B');
  await assert.rejects(service.selectModel('huge'), /Unknown model/);
  await service.deleteModel('balanced');
  assert.equal(fs.existsSync(path.join(models, balanced.file + '.partial')), false); assert.equal(fs.existsSync(path.join(models, light.file)), true);
  await service.deleteModel('light'); assert.equal(service.listModels().models.find(model => model.id === 'light')!.state, 'missing');
});
