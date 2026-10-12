import React, { useState, useEffect } from 'react';
import {
  X,
  Globe,
  Key,
  ShieldCheck,
  Check,
  AlertCircle,
  RefreshCw,
  ArrowRightLeft,
  ExternalLink,
  Lock,
  Terminal,
  CheckCircle2
} from 'lucide-react';
import { RepoSummary } from '../types';

interface RemoteAuthModalProps {
  repo: RepoSummary;
  onClose: () => void;
  onUpdated: () => void;
}

export const RemoteAuthModal: React.FC<RemoteAuthModalProps> = ({
  repo,
  onClose,
  onUpdated
}) => {
  const [remotes, setRemotes] = useState(repo.remotes || []);
  const [testingRemote, setTestingRemote] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ remote: string; success: boolean; message: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Diagnostics
  const [diagnostics, setDiagnostics] = useState<{
    sshConnected: boolean;
    sshUser: string | null;
    ghCliInstalled: boolean;
    ghCliUser: string | null;
    credentialHelper: string | null;
  } | null>(null);
  const [loadingDiag, setLoadingDiag] = useState(true);

  // HTTPS Token Input
  const [personalToken, setPersonalToken] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [selectedRemoteName, setSelectedRemoteName] = useState(remotes[0]?.name || 'origin');

  const currentRemote = remotes.find(r => r.name === selectedRemoteName) || remotes[0];
  const currentUrl = currentRemote?.pushUrl || currentRemote?.fetchUrl || '';
  const isHttps = currentUrl.startsWith('https://') || currentUrl.startsWith('http://');
  const isSsh = currentUrl.startsWith('git@') || currentUrl.startsWith('ssh://');

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  useEffect(() => {
    if (currentUrl) {
      setCustomUrl(currentUrl);
    }
  }, [currentUrl]);

  const fetchDiagnostics = async () => {
    setLoadingDiag(true);
    try {
      const res = await fetch('/api/auth/diagnostics');
      if (res.ok) {
        setDiagnostics(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDiag(false);
    }
  };

  const handleTestConnection = async (remoteName: string) => {
    setTestingRemote(remoteName);
    setTestResult(null);
    try {
      const res = await fetch('/api/repos/remotes/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repo.path, remoteName })
      });
      const data = await res.json();
      setTestResult({
        remote: remoteName,
        success: data.success,
        message: data.message
      });
    } catch (err: any) {
      setTestResult({
        remote: remoteName,
        success: false,
        message: err.message || 'Connection test failed'
      });
    } finally {
      setTestingRemote(null);
    }
  };

  const handleSwitchProtocol = async () => {
    if (!currentUrl) return;
    let targetUrl = currentUrl;

    if (isHttps) {
      // Convert https://github.com/owner/repo.git -> git@github.com:owner/repo.git
      const match = currentUrl.match(/https?:\/\/([^/]+)\/(.+)/);
      if (match) {
        const host = match[1].replace(/.*@/, '');
        const repoPath = match[2].endsWith('.git') ? match[2] : match[2] + '.git';
        targetUrl = `git@${host}:${repoPath}`;
      }
    } else if (isSsh) {
      // Convert git@github.com:owner/repo.git -> https://github.com/owner/repo.git
      const match = currentUrl.match(/git@([^:]+):(.+)/);
      if (match) {
        const host = match[1];
        const repoPath = match[2].endsWith('.git') ? match[2] : match[2] + '.git';
        targetUrl = `https://${host}/${repoPath}`;
      }
    }

    await applyNewUrl(targetUrl);
  };

  const applyNewUrl = async (newUrl: string) => {
    setIsUpdating(true);
    setUpdateNotice(null);
    try {
      const res = await fetch('/api/repos/remotes/update-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: repo.path,
          remoteName: currentRemote?.name || 'origin',
          newUrl
        })
      });
      const data = await res.json();
      if (res.ok) {
        setUpdateNotice({ success: true, message: data.output || 'Remote URL updated successfully!' });
        setCustomUrl(newUrl);
        if (data.updated?.remotes) {
          setRemotes(data.updated.remotes);
        }
        onUpdated();
        // Immediately test the new URL
        handleTestConnection(currentRemote?.name || 'origin');
      } else {
        setUpdateNotice({ success: false, message: data.error || 'Failed to update remote' });
      }
    } catch (err: any) {
      setUpdateNotice({ success: false, message: err.message || 'Error updating remote' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleApplyToken = async () => {
    if (!personalToken.trim() || !currentUrl) return;
    try {
      // Embed token into HTTPS URL: https://TOKEN@github.com/owner/repo.git
      const cleanUrl = currentUrl.replace(/https?:\/\/([^@]+@)?/, '');
      const tokenUrl = `https://${encodeURIComponent(personalToken.trim())}@${cleanUrl}`;
      await applyNewUrl(tokenUrl);
      setPersonalToken('');
    } catch (err: any) {
      setUpdateNotice({ success: false, message: err.message || 'Failed to apply token' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 text-xs">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-violet)]/10 border border-[var(--accent-violet)]/20 flex items-center justify-center text-[var(--accent-violet)]">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Remote &amp; Authentication</h3>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">{repo.name} ({currentRemote?.name || 'origin'})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Notice Banner */}
        {updateNotice && (
          <div className={`p-3 rounded-xl border flex items-center gap-2 ${
            updateNotice.success
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
          }`}>
            {updateNotice.success ? <Check className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span className="font-mono text-[11px]">{updateNotice.message}</span>
          </div>
        )}

        {/* Section 1: Current Remote Configuration */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-[var(--text-primary)] uppercase tracking-wider font-mono">
              Active Remote URL
            </span>
            <span className={`px-2 py-0.5 rounded-[50px] font-mono text-[10px] font-bold ${
              isSsh
                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/25'
                : 'bg-blue-500/10 text-blue-400 border border-blue-500/25'
            }`}>
              {isSsh ? 'SSH Protocol' : isHttps ? 'HTTPS Protocol' : 'Local / Custom'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              placeholder="e.g. git@github.com:user/repo.git"
              className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
            />
            {customUrl !== currentUrl && (
              <button
                onClick={() => applyNewUrl(customUrl)}
                disabled={isUpdating}
                className="px-3 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs whitespace-nowrap"
              >
                Save
              </button>
            )}
          </div>

          {/* 1-Click Protocol Conversion CTA */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleSwitchProtocol}
              disabled={isUpdating || !currentUrl}
              className="text-[11px] text-[var(--accent-violet)] hover:underline inline-flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>
                {isHttps
                  ? 'Switch to SSH (Recommended: uses your Mac SSH key)'
                  : 'Switch to HTTPS (uses Personal Access Token)'}
              </span>
            </button>

            <button
              onClick={() => handleTestConnection(currentRemote?.name || 'origin')}
              disabled={testingRemote !== null}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium text-[11px] flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3 h-3 ${testingRemote ? 'animate-spin' : ''}`} />
              <span>Test Connection</span>
            </button>
          </div>

          {/* Test Result Display */}
          {testResult && (
            <div className={`p-2.5 rounded-lg border font-mono text-[11px] flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/25 text-rose-400'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Section 2: Machine Authentication Diagnostics */}
        <div className="space-y-2">
          <span className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-mono">
            macOS System Authentication Status
          </span>
          <div className="grid grid-cols-2 gap-2">
            
            {/* SSH Status */}
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-start gap-2.5">
              <Key className="w-4 h-4 text-[var(--accent-violet)] shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[11px] text-[var(--text-primary)]">GitHub SSH Key</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {diagnostics?.sshConnected
                    ? `✓ Active for "${diagnostics.sshUser || 'user'}"`
                    : 'Not authenticated or key password needed'}
                </div>
              </div>
            </div>

            {/* Keychain Helper */}
            <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-[11px] text-[var(--text-primary)]">macOS Keychain</div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {diagnostics?.credentialHelper === 'osxkeychain'
                    ? '✓ osxkeychain active'
                    : 'System credentials enabled'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: If HTTPS is used, Personal Access Token Helper */}
        {isHttps && (
          <div className="p-3.5 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[11px] text-[var(--text-primary)] flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
                <span>GitHub Personal Access Token (PAT)</span>
              </span>
              <a
                href="https://github.com/settings/tokens/new?scopes=repo&description=Gitler%20macOS"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[var(--accent-violet)] hover:underline inline-flex items-center gap-1"
              >
                <span>Generate Token</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              GitHub does not allow account passwords for Git push. Paste a Personal Access Token (`ghp_...`) with `repo` scope:
            </p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={personalToken}
                onChange={e => setPersonalToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
              />
              <button
                onClick={handleApplyToken}
                disabled={!personalToken.trim()}
                className="px-3.5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs transition disabled:opacity-40"
              >
                Authorize
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <span className="text-[10px] text-[var(--text-dim)] font-mono">
            {isSsh ? 'Pushing via native SSH agent' : 'Pushing via HTTPS / Keychain'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-semibold"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
