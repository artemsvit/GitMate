import { useState } from 'react';
import { apiFetch } from './api';
import { RepoSummary } from './types';
export interface PushDestination { remote: string; pushIndex: number; url: string }
export interface PushReport { commitHash: string; success: boolean; output: string; results: { destination: PushDestination; status: 'verified' | 'failed' | 'unverified'; message: string }[] }
export const destinationKey = (target: PushDestination) => JSON.stringify([target.remote, target.pushIndex, target.url]);
export const staleDestinationsMessage = 'A saved push destination changed or was removed. Select the push destinations again.';
// Picks where Push and Commit & Push send the commit.
// Without a saved choice it follows `git push`: every push URL of the preferred remote.
// A saved choice that no longer matches the remotes is stale; pushing then waits for a new choice,
// so a changed URL never silently drops a destination.
export function resolveDestinations(repo: Pick<RepoSummary, 'remotes' | 'sync'> | null, stored: PushDestination[] | undefined) {
  const all: PushDestination[] = repo?.remotes.flatMap(remote => remote.pushUrls.map((url, pushIndex) => ({ remote: remote.name, pushIndex, url }))) || [];
  const keys = new Set(all.map(destinationKey));
  const preferred = repo?.sync?.pushRemote || repo?.remotes[0]?.name;
  const destinations = (stored || all.filter(target => target.remote === preferred)).filter(target => keys.has(destinationKey(target)));
  return { all, destinations, stale: stored !== undefined && stored.length !== destinations.length };
}
// What a push would do at one destination, from the last fetch. The remote-tracking branch describes the
// fetch URL only, so a push URL that differs from it gets no status.
export interface DestinationStatus { label: string; ahead: number | null; behind: number }
export function destinationStatus(repo: Pick<RepoSummary, 'remotes'> | null, target: PushDestination): DestinationStatus | null {
  const remote = repo?.remotes.find(item => item.name === target.remote);
  if (!remote || remote.branch === undefined || (remote.fetchUrl && remote.fetchUrl !== target.url)) return null;
  if (remote.branch === null) return { label: 'new branch', ahead: null, behind: 0 };
  const { ahead, behind } = remote.branch;
  const parts = [ahead && `${ahead} to push`, behind && `${behind} to pull`].filter(Boolean);
  return { label: parts.length ? parts.join(', ') : 'up to date', ahead, behind };
}
export function useRepositoryPush(repo: RepoSummary | null, refresh: () => void) {
  const [saved, setSaved] = useState<Record<string, PushDestination[]>>(() => { try { return JSON.parse(localStorage.getItem('gitmate_push_destinations') || '{}'); } catch { return {}; } });
  const [reportState, setReport] = useState<{ path: string; report: PushReport } | null>(null);
  const [busyPath, setBusyPath] = useState('');
  const { all, destinations, stale } = resolveDestinations(repo, repo ? saved[repo.path] : undefined);
  const toggle = (key: string) => {
    if (!repo) return;
    const target = all.find(target => destinationKey(target) === key); if (!target) return;
    const next = destinations.some(item => destinationKey(item) === key) ? destinations.filter(item => destinationKey(item) !== key) : [...destinations, target];
    const updated = { ...saved, [repo.path]: next }; setSaved(updated); localStorage.setItem('gitmate_push_destinations', JSON.stringify(updated));
  };
  const push = async (expectedCommit?: string, targets?: PushDestination[]): Promise<PushReport> => {
    if (!targets && stale) throw new Error(staleDestinationsMessage);
    targets ??= destinations;
    if (!repo || !targets.length) throw new Error('Choose push destinations first.');
    setBusyPath(repo.path);
    try {
      const res = await apiFetch('/api/repos/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: repo.path, destinations: targets, expectedCommit }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Push failed.');
      const prior = reportState?.path === repo.path ? reportState.report : null;
      let report: PushReport = data;
      if (expectedCommit && prior?.commitHash === expectedCommit) {
        const replacements = new Map(data.results.map((result: PushReport['results'][number]) => [destinationKey(result.destination), result]));
        const results = prior.results.map(result => replacements.get(destinationKey(result.destination)) as PushReport['results'][number] || result);
        report = { ...data, results, success: results.every(result => result.status === 'verified'), output: results.map(result => result.message).join('\n') };
      }
      setReport({ path: repo.path, report }); refresh(); return report;
    } finally { setBusyPath(''); }
  };
  const statuses = destinations.map(target => destinationStatus(repo, target));
  // The badge on Push: the most commits any selected destination is missing. Falls back to the upstream count.
  const known = statuses.filter((status): status is DestinationStatus => !!status && status.ahead !== null);
  const pending = known.length ? Math.max(...known.map(status => status.ahead!)) : repo?.ahead || 0;
  const describe = (target: PushDestination) => { const status = destinationStatus(repo, target); return `${target.remote} → ${target.url}${status ? ` (${status.label})` : ''}`; };
  return { all, destinations, toggle, push, pending, describe, newBranch: statuses.some(status => status?.ahead === null), behindAny: statuses.some(status => !!status?.behind), report: reportState && reportState.path === repo?.path && (!repo.lastCommit || reportState.report.commitHash.startsWith(repo.lastCommit.hash)) ? reportState.report : null, pushing: busyPath === repo?.path, stale };
}
