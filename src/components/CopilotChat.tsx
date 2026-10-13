import { useCallback, useEffect, useRef, useState } from 'react';
import { Send, Square, Copy, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../api';
import { RepoSummary } from '../types';
import { Dropdown } from './Dropdown';
interface Message { id: string; role: 'user' | 'assistant'; content: string; sources?: { repository: string; file?: string; commit?: string; kind: string }[]; truncated?: boolean; stopped?: boolean }
interface Conversation { id: string; title: string; messages: Message[] }
interface ModelStatus { state: string; downloaded: number; size: number; model: string; error?: string }
export function CopilotChat({ repo, repositories }: { repo: RepoSummary; repositories: RepoSummary[] }) {
  const [model, setModel] = useState<ModelStatus | null>(null);
  const [history, setHistory] = useState<Conversation[]>([]);
  const [id, setId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [additional, setAdditional] = useState<string[]>([]);
  const [commit, setCommit] = useState('');
  const controller = useRef<AbortController | null>(null);
  const scrollEnd = useRef<HTMLDivElement>(null);
  const refreshHistory = useCallback(async (signal?: AbortSignal) => {
    const res = await apiFetch(`/api/copilot/conversations?path=${encodeURIComponent(repo.path)}`, { signal });
    if (!res.ok) throw new Error('Could not load saved chats.'); const data = await res.json(); if (!signal?.aborted) setHistory(data);
  }, [repo.path]);
  const refreshModel = useCallback(async (signal: AbortSignal) => {
    try { const res = await apiFetch('/api/copilot/model', { signal }); const data = await res.json(); if (res.ok && !signal.aborted) setModel(data); } catch {}
  }, []);
  useEffect(() => {
    const lifetime = new AbortController();
    void refreshModel(lifetime.signal); void refreshHistory(lifetime.signal).catch(error => { if (!lifetime.signal.aborted) setError(error.message); });
    const timer = setInterval(() => refreshModel(lifetime.signal), 2000);
    return () => { lifetime.abort(); controller.current?.abort(); clearInterval(timer); };
  }, [refreshModel, refreshHistory]);
  useEffect(() => { scrollEnd.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);
  const modelAction = async (action: string) => { try { setError(''); const res = await apiFetch('/api/copilot/model/' + action, { method: 'POST' }); const data = await res.json(); if (!res.ok) throw new Error(data.error); if (action === 'download') setModel(data); } catch (error: any) { setError(error.message); } };
  const send = async (text = question) => {
    if (!text.trim() || busy) return;
    const abort = new AbortController(); controller.current = abort; setBusy(true); setError(''); setQuestion('');
    setMessages(previous => [...previous, { id: crypto.randomUUID(), role: 'user', content: text }, { id: crypto.randomUUID(), role: 'assistant', content: '' }]);
    try {
      const res = await apiFetch('/api/copilot/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: abort.signal, body: JSON.stringify({ path: repo.path, additionalRepos: additional, id: id || undefined, question: text, commit: commit || undefined }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
      const reader = res.body?.getReader(); if (!reader) throw new Error('The reply stream is unavailable.');
      const decoder = new TextDecoder(); let pending = '';
      const consume = (line: string) => {
        if (!line.trim()) return; const event = JSON.parse(line);
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'context') { setId(event.conversationId); setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, sources: event.sources, truncated: event.truncated } : message)); }
        if (event.type === 'text') setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, content: message.content + event.text } : message));
        if (event.type === 'done') { setId(event.conversation.id); setMessages(event.conversation.messages); }
      };
      while (true) { const { value, done } = await reader.read(); if (done) break; pending += decoder.decode(value, { stream: true }); const lines = pending.split('\n'); pending = lines.pop() || ''; lines.forEach(consume); }
      pending += decoder.decode(); if (pending.trim()) consume(pending);
      await refreshHistory();
    } catch (error: any) {
      if (abort.signal.aborted) setMessages(previous => previous.map((message, index) => index === previous.length - 1 ? { ...message, stopped: true } : message));
      else setError(error.message || 'Could not answer.');
    } finally { setBusy(false); controller.current = null; }
  };
  const openHistory = async (value: string) => { try { const res = await apiFetch(`/api/copilot/conversations?path=${encodeURIComponent(repo.path)}&id=${value}`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setId(value); setMessages(data.messages); setError(''); } catch (error: any) { setError(error.message); } };
  const removeChat = async () => { try { const res = await apiFetch('/api/copilot/conversations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repo.path, id }) }); if (!res.ok) throw new Error('Could not delete chat.'); setId(''); setMessages([]); await refreshHistory(); } catch (error: any) { setError(error.message); } };
  const additionalSet = new Set(additional);
  const ready = ['ready', 'loaded', 'loading'].includes(model?.state || '');
  return <section aria-label="Copilot chat" className="flex flex-col gap-3 min-h-0 text-xs select-text">
    <div className="flex items-center gap-2"><div className="flex-1 min-w-0"><Dropdown label="Saved conversations" value={id} placeholder="New conversation" options={history.map(chat => ({ value: chat.id, label: chat.title, disabled: busy }))} onChange={openHistory} /></div><button disabled={busy} aria-label="New chat" title="New chat" onClick={() => { setId(''); setMessages([]); setError(''); }} className="p-1.5 text-[var(--text-muted)]"><Plus className="w-4 h-4" /></button>{id && <button disabled={busy} aria-label="Delete chat" title="Delete chat" onClick={removeChat} className="p-1.5 text-[var(--text-muted)]"><Trash2 className="w-3.5 h-3.5" /></button>}</div>
    {!ready && <div className="p-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2"><p className="font-medium text-[var(--text-primary)]">Local Copilot model</p><p className="text-[var(--text-muted)]">Download Qwen3-4B once (2.5 GB). Your code and conversations stay on this Mac.</p>{model && <><p className="text-[var(--text-muted)]">{model.state} · {(model.downloaded / 1e9).toFixed(2)} / 2.50 GB</p><progress aria-label="Model download progress" className="w-full accent-[var(--accent-violet)]" value={model.downloaded} max={model.size} />{model.error && <p className="text-rose-600">{model.error}</p>}</>}<button onClick={() => modelAction(['downloading', 'verifying'].includes(model?.state || '') ? 'cancel' : 'download')} className="px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-[var(--text-primary)]">{['downloading', 'verifying'].includes(model?.state || '') ? 'Cancel download' : model?.downloaded ? 'Resume / retry download' : 'Download model'}</button></div>}
    <p className="text-[10px] text-[var(--text-muted)]">Context: {repo.name} · Read-only assistance</p>
    <Dropdown label="Additional repository context" multiple value={additional} options={repositories.filter(item => item.path !== repo.path).map(item => ({ value: item.path, label: item.name, disabled: busy || (!additionalSet.has(item.path) && additional.length >= 3) }))} onChange={value => setAdditional(previous => previous.includes(value) ? previous.filter(item => item !== value) : [...previous, value])} placeholder="Add repository context" />
    <input aria-label="Commit to explain" placeholder="Optional commit hash to explain" value={commit} disabled={busy} onChange={event => setCommit(event.target.value)} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-full px-3 py-1.5 text-xs text-[var(--text-primary)]" />
    <div role="log" aria-label="Conversation" className="space-y-3 max-h-[50vh] overflow-y-auto">
      {!messages.length && <div className="space-y-2"><p className="text-[var(--text-muted)]">Ask about changes, code, history, or repository setup.</p>{['Review changes', 'Summarize this repository', 'Explain a commit'].map(text => <button key={text} disabled={!ready || busy} onClick={() => text === 'Explain a commit' && !commit ? setQuestion('Explain the latest commit briefly.') : send(text)} className="block w-full text-left px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-[var(--text-primary)] hover:bg-[var(--bg-card)] disabled:opacity-40">{text}</button>)}</div>}
      {messages.map((message, index) => <article key={message.id} className={`p-3 rounded-2xl border border-[var(--border-subtle)] ${message.role === 'user' ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-surface)]'}`}><div className="flex justify-between items-center mb-2"><span className="text-[10px] font-semibold text-[var(--accent-violet)]">{message.role === 'user' ? 'You' : 'Copilot'}</span>{message.content && <button aria-label="Copy message" onClick={() => navigator.clipboard.writeText(message.content).catch(() => setError('Could not copy the message.'))} className="text-[var(--text-muted)]"><Copy className="w-3 h-3" /></button>}</div><p className="whitespace-pre-wrap break-words text-[var(--text-primary)] leading-relaxed">{message.content || (busy ? 'Preparing an answer…' : 'No answer.')}</p>{message.stopped && <p className="text-[var(--text-muted)] mt-2">Reply stopped</p>}{message.truncated && <p className="text-amber-600 mt-2">Context is limited. Ask about a specific file or commit for more detail.</p>}{message.sources?.length ? <details className="mt-2 text-[10px] text-[var(--text-muted)]"><summary>Context sources ({message.sources.length})</summary>{message.sources.map(source => <p key={`${source.repository}:${source.file || source.commit || source.kind}:${source.kind}`} className="break-all mt-1">{source.repository.split('/').pop()}: {source.file || source.commit?.slice(0, 7) || source.kind}</p>)}</details> : null}</article>)}<div ref={scrollEnd} />
    </div>
    {error && <p role="alert" className="text-rose-600 dark:text-rose-300">{error}</p>}
    <form onSubmit={event => { event.preventDefault(); void send(); }} className="space-y-2"><textarea aria-label="Ask Copilot" value={question} maxLength={8000} rows={3} placeholder="Ask about this repository…" onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} className="w-full bg-[var(--bg-surface)] border border-[var(--border-interactive)] focus:border-[var(--accent-violet)] rounded-xl p-3 text-xs text-[var(--text-primary)] focus:outline-none resize-y" />{busy ? <button type="button" onClick={() => controller.current?.abort()} className="w-full flex justify-center gap-2 py-2 rounded-full border border-[var(--border-interactive)] text-[var(--text-primary)]"><Square className="w-3.5 h-3.5" />Stop reply</button> : <button type="submit" disabled={!ready || !question.trim()} className="w-full flex justify-center gap-2 py-2 rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] disabled:opacity-30"><Send className="w-3.5 h-3.5" />Send</button>}</form>
  </section>;
}
