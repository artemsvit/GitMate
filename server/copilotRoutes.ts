import type { Express } from 'express';
import type { RepositoryAccess } from './security';
import { chat, getModelStatus, downloadModel, cancelModelDownload, listConversations, readConversation, deleteConversation } from './copilotService';
import { redactRemote } from './remoteSafety';
export function installCopilotRoutes(app: Express, access: RepositoryAccess) {
  app.use('/api/copilot', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  app.get('/api/copilot/model', (_req, res) => res.json(getModelStatus()));
  app.post('/api/copilot/model/download', (_req, res) => {
    if (getModelStatus().state === 'unsupported') return res.status(400).json({ error: 'Copilot Chat requires macOS 14 or newer.' });
    if (getModelStatus().state === 'downloading' || getModelStatus().state === 'verifying') return res.status(409).json({ error: 'A download is already running.' });
    void downloadModel().catch(() => {}); res.status(202).json(getModelStatus());
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
      if (!Array.isArray(req.body.additionalRepos || []) || (req.body.additionalRepos || []).length > 3) throw new Error('Choose at most three additional repositories.');
      repos = [...new Set([repo, ...(req.body.additionalRepos || []).map((item: unknown) => access.resolve(item))])];
      if (typeof req.body.question !== 'string') throw new Error('A question is required.');
    } catch (error: any) { res.status(403).json({ error: error.message }); return; }
    const controller = new AbortController(); res.on('close', () => controller.abort());
    res.setHeader('Content-Type', 'application/x-ndjson'); res.setHeader('Cache-Control', 'no-store'); res.flushHeaders();
    const emit = (event: object) => { if (!res.destroyed) res.write(JSON.stringify(event) + '\n'); };
    try { await chat({ repo, repos, id: req.body.id, question: req.body.question, commit: req.body.commit, signal: controller.signal, emit }); }
    catch (error: any) { emit({ type: 'error', error: redactRemote(error.message || 'Copilot failed to answer.') }); }
    finally { res.end(); }
  });
}
