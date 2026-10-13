import type { PushReport } from './useRepositoryPush';
export interface CommitNotice { text: string; type: 'success' | 'error'; pushCommit?: string }
export function currentCommitNotice(notice: CommitNotice | null, report: PushReport | null): CommitNotice | null {
  if (!notice?.pushCommit || report?.commitHash !== notice.pushCommit) return notice;
  return { ...notice, type: report.success ? 'success' : 'error', text: report.success ? `Verified ${report.commitHash.slice(0, 7)} at every selected destination.` : `Committed locally (${report.commitHash.slice(0, 7)}). Some destinations failed; review the results.` };
}
