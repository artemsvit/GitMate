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
  ChevronDown,
  ChevronUp,
  Server,
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
  const [selectedRemoteName, setSelectedRemoteName] = useState(remotes[0]?.name || 'origin');
  const [customUrl, setCustomUrl] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<{ success: boolean; message: string } | null>(null);

  // Testing connection state
  const [testingRemote, setTestingRemote] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    remote: string;
    success: boolean;
    message: string;
    rawError?: string;
    detectedProvider?: string;
  } | null>(null);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  // System Diagnostics
  const [diagnostics, setDiagnostics] = useState<{
    sshConnected: boolean;
    sshUser: string | null;
    ghCliInstalled: boolean;
    ghCliUser: string | null;
    credentialHelper: string | null;
  } | null>(null);

  // Token input for HTTP/HTTPS
  const [personalToken, setPersonalToken] = useState('');

  const currentRemote = remotes.find(r => r.name === selectedRemoteName) || remotes[0];
  const currentUrl = currentRemote?.pushUrl || currentRemote?.fetchUrl || '';
  const isHttps = currentUrl.startsWith('https://') || currentUrl.startsWith('http://');
  const isSsh = currentUrl.startsWith('git@') || currentUrl.startsWith('ssh://');

  // Detect Host Provider
  const isGitHub = currentUrl.includes('github.com');
  const isGitLab = currentUrl.includes('gitlab.com');
  const isGiteaOrSelfHosted =
    !isGitHub &&
    !isGitLab &&
    (currentUrl.includes('192.168.') ||
      currentUrl.includes('10.') ||
      currentUrl.includes('127.0.0.1') ||
      currentUrl.includes('localhost') ||
      currentUrl.includes(':222') ||
      currentUrl.includes(':3000') ||
      currentUrl.toLowerCase().includes('gitea') ||
      currentUrl.toLowerCase().includes('forgejo'));

  // Extract host & port for display
  const sshHostMatch = currentUrl.match(/^(?:ssh:\/\/)?(?:[a-zA-Z0-9_.-]+@)?([a-zA-Z0-9_.-]+)(?::(\d+))?/);
  const httpHostMatch = currentUrl.match(/^https?:\/\/([^/:]+)(?::(\d+))?/);
  const remoteHost = (sshHostMatch && sshHostMatch[1]) || (httpHostMatch && httpHostMatch[1]) || '';
  const remotePort = (sshHostMatch && sshHostMatch[2]) || (httpHostMatch && httpHostMatch[2]) || (isSsh ? '22' : '443');

  useEffect(() => {
    fetchDiagnostics();
  }, []);

  useEffect(() => {
    if (currentUrl) {
      setCustomUrl(currentUrl);
      setTestResult(null);
    }
  }, [currentUrl]);

  const fetchDiagnostics = async () => {
    try {
      const res = await fetch('/api/auth/diagnostics');
      if (res.ok) setDiagnostics(await res.json());
    } catch (e) {
      console.error(e);
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
        message: data.message,
        rawError: data.rawError,
        detectedProvider: data.detectedProvider
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
      // Convert HTTP/HTTPS -> SSH
      // e.g. http://192.168.0.102:3000/artsvit/Open-Pi.git -> ssh://git@192.168.0.102:222/artsvit/Open-Pi.git
      const match = currentUrl.match(/https?:\/\/(?:[^@]+@)?([^/:]+)(?::\d+)?\/(.+)/);
      if (match) {
        const host = match[1];
        const repoPath = match[2].endsWith('.git') ? match[2] : match[2] + '.git';
        if (host === 'github.com') {
          targetUrl = `git@github.com:${repoPath}`;
        } else if (host === 'gitlab.com') {
          targetUrl = `git@gitlab.com:${repoPath}`;
        } else {
          // Self-hosted / local Gitea: use standard ssh protocol with port 222 or 22
          targetUrl = `ssh://git@${host}:222/${repoPath}`;
        }
      }
    } else if (isSsh) {
      // Convert SSH -> HTTP/HTTPS
      // e.g. ssh://git@192.168.0.102:222/artsvit/Open-Pi.git -> http://192.168.0.102:3000/artsvit/Open-Pi.git
      // e.g. git@github.com:artemsvit/Gitler.git -> https://github.com/artemsvit/Gitler.git
      const match = currentUrl.match(/^(?:ssh:\/\/)?(?:[a-zA-Z0-9_.-]+@)?([^/:]+)(?::\d+)?(?:\/|:)(.*)$/);
      if (match) {
        const host = match[1];
        const repoPath = match[2].endsWith('.git') ? match[2] : match[2] + '.git';
        if (host === 'github.com') {
          targetUrl = `https://github.com/${repoPath}`;
        } else if (host === 'gitlab.com') {
          targetUrl = `https://gitlab.com/${repoPath}`;
        } else {
          // Gitea standard web port is 3000
          targetUrl = `http://${host}:3000/${repoPath}`;
        }
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
      const isHttpProto = currentUrl.startsWith('http://');
      const cleanUrl = currentUrl.replace(/https?:\/\/([^@]+@)?/, '');
      const tokenUrl = `${isHttpProto ? 'http://' : 'https://'}${encodeURIComponent(personalToken.trim())}@${cleanUrl}`;
      await applyNewUrl(tokenUrl);
      setPersonalToken('');
    } catch (err: any) {
      setUpdateNotice({ success: false, message: err.message || 'Failed to apply token' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 text-xs max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--accent-violet)]/10 border border-[var(--accent-violet)]/20 flex items-center justify-center text-[var(--accent-violet)]">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[var(--text-primary)]">Remote &amp; Authentication</h3>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                {repo.name} &bull; Remote: <span className="text-[var(--text-primary)] font-semibold">{currentRemote?.name || 'origin'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Update Notice Banner */}
        {updateNotice && (
          <div className={`p-3 rounded-xl border flex items-center gap-2 ${
            updateNotice.success
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-200'
          }`}>
            {updateNotice.success ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="font-mono text-[11px] font-medium">{updateNotice.message}</span>
          </div>
        )}

        {/* Section 1: Active Remote URL & Protocol Configuration */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[11px] text-[var(--text-primary)] uppercase tracking-wider font-mono">
              Active Remote URL
            </span>
            <div className="flex items-center gap-1.5">
              {/* Provider Badge */}
              <span className={`px-2 py-0.5 rounded-[50px] font-mono text-[10px] font-bold border ${
                isGitHub
                  ? 'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-500/30'
                  : isGiteaOrSelfHosted
                  ? 'bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-500/30'
                  : 'bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-500/30'
              }`}>
                {isGitHub ? 'GitHub' : isGiteaOrSelfHosted ? 'Gitea / Self-Hosted' : 'Git Server'}
              </span>

              {/* Protocol Badge */}
              <span className={`px-2 py-0.5 rounded-[50px] font-mono text-[10px] font-bold border ${
                isSsh
                  ? 'bg-purple-100 text-purple-900 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-500/30'
                  : 'bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-500/30'
              }`}>
                {isSsh ? 'SSH Protocol' : 'HTTP/S Protocol'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customUrl}
              onChange={e => setCustomUrl(e.target.value)}
              placeholder="e.g. ssh://git@192.168.0.102:222/user/repo.git"
              className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
            />
            {customUrl !== currentUrl && (
              <button
                onClick={() => applyNewUrl(customUrl)}
                disabled={isUpdating}
                className="px-3 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs whitespace-nowrap cursor-pointer hover:opacity-90"
              >
                Save URL
              </button>
            )}
          </div>

          {/* Quick Actions Bar */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={handleSwitchProtocol}
              disabled={isUpdating || !currentUrl}
              className="text-[11px] text-[var(--accent-violet)] hover:underline inline-flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>
                {isHttps
                  ? isGiteaOrSelfHosted
                    ? 'Switch to SSH (Recommended for Gitea)'
                    : 'Switch to SSH (Recommended: uses Mac SSH key)'
                  : isGiteaOrSelfHosted
                  ? 'Switch to HTTP (Port 3000 Token Auth)'
                  : 'Switch to HTTPS (uses Personal Access Token)'}
              </span>
            </button>

            <button
              onClick={() => handleTestConnection(currentRemote?.name || 'origin')}
              disabled={testingRemote !== null}
              className="px-3 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium text-[11px] flex items-center gap-1.5 transition cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${testingRemote ? 'animate-spin' : ''}`} />
              <span>Test Connection</span>
            </button>
          </div>

          {/* Test Result Display (High Contrast) */}
          {testResult && (
            <div className={`p-3 rounded-xl border font-mono text-[11px] space-y-1.5 ${
              testResult.success
                ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300'
                : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-200'
            }`}>
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 font-medium leading-relaxed">
                  {testResult.message}
                </div>
              </div>

              {testResult.rawError && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                    className="text-[10px] text-rose-700 dark:text-rose-300 underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showTechnicalDetails ? 'Hide technical details' : 'Show technical error output'}</span>
                    {showTechnicalDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showTechnicalDetails && (
                    <div className="mt-2 p-2 bg-black/80 text-rose-300 rounded-lg text-[10px] font-mono overflow-x-auto whitespace-pre-wrap select-text border border-rose-500/30">
                      {testResult.rawError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Gitea / Self-Hosted Server Authentication Guide */}
        {isGiteaOrSelfHosted && (
          <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[var(--accent-violet)]" />
                <span className="font-semibold text-xs text-[var(--text-primary)]">
                  Gitea / Self-Hosted Server ({remoteHost || 'Self-Hosted'}:{remotePort})
                </span>
              </div>
            </div>

            {/* Methods */}
            <div className="space-y-2 text-[11px] text-[var(--text-secondary)] leading-relaxed">
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
                <span>SSH Remote</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                When using an SSH remote URL, Git automatically authenticates using your macOS SSH agent and system keys.
              </p>
            </div>

            {/* Method 2: HTTP / Gitea Token */}
            <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
              <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5 text-[11px]">
                <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
                <span>Personal Access Token or Password</span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                For HTTP/HTTPS remotes, enter your Personal Access Token or password to authorize this repository:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={personalToken}
                  onChange={e => setPersonalToken(e.target.value)}
                  placeholder="Personal Access Token or password..."
                  className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                />
                <button
                  onClick={handleApplyToken}
                  disabled={!personalToken.trim()}
                  className="px-3 py-1.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs transition disabled:opacity-40 cursor-pointer"
                >
                  Save Token
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: GitHub Specific Authentication */}
        {isGitHub && (
          <div className="space-y-3">
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
                <Lock className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
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

            {/* HTTPS GitHub Token */}
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
                    className="px-3.5 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs transition disabled:opacity-40 cursor-pointer"
                  >
                    Authorize
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            {isSsh ? 'Pushing via macOS native SSH agent' : 'Pushing via HTTP / Token credentials'}
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-semibold hover:opacity-90 transition cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
