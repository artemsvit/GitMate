import { useState } from 'react';
import { apiFetch } from './api';
import { RepoSummary } from './types';
export interface PushDestination { remote: string; pushIndex: number; url: string }
export interface PushReport { commitHash: string; success: boolean; output: string; results: { destination: PushDestination; status: 'verified' | 'failed' | 'unverified'; message: string }[] }
export const destinationKey = (target: PushDestination) => JSON.stringify([target.remote, target.pushIndex, target.url]);
export function useRepositoryPush(repo: RepoSummary | null, refresh: () => void) {
  const [saved, setSaved] = useState<Record<string, PushDestination[]>>(() => { try { return JSON.parse(localStorage.getItem('gitmate_push_destinations') || '{}'); } catch { return {}; } });
  const [reportState, setReport] = useState<{ path: string; report: PushReport } | null>(null);
  const [busyPath, setBusyPath] = useState('');
  const all = repo?.remotes.flatMap(remote => remote.pushUrls.map((url, pushIndex) => ({ remote: remote.name, pushIndex, url }))) || [];
  const preferred = repo?.sync?.pushRemote || repo?.remotes[0]?.name;
  const defaultTargets = all.filter(target => target.remote === preferred);
  const stored = repo ? saved[repo.path] : undefined;
  const destinations = (stored || (defaultTargets.length === 1 ? defaultTargets : [])).filter(target => all.some(current => destinationKey(current) === destinationKey(target)));
  const toggle = (key: string) => {
    if (!repo) return;
    const target = all.find(target => destinationKey(target) === key); if (!target) return;
    const next = destinations.some(item => destinationKey(item) === key) ? destinations.filter(item => destinationKey(item) !== key) : [...destinations, target];
    const updated = { ...saved, [repo.path]: next }; setSaved(updated); localStorage.setItem('gitmate_push_destinations', JSON.stringify(updated));
  };
  const push = async (expectedCommit?: string, targets = destinations): Promise<PushReport> => {
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
  return { all, destinations, toggle, push, report: reportState && reportState.path === repo?.path ? reportState.report : null, pushing: busyPath === repo?.path, stale: stored !== undefined && stored.length !== destinations.length };
}
