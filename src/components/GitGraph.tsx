import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Copy, GitBranch, RefreshCw, Search, Tag, X } from 'lucide-react';
import { cn } from '../cn';
import { apiFetch } from '../api';
import { layoutGraph, type LayoutRow } from '../graphLayout';
import { DiffViewer } from './DiffViewer';
import { Dropdown } from './Dropdown';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { ConfirmDialog } from './ConfirmDialog';

interface Ref { name: string; type: 'head' | 'branch' | 'remote' | 'tag' }
interface Commit { hash: string; parents: string[]; author: string; email: string; date: number; subject: string; refs: Ref[] }
interface Details { hash: string; parents: string[]; author: string; email: string; date: number; committer: string; committed: number; message: string; files: { path: string; added: number | null; removed: number | null }[] }

const laneColors = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#fb923c', '#60a5fa', '#a3e635', '#f87171', '#2dd4bf'];
const ROW = 28; const LANE = 14; const PAGE = 300;
const colorOf = (index: number) => laneColors[index % laneColors.length];
const formatDate = (seconds: number) => new Date(seconds * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
const avatarColor = (email: string) => colorOf([...email].reduce((sum, char) => sum + char.charCodeAt(0), 0));

function GraphCell({ row, width }: { row: LayoutRow; width: number }) {
  const x = (lane: number) => LANE / 2 + lane * LANE; const mid = ROW / 2;
  return <svg width={width} height={ROW} className="shrink-0 overflow-visible" aria-hidden="true">
    {row.segments.map((segment, index) => {
      const color = colorOf(segment.color);
      if (segment.half === 'full') return <line key={index} x1={x(segment.from)} y1={0} x2={x(segment.to)} y2={ROW} stroke={color} strokeWidth={2} />;
      const [y1, y2] = segment.half === 'top' ? [0, mid] : [mid, ROW];
      if (segment.from === segment.to) return <line key={index} x1={x(segment.from)} y1={y1} x2={x(segment.to)} y2={y2} stroke={color} strokeWidth={2} />;
      return <path key={index} d={`M ${x(segment.from)} ${y1} C ${x(segment.from)} ${(y1 + y2) / 2}, ${x(segment.to)} ${(y1 + y2) / 2}, ${x(segment.to)} ${y2}`} fill="none" stroke={color} strokeWidth={2} />;
    })}
    <circle cx={x(row.lane)} cy={mid} r={4} fill="var(--bg-canvas)" stroke={colorOf(row.color)} strokeWidth={2} />
  </svg>;
}

function RefBadge({ item, current }: { item: Ref; current: boolean }) {
  if (item.type === 'head') return null;
  const Icon = item.type === 'tag' ? Tag : GitBranch;
  return <span title={item.type === 'remote' ? `Remote branch ${item.name}` : item.type === 'tag' ? `Tag ${item.name}` : `Branch ${item.name}`} className={cn('inline-flex items-center gap-1 px-1.5 py-px rounded-full border text-[10px] font-medium shrink-0 max-w-[12rem]',
    item.type === 'tag' ? 'border-amber-500/40 text-amber-500' : item.type === 'remote' ? 'border-[var(--border-interactive)] text-[var(--text-muted)]' : 'border-[var(--accent-violet)]/50 text-[var(--accent-violet)]',
    current && 'bg-[var(--accent-violet)]/15 font-semibold')}>
    <Icon className="size-2.5 shrink-0" /><span className="truncate">{item.name}</span>
  </span>;
}

interface WorktreeHead { path: string; head: string | null; branch: string | null; main: boolean }
// Actions on a commit or one of its labels. Each change asks first and then refreshes the graph and the workspace.
type Ask = { title: string; message: React.ReactNode; label: string; destructive?: boolean; name?: { placeholder: string; checkout?: boolean }; run: (name: string, checkout: boolean) => void };

export function GitGraph({ repoPath, currentBranch, onChanged, onNotice }: { repoPath: string; currentBranch?: string; onChanged?: () => void; onNotice?: (type: 'success' | 'error', message: string) => void }) {
  const [worktrees, setWorktrees] = useState<WorktreeHead[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [name, setName] = useState('');
  const [checkoutNew, setCheckoutNew] = useState(true);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [local, setLocal] = useState<string[]>([]);
  const [branch, setBranch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Details | null>(null);
  const [file, setFile] = useState<{ path: string; diff: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (skip = 0) => {
    setLoading(true); setError('');
    try {
      const res = await apiFetch(`/api/repos/graph?path=${encodeURIComponent(repoPath)}&limit=${PAGE}&skip=${skip}${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`);
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      setCommits(previous => skip ? [...previous, ...data.commits] : data.commits); setBranches(data.branches); setLocal(data.local || []); setHasMore(data.hasMore); setWorktrees(data.worktrees || []);
    } catch (err: any) { setError(err.message || 'Could not read the commit graph.'); } finally { setLoading(false); }
  }, [repoPath, branch]);
  useEffect(() => { setSelected(null); setFile(null); void load(0); }, [load]);

  const post = async (url: string, body: Record<string, unknown>) => {
    try {
      const res = await apiFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repoPath, ...body }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error);
      if (data.result?.message) onNotice?.(data.result.ok === false && !data.result.needsConfirmation ? 'error' : 'success', data.result.message);
      onChanged?.(); void load(0); return data.result;
    } catch (err: any) { onNotice?.('error', err.message || 'The action failed.'); return null; }
  };
  const copy = (text: string) => navigator.clipboard.writeText(text).then(() => onNotice?.('success', 'Copied.')).catch(() => {});
  const openAsk = (next: Ask) => { setName(''); setCheckoutNew(true); setAsk(next); };
  const itemsFor = (commit: Commit): MenuItem[] => {
    const short = commit.hash.slice(0, 7);
    const localRefs = commit.refs.filter(item => item.type === 'branch' && item.name !== currentBranch);
    const tags = commit.refs.filter(item => item.type === 'tag');
    return [
      { label: 'Check Out This Commit…', onSelect: () => openAsk({ title: `Check out ${short}?`, label: 'Check Out', message: <>Your files switch to this commit without a branch (detached). New commits here need a branch to keep them; create one first if you plan to change code.</>, run: () => { void post('/api/repos/commit-action', { action: 'checkout', hash: commit.hash }); } }) },
      { label: 'Create Branch Here…', onSelect: () => openAsk({ title: `New branch at ${short}`, label: 'Create Branch', message: <>A branch that starts at this commit.</>, name: { placeholder: 'feature/name', checkout: true }, run: (value, checkout) => { void post('/api/repos/commit-action', { action: checkout ? 'branch-checkout' : 'branch', hash: commit.hash, name: value }); } }) },
      { label: 'Create Tag Here…', onSelect: () => openAsk({ title: `New tag at ${short}`, label: 'Create Tag', message: <>A lightweight tag that marks this commit, for example a release.</>, name: { placeholder: 'v1.0.0' }, run: value => { void post('/api/repos/commit-action', { action: 'tag', hash: commit.hash, name: value }); } }) },
      { label: `Cherry-pick into ${currentBranch || 'current branch'}…`, separatorBefore: true, onSelect: () => openAsk({ title: `Cherry-pick ${short}?`, label: 'Cherry-pick', message: <>A copy of this commit’s changes is committed on <span className="font-mono">{currentBranch}</span>. If files conflict, Git Mate stops so you can resolve them or abort.</>, run: () => { void post('/api/repos/commit-action', { action: 'cherry-pick', hash: commit.hash }); } }) },
      { label: 'Revert Commit…', onSelect: () => openAsk({ title: `Revert ${short}?`, label: 'Revert', message: <>A new commit undoes this commit’s changes. History is not rewritten.</>, run: () => { void post('/api/repos/commit-action', { action: 'revert', hash: commit.hash }); } }) },
      ...localRefs.map((item, index) => ({ label: `Merge ${item.name} into ${currentBranch}…`, separatorBefore: index === 0, onSelect: () => openAsk({ title: `Merge ${item.name}?`, label: 'Merge', message: <>Commits from <span className="font-mono">{item.name}</span> are merged into <span className="font-mono">{currentBranch}</span>.</>, run: () => { void post('/api/repos/merge', { branch: item.name }); } }) })),
      ...localRefs.map(item => ({ label: `Delete Branch ${item.name}…`, destructive: true, onSelect: () => openAsk({ title: `Delete branch ${item.name}?`, label: 'Delete', destructive: true, message: <>The local branch is removed. Remote branches are not changed.</>, run: () => { void post('/api/repos/branch/delete', { branch: item.name, force: false }).then(result => { if (result?.needsConfirmation) openAsk({ title: `Delete ${item.name} anyway?`, label: 'Delete anyway', destructive: true, message: <>This branch has commits that are not merged anywhere. Deleting it can lose them.</>, run: () => { void post('/api/repos/branch/delete', { branch: item.name, force: true }); } }); }); } }) })),
      ...tags.map(item => ({ label: `Delete Tag ${item.name}…`, destructive: true, onSelect: () => openAsk({ title: `Delete tag ${item.name}?`, label: 'Delete', destructive: true, message: <>The local tag is removed. Tags already pushed stay on the remote.</>, run: () => { void post('/api/repos/tag/delete', { tag: item.name }); } }) })),
      { label: 'Copy Commit Hash', separatorBefore: true, onSelect: () => copy(commit.hash) },
      { label: 'Copy Message', onSelect: () => copy(commit.subject) }
    ];
  };
  // Other worktrees' current commits, labeled by folder name.
  const worktreeAt = (hash: string) => worktrees.filter(entry => entry.head === hash && entry.path !== repoPath);
  const layout = useMemo(() => layoutGraph(commits), [commits]);
  const graphWidth = Math.max(1, Math.min(layout.lanes, 16)) * LANE + 6;
  const needle = query.trim().toLowerCase();
  const matches = (commit: Commit) => !needle || commit.subject.toLowerCase().includes(needle) || commit.author.toLowerCase().includes(needle) || commit.email.toLowerCase().includes(needle) || commit.hash.startsWith(needle) || commit.refs.some(item => item.name.toLowerCase().includes(needle));
  const matchCount = needle ? commits.filter(matches).length : commits.length;

  const open = async (hash: string) => {
    setFile(null);
    try { const res = await apiFetch(`/api/repos/commit?path=${encodeURIComponent(repoPath)}&hash=${hash}`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setSelected(data); }
    catch (err: any) { setError(err.message); }
  };
  const openFile = async (path: string) => {
    if (!selected) return;
    try { const res = await apiFetch(`/api/repos/commit-diff?path=${encodeURIComponent(repoPath)}&hash=${selected.hash}&file=${encodeURIComponent(path)}`); const data = await res.json(); if (!res.ok) throw new Error(data.error); setFile({ path, diff: data.diff }); }
    catch (err: any) { setError(err.message); }
  };
  const copyHash = (hash: string) => navigator.clipboard.writeText(hash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});

  return <div className="flex-1 min-h-0 flex flex-col bg-[var(--bg-canvas)]">
    <div className="px-5 py-2.5 flex items-center gap-2 border-b border-[var(--border-subtle)] shrink-0">
      <div className="w-56 shrink-0">
        <Dropdown label="Branches shown" value={branch} onChange={setBranch} options={[
          { value: '', label: 'All branches' },
          ...local.map(name => ({ value: name, label: name, group: 'Local' })),
          ...branches.filter(name => !local.includes(name)).map(name => ({ value: name, label: name, group: name.split('/')[0] }))
        ]} />
      </div>
      <label className="flex-1 max-w-sm flex items-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-full px-3 py-1.5 focus-within:border-[var(--accent-violet)]">
        <Search className="size-3 text-[var(--text-muted)] shrink-0" />
        <input aria-label="Find commits" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find message, author, hash, branch" className="flex-1 min-w-0 bg-transparent text-[11px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none" />
        {query && <button aria-label="Clear search" onClick={() => setQuery('')} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="size-3" /></button>}
      </label>
      <span className="text-[10px] text-[var(--text-muted)] tabular-nums ml-auto">{needle ? `${matchCount} of ${commits.length}` : `${commits.length}${hasMore ? '+' : ''}`} commits</span>
      <button onClick={() => load(0)} disabled={loading} aria-label="Reload graph" title="Reload graph" className="p-1.5 rounded-full bg-[var(--bg-surface)] border border-[var(--border-interactive)] text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-40"><RefreshCw className={cn('size-3.5', loading && 'animate-spin')} /></button>
    </div>
    {error && <p role="alert" className="px-5 py-2 text-[11px] text-rose-500 border-b border-[var(--border-subtle)]">{error}</p>}

    <div className={cn('min-h-0 overflow-auto', selected ? 'flex-[3]' : 'flex-1')}>
      <div className="min-w-[640px]">
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 h-7 bg-[var(--bg-canvas)] border-b border-[var(--border-subtle)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <span style={{ width: graphWidth }} className="shrink-0">Graph</span>
          <span className="flex-1">Description</span>
          <span className="w-36 shrink-0">Date</span>
          <span className="w-36 shrink-0">Author</span>
          <span className="w-16 shrink-0">Commit</span>
        </div>
        {commits.map((commit, index) => {
          const current = commit.refs.some(item => item.type === 'head');
          return <button key={commit.hash} onClick={() => open(commit.hash)} onContextMenu={event => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, items: itemsFor(commit) }); }} aria-current={selected?.hash === commit.hash ? 'true' : undefined}
            className={cn('w-full flex items-center gap-3 px-5 text-left text-xs transition', selected?.hash === commit.hash ? 'bg-[var(--accent-violet)]/10' : 'hover:bg-[var(--bg-surface)]', !matches(commit) && 'opacity-30')} style={{ height: ROW }}>
            <span style={{ width: graphWidth }} className="shrink-0 overflow-hidden"><GraphCell row={layout.rows[index]} width={graphWidth} /></span>
            <span className="flex-1 min-w-0 flex items-center gap-1.5">
              {commit.refs.map(item => <RefBadge key={item.type + item.name} item={item} current={current && item.type === 'branch'} />)}
              {worktreeAt(commit.hash).map(entry => <span key={entry.path} title={`Checked out in the worktree at ${entry.path}`} className="inline-flex items-center gap-1 px-1.5 py-px rounded-full border border-sky-500/40 text-sky-500 text-[10px] font-medium shrink-0 max-w-[10rem]"><span className="truncate">⧉ {entry.path.split('/').pop()}</span></span>)}
              <span className={cn('truncate', current ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-secondary)]')}>{commit.subject}</span>
            </span>
            <span className="w-36 shrink-0 text-[11px] text-[var(--text-muted)] tabular-nums truncate">{formatDate(commit.date)}</span>
            <span className="w-36 shrink-0 flex items-center gap-1.5 min-w-0" title={commit.email}>
              <span className="size-4 rounded-full shrink-0 flex items-center justify-center text-[8px] font-semibold text-black/80" style={{ background: avatarColor(commit.email) }}>{initials(commit.author)}</span>
              <span className="truncate text-[11px] text-[var(--text-secondary)]">{commit.author}</span>
            </span>
            <span className="w-16 shrink-0 font-mono text-[11px] text-[var(--text-muted)]">{commit.hash.slice(0, 7)}</span>
          </button>;
        })}
        {!commits.length && !loading && !error && <p className="px-5 py-8 text-[11px] text-[var(--text-muted)]">No commits yet.</p>}
        {hasMore && <div className="px-5 py-3"><button onClick={() => load(commits.length)} disabled={loading} className="px-3 py-1.5 rounded-full border border-[var(--border-interactive)] text-[11px] text-[var(--text-primary)] hover:bg-[var(--bg-surface)] disabled:opacity-40">Load {PAGE} more</button></div>}
      </div>
    </div>

    {selected && <section aria-label="Commit details" className="flex-[2] min-h-[220px] border-t border-[var(--border-subtle)] flex min-w-0 bg-[var(--bg-surface)]">
      <div className="w-[22rem] max-w-[45%] shrink-0 overflow-y-auto p-4 space-y-3 border-r border-[var(--border-subtle)]">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-[var(--text-primary)] text-pretty">{selected.message.split('\n')[0]}</p>
          <button aria-label="Close details" onClick={() => { setSelected(null); setFile(null); }} className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"><X className="size-3.5" /></button>
        </div>
        {selected.message.split('\n').slice(1).join('\n').trim() && <p className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap text-pretty">{selected.message.split('\n').slice(1).join('\n').trim()}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-[var(--text-muted)]">Author</dt><dd className="text-[var(--text-primary)] truncate" title={selected.email}>{selected.author} · {formatDate(selected.date)}</dd>
          {selected.committer !== selected.author && <><dt className="text-[var(--text-muted)]">Committer</dt><dd className="text-[var(--text-primary)] truncate">{selected.committer} · {formatDate(selected.committed)}</dd></>}
          <dt className="text-[var(--text-muted)]">Commit</dt><dd><button onClick={() => copyHash(selected.hash)} className="inline-flex items-center gap-1 font-mono text-[var(--accent-violet)] hover:text-[var(--text-primary)]">{selected.hash.slice(0, 12)}{copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}</button></dd>
          {selected.parents.length > 0 && <><dt className="text-[var(--text-muted)]">{selected.parents.length > 1 ? 'Parents' : 'Parent'}</dt><dd className="flex flex-wrap gap-1.5">{selected.parents.map(parent => <button key={parent} onClick={() => open(parent)} className="font-mono text-[var(--text-secondary)] hover:text-[var(--accent-violet)]">{parent.slice(0, 7)}</button>)}</dd></>}
        </dl>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{selected.files.length} {selected.files.length === 1 ? 'file' : 'files'} changed</p>
          <ul className="space-y-0.5">{selected.files.map(entry => <li key={entry.path}><button onClick={() => openFile(entry.path)} className={cn('w-full flex items-center gap-2 px-2 py-1 rounded-lg text-left text-[11px]', file?.path === entry.path ? 'bg-[var(--bg-card)] text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-card)]')}>
            <span className="flex-1 truncate font-mono" title={entry.path}>{entry.path}</span>
            {entry.added === null ? <span className="text-[10px] text-[var(--text-muted)]">binary</span> : <span className="text-[10px] tabular-nums shrink-0"><span className="text-emerald-500">+{entry.added}</span> <span className="text-rose-500">−{entry.removed}</span></span>}
          </button></li>)}</ul>
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-auto">
        {file ? <DiffViewer diff={file.diff} filename={file.path} source={`Commit ${selected.hash.slice(0, 7)}`} /> : <p className="p-4 text-[11px] text-[var(--text-muted)]">Choose a file to see its changes in this commit.</p>}
      </div>
    </section>}
    {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
    <ConfirmDialog open={!!ask} title={ask?.title || ''} message={ask?.message} confirmLabel={ask?.label || 'OK'} destructive={ask?.destructive}
      onCancel={() => setAsk(null)} onConfirm={() => { if (ask?.name && !name.trim()) return; const pending = ask; setAsk(null); pending?.run(name.trim(), checkoutNew); }}>
      {ask?.name && <div className="space-y-2">
        <input autoFocus value={name} onChange={event => setName(event.target.value)} placeholder={ask.name.placeholder} aria-label="Name" className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]" />
        {ask.name.checkout && <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" checked={checkoutNew} onChange={event => setCheckoutNew(event.target.checked)} className="accent-[var(--accent-violet)]" />Switch to the new branch</label>}
      </div>}
    </ConfirmDialog>
  </div>;
}
