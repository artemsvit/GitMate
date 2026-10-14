import type { Express } from 'express';
import type { RepositoryAccess } from './security';
import { chat, getModelStatus, downloadModel, cancelModelDownload, listConversations, readConversation, deleteConversation, listModels, selectModel, deleteModel, modelCatalog } from './copilotService';
import { redactRemote } from './remoteSafety';
import { detectLocalAI } from './aiService';
export function installCopilotRoutes(app: Express, access: RepositoryAccess) {
  app.use('/api/copilot', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/copilot/model', (_req, res) => res.json(getModelStatus()));
  app.get('/api/copilot/models', (_req, res) => res.json(listModels()));
  app.post('/api/copilot/model/select', async (req, res) => { try { res.json(await selectModel(String(req.body?.id))); } catch (error: any) { res.status(400).json({ error: error.message }); } });
  app.delete('/api/copilot/model', async (req, res) => { try { res.json(await deleteModel(String(req.body?.id))); } catch (error: any) { res.status(400).json({ error: error.message }); } });
  app.post('/api/copilot/model/download', (req, res) => {
    const id = req.body?.id ? String(req.body.id) : undefined;
    if (id && !modelCatalog.some(spec => spec.id === id)) return res.status(400).json({ error: 'Unknown model.' });
    if (getModelStatus().state === 'unsupported') return res.status(400).json({ error: 'Copilot Chat requires macOS 14 or newer.' });
    if (listModels().models.some(model => model.state === 'downloading' || model.state === 'verifying')) return res.status(409).json({ error: 'A download is already running.' });
    void downloadModel(id).catch(() => {}); res.status(202).json(id ? listModels() : getModelStatus());
  });
  app.post('/api/copilot/model/cancel', (_req, res) => { cancelModelDownload(); res.json({ success: true }); });
  app.get('/api/copilot/conversations', (req, res) => { try {
    const repo = access.resolve(req.query.path);
    res.json(req.query.id ? readConversation(repo, String(req.query.id)) : listConversations(repo));
  } catch (error: any) { res.status(400).json({ error: error.message }); } });
  app.delete('/api/copilot/conversations', (req, res) => { try {
    deleteConversation(access.resolve(req.body.path), req.body.id); res.json({ success: true });
  } catch (error: any) { res.status(400).json({ error: error.message }); } });
  app.post('/api/copilot/chat', async (req, res) => {
    let repo: string; let repos: string[];
    try {
      repo = access.resolve(req.body.path);
      if (!Array.isArray(req.body.additionalRepos || []) || (req.body.additionalRepos || []).length > 200) throw new Error('Choose fewer repositories for chat context.');
      repos = [...new Set([repo, ...(req.body.additionalRepos || []).map((item: unknown) => access.resolve(item))])];
      if (typeof req.body.question !== 'string') throw new Error('A question is required.');
      if (req.body.engine !== undefined && (!['lmstudio', 'ollama'].includes(req.body.engine?.provider) || typeof req.body.engine?.model !== 'string' || !req.body.engine.model)) throw new Error('Choose an LM Studio or Ollama model in Settings → AI.');
    } catch (error: any) { res.status(403).json({ error: error.message }); return; }
    if (req.body.engine) {
      // Only models that run locally on the detected server are allowed.
      const sources = (await detectLocalAI('external')).externalSources || [];
      if (!sources.some(source => source.provider === req.body.engine.provider && source.models.includes(req.body.engine.model))) { res.status(400).json({ error: 'That model is not running locally. Choose a model in Settings → AI.' }); return; }
    }
    const controller = new AbortController(); res.on('close', () => controller.abort());
    res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Cache-Control', 'no-store'); res.flushHeaders();
    const emit = (event: object) => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
    try { await chat({ repo, repos, id: req.body.id, question: req.body.question, commit: req.body.commit, engine: req.body.engine, signal: controller.signal, emit }); }
    catch (error: any) { emit({ type: 'error', error: redactRemote(error.message || 'Copilot failed to answer.') }); }
    finally { res.end(); }
  });
}
