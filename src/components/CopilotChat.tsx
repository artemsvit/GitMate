import Markdown from 'react-markdown';
import { cn } from '../cn';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Send, Square, Copy, Plus, Trash2, History, SlidersHorizontal, Sparkles, GitCommit } from 'lucide-react';
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
  const scrollArea = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const followBottom = useRef(true);
  const historyMenu = useRef<HTMLDetailsElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const deleteId = useRef('');
  const deleteTitle = useId();
  const deleteDescription = useId();
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
  useEffect(() => { if (followBottom.current && scrollArea.current) scrollArea.current.scrollTop = scrollArea.current.scrollHeight; }, [messages]);
  const modelAction = async (action: string) => { try { setError(''); const res = await apiFetch('/api/copilot/model/' + action, { method: 'POST' }); const data = await res.json(); if (!res.ok) throw new Error(data.error); if (action === 'download') setModel(data); } catch (error: any) { setError(error.message); } };
  const send = async (text = question) => {
    if (!text.trim() || busy || !ready) return;
    followBottom.current = true;
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
  const openHistory = async (value: string) => { try { const res = await apiFetch(`/api/copilot/conversations?path=${encodeURIComponent(repo.path)}&id=${value}`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setId(value); setMessages(data.messages); setError(''); followBottom.current = true; if (historyMenu.current) historyMenu.current.open = false; } catch (error: any) { setError(error.message); } };
  const removeChat = async (target: string) => { try { const res = await apiFetch('/api/copilot/conversations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repo.path, id: target }) }); if (!res.ok) throw new Error('Could not delete chat.'); if (target === id) { setId(''); setMessages([]); } await refreshHistory(); } catch (error: any) { setError(error.message); } };
  const additionalSet = new Set(additional);
  const ready = ['ready', 'loaded', 'loading'].includes(model?.state || '');
  const suggest = (text: string) => { setQuestion(text); composer.current?.focus(); };
  return <section role="tabpanel" aria-label="Copilot chat" className="flex-1 min-h-0 flex flex-col overflow-hidden text-xs select-text">
    <div className="px-4 py-2 flex items-center justify-between gap-2 shrink-0 border-b border-[var(--border-subtle)]">
      <span className="truncate text-[11px] text-[var(--text-muted)]" title={repo.path}>{repo.name}</span>
      <div className="flex items-center gap-1 shrink-0">
        <details ref={historyMenu} className="relative">
          <summary aria-label="Chat history" title="Chat history" className="list-none [&::-webkit-details-marker]:hidden cursor-pointer p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"><History className="size-3.5" /></summary>
          <div className="absolute right-0 top-full z-40 mt-2 w-64 max-w-[80vw] max-h-72 overflow-y-auto rounded-2xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] p-2">
            <p className="text-[10px] text-[var(--text-muted)] px-2 py-1">Saved on this Mac</p>
            {!history.length && <p className="p-2 text-[var(--text-muted)]">No saved conversations yet.</p>}
            {history.map(chat => <div key={chat.id} className="flex items-center gap-1 rounded-xl hover:bg-[var(--bg-card)]">
              <button disabled={busy} onClick={() => openHistory(chat.id)} title={chat.title} className={cn('flex-1 min-w-0 text-left px-2 py-2 truncate disabled:opacity-40', chat.id === id ? 'text-[var(--accent-violet)]' : 'text-[var(--text-primary)]')}>{chat.title}</button>
              <button disabled={busy} aria-label={`Delete chat: ${chat.title}`} onClick={() => { deleteId.current = chat.id; deleteDialog.current?.showModal(); }} className="p-1.5 text-[var(--text-muted)] hover:text-rose-500"><Trash2 className="size-3" /></button>
            </div>)}
          </div>
        </details>
        <button disabled={busy} aria-label="New chat" title="New chat" onClick={() => { setId(''); setMessages([]); setError(''); followBottom.current = true; composer.current?.focus(); }} className="p-1.5 rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)] disabled:opacity-40"><Plus className="size-3.5" /></button>
      </div>
    </div>

    <div ref={scrollArea} role="log" aria-label="Conversation" aria-busy={busy} onScroll={() => { const area = scrollArea.current; if (area) followBottom.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80; }} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4">
      {model?.state === 'unsupported' && <p className="text-pretty text-[var(--text-muted)]">{model.error}</p>}
      {!ready && model?.state !== 'unsupported' && <div className="p-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
        <p className="font-medium text-balance text-[var(--text-primary)]">Set up local Copilot</p>
        <p className="text-pretty text-[var(--text-muted)]">Download Qwen3-4B once (2.5 GB). Your code and chats stay on this Mac.</p>
        {model && <><p className="text-[var(--text-muted)] tabular-nums">{model.state} · {(model.downloaded / 1e9).toFixed(2)} / 2.50 GB</p><progress aria-label="Model download progress" className="w-full accent-[var(--accent-violet)]" value={model.downloaded} max={model.size} />{model.error && <p className="text-rose-600">{model.error}</p>}</>}
        <button onClick={() => modelAction(['downloading', 'verifying'].includes(model?.state || '') ? 'cancel' : 'download')} className="px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-[var(--text-primary)]">{['downloading', 'verifying'].includes(model?.state || '') ? 'Cancel download' : model?.downloaded ? 'Resume download' : 'Download model'}</button>
      </div>}
      {!messages.length && ready && <div className="flex-1 flex flex-col justify-center items-start gap-3 pb-8">
        <Sparkles className="size-5 text-[var(--accent-violet)]" />
        <h3 className="text-sm font-semibold text-balance text-[var(--text-primary)]">What would you like to understand?</h3>
        <p className="text-xs text-pretty text-[var(--text-muted)]">Ask about {repo.name}, its changes, or a commit.</p>
        <div className="flex flex-wrap gap-2">{[['Review changes', 'Review the current changes and point out potential problems.'], ['Summarize project', 'Summarize this repository briefly.'], ['Explain latest commit', 'Explain the latest commit briefly.']].map(([label, text]) => <button key={label} onClick={() => suggest(text)} className="px-2.5 py-1.5 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-surface)]">{label}</button>)}</div>
      </div>}
      {messages.map(message => <article key={message.id} className={cn('min-w-0', message.role === 'user' ? 'self-end max-w-[90%] rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2.5' : 'w-full')}>
        {message.role === 'assistant' && <div className="flex items-center justify-between gap-2 mb-1.5"><span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)]"><Sparkles className="size-3 text-[var(--accent-violet)]" />Copilot</span>{message.content && <button aria-label="Copy reply" title="Copy reply" onClick={() => navigator.clipboard.writeText(message.content).catch(() => setError('Could not copy the reply.'))} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><Copy className="size-3" /></button>}</div>}
        <div className="text-[var(--text-primary)] text-xs leading-relaxed break-words [&_p]:my-1.5 [&_p]:text-pretty [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-1 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:rounded-lg [&_pre]:bg-[var(--bg-surface)] [&_pre]:p-2 [&_code]:font-mono [&_code]:text-[11px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:text-balance [&_h2]:text-balance [&_h3]:text-balance">
          {message.content ? <Markdown components={{ img: () => null, a: ({ href, children }) => href && /^https?:\/\//.test(href) ? <a href={href} target="_blank" rel="noreferrer" className="underline text-[var(--accent-violet)]">{children}</a> : <span>{children}</span> }}>{message.content}</Markdown> : <p className="text-[var(--text-muted)]">{busy ? 'Preparing an answer…' : 'No answer.'}</p>}
        </div>
        {message.stopped && <p className="text-[10px] text-[var(--text-muted)] mt-2">Reply stopped</p>}
        {message.sources?.length ? <details className="mt-2 text-[10px] text-[var(--text-muted)]"><summary className="cursor-pointer">Sources · {message.sources.length}{message.truncated ? ' · Limited context' : ''}</summary>{message.truncated && <p className="mt-1 text-pretty">Ask about a specific file or commit for more detail.</p>}{message.sources.map(source => <p key={`${source.repository}:${source.file || source.commit || source.kind}:${source.kind}`} className="break-all mt-1">{source.repository.split('/').pop()}: {source.file || source.commit?.slice(0, 7) || source.kind}</p>)}</details> : null}
      </article>)}
    </div>

    <form onSubmit={event => { event.preventDefault(); void send(); }} className="shrink-0 border-t border-[var(--border-subtle)] px-4 pt-3 pb-4">
      {error && <p role="alert" className="text-xs text-pretty text-rose-600 dark:text-rose-300 mb-2">{error}</p>}
      <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-interactive)] focus-within:border-[var(--accent-violet)] p-3">
        <textarea ref={composer} aria-label="Ask Copilot" value={question} maxLength={8000} rows={3} placeholder="Ask about this repository…" onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} className="w-full h-16 max-h-32 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none resize-none leading-relaxed" />
        <div className="flex items-center justify-between gap-2 mt-2">
          <details className="relative min-w-0">
            <summary aria-label="Chat context" title="Choose context" className="list-none [&::-webkit-details-marker]:hidden flex items-center gap-1.5 cursor-pointer max-w-full text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"><SlidersHorizontal className="size-3 shrink-0" /><span className="truncate">{repo.name}{additional.length ? ` +${additional.length}` : ''}{commit ? ` · ${commit.slice(0, 7)}` : ''}</span></summary>
            <div className="absolute bottom-full left-0 mb-3 z-40 w-64 max-w-[75vw] rounded-2xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] p-3 space-y-3">
              <p className="text-xs font-medium text-[var(--text-primary)]">Repository context</p>
              <p className="text-[10px] text-pretty text-[var(--text-muted)]">{repo.name} is included. Add up to three other repositories.</p>
              <div className="max-h-40 overflow-y-auto space-y-2">{repositories.filter(item => item.path !== repo.path).map(item => <label key={item.path} className="flex items-center gap-2 text-[11px] text-[var(--text-primary)]"><input type="checkbox" checked={additionalSet.has(item.path)} disabled={busy || (!additionalSet.has(item.path) && additional.length >= 3)} onChange={() => setAdditional(previous => additionalSet.has(item.path) ? previous.filter(value => value !== item.path) : [...previous, item.path])} className="accent-[var(--accent-violet)]" /><span className="truncate" title={item.path}>{item.name}</span></label>)}</div>
              <label className="block space-y-1 text-[10px] text-[var(--text-muted)]"><span className="flex items-center gap-1"><GitCommit className="size-3" />Specific commit (optional)</span><input aria-label="Commit to explain" placeholder="Paste a commit hash" value={commit} disabled={busy} onChange={event => setCommit(event.target.value)} className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)]" /></label>
            </div>
          </details>
          {busy ? <button type="button" aria-label="Stop reply" title="Stop reply" onClick={() => controller.current?.abort()} className="size-7 rounded-full border border-[var(--border-interactive)] flex items-center justify-center text-[var(--text-primary)]"><Square className="size-3" /></button> : <button type="submit" aria-label="Send message" title="Send message" disabled={!ready || !question.trim()} className="size-7 rounded-full bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] flex items-center justify-center disabled:opacity-30"><Send className="size-3.5" /></button>}
        </div>
      </div>
      <p className="text-[9px] text-[var(--text-muted)] mt-2 text-center">Local model · Read-only assistance</p>
    </form>
    <dialog ref={deleteDialog} role="alertdialog" aria-labelledby={deleteTitle} aria-describedby={deleteDescription} className="m-auto max-w-sm rounded-2xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] text-[var(--text-primary)] p-5 backdrop:bg-black/60">
      <h3 id={deleteTitle} className="font-semibold text-sm text-balance">Delete this conversation?</h3><p id={deleteDescription} className="text-xs text-pretty text-[var(--text-muted)] mt-2">This removes the saved chat from this Mac. It cannot be undone.</p>
      <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={() => deleteDialog.current?.close()} className="px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-xs">Cancel</button><button type="button" onClick={() => { deleteDialog.current?.close(); void removeChat(deleteId.current); }} className="px-3 py-1.5 rounded-full bg-rose-600 text-white text-xs">Delete chat</button></div>
    </dialog>
  </section>;
}
