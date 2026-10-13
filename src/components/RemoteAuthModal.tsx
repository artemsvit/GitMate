import { Dropdown } from './Dropdown';
import { apiFetch } from '../api';
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
  CheckCircle2,
  Copy
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

  // Dedicated Gitler SSH Key
  const [gitlerKey, setGitlerKey] = useState<{
    hasKey: boolean;
    publicKey: string;
    keyPath: string;
    keyType?: 'ed25519' | 'rsa';
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);

  // System Diagnostics
  const [diagnostics, setDiagnostics] = useState<{
    sshConnected: boolean;
    sshUser: string | null;
    ghCliInstalled: boolean;
    ghCliUser: string | null;
    credentialHelper: string | null;
  } | null>(null);

  // Token input for HTTP/HTTPS fallback
  const [urlDirection, setUrlDirection] = useState<'fetch' | 'push'>('fetch');
  const [pushIndex, setPushIndex] = useState(0);
  const [tokenProvider, setTokenProvider] = useState<'github' | 'gitlab' | 'gitea'>('gitea');
  const [personalToken, setPersonalToken] = useState('');

  const currentRemote = remotes.find(r => r.name === selectedRemoteName) || remotes[0];
  const currentUrl = urlDirection === 'fetch' ? currentRemote?.fetchUrl || '' : currentRemote?.pushUrls?.[pushIndex] || currentRemote?.pushUrl || '';
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
  const remoteHost = isHttps ? (httpHostMatch?.[1] || '') : (sshHostMatch?.[1] || '');
  const remotePort = isHttps ? (httpHostMatch?.[2] || (currentUrl.startsWith('http:') ? '80' : '443')) : (sshHostMatch?.[2] || '22');

  useEffect(() => {
    fetchDiagnostics();
    fetchGitlerKey();
  }, []);

  useEffect(() => {
    if (currentUrl) {
      setCustomUrl(currentUrl);
      setTestResult(null);
    }
  }, [currentUrl]);

  const fetchDiagnostics = async () => {
    try {
      const res = await apiFetch('/api/auth/diagnostics');
      if (res.ok) setDiagnostics(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGitlerKey = async () => {
    try {
      const res = await apiFetch('/api/auth/gitler-key');
      if (res.ok) {
        setGitlerKey(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopyKey = () => {
    if (gitlerKey?.publicKey) {
      navigator.clipboard.writeText(gitlerKey.publicKey);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2500);
    }
  };

  const handleCopyTitle = () => {
    navigator.clipboard.writeText('gitler-app');
    setCopiedTitle(true);
    setTimeout(() => setCopiedTitle(false), 2500);
  };

  const handleRegenerateKey = async () => {
    setIsRegeneratingKey(true);
    try {
      const res = await apiFetch('/api/auth/gitler-key/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyType: gitlerKey?.keyType || 'ed25519' })
      });
      if (res.ok) {
        setGitlerKey(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const handleTestConnection = async (remoteName: string) => {
    setTestingRemote(remoteName);
    setTestResult(null);
    try {
      const res = await apiFetch('/api/repos/remotes/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repo.path, remoteName, direction: urlDirection, pushIndex })
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
      const match = currentUrl.match(/https?:\/\/(?:[^@]+@)?([^/:]+)(?::\d+)?\/(.+)/);
      if (match) {
        const host = match[1];
        const repoPath = match[2].endsWith('.git') ? match[2] : match[2] + '.git';
        if (host === 'github.com') {
          targetUrl = `git@github.com:${repoPath}`;
        } else if (host === 'gitlab.com') {
          targetUrl = `git@gitlab.com:${repoPath}`;
        } else {
          // Self-hosted Gitea SSH port 222
          targetUrl = `ssh://git@${host}:222/${repoPath}`;
        }
      }
    } else if (isSsh) {
      // Convert SSH -> HTTP/HTTPS
      const match = currentUrl.match(/^(?:ssh:\/\/)?(?:[a-zA-Z0-9_.-]+@)?([^/:]+)(?::\d+)?(?:\/|:)(.*)$/);
      if (match) {
        const host = match[1];
        const repoPath = match[2].endsWith('.git') ? match[2] : match[2] + '.git';
        if (host === 'github.com') {
          targetUrl = `https://github.com/${repoPath}`;
        } else if (host === 'gitlab.com') {
          targetUrl = `https://gitlab.com/${repoPath}`;
        } else {
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
      const res = await apiFetch('/api/repos/remotes/update-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: repo.path,
          remoteName: currentRemote?.name || 'origin',
          newUrl, direction: urlDirection, pushIndex
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
    if (!personalToken.trim()) return;
    setIsUpdating(true);
    try {
      const response = await apiFetch('/api/repos/remotes/authorize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repo.path, remoteName: selectedRemoteName, provider: isGitHub ? 'github' : isGitLab ? 'gitlab' : tokenProvider, token: personalToken.trim(), direction: urlDirection, pushIndex })
      });
      const result = await response.json();
      setUpdateNotice({ success: response.ok, message: result.message || result.error });
      if (response.ok) { setPersonalToken(''); setRemotes(result.updated.remotes); onUpdated(); }
    } catch { setUpdateNotice({ success: false, message: 'Could not authorize this remote.' }); }
    finally { setIsUpdating(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-12 px-4 pb-6 animate-in fade-in duration-200">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 text-xs max-h-[88vh] overflow-y-auto">
        
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
              ? 'bg-[var(--alert-success-bg)] text-[var(--alert-success-text)] border-[var(--alert-success-border)]'
              : 'bg-[var(--alert-error-bg)] text-[var(--alert-error-text)] border-[var(--alert-error-border)]'
          }`}>
            {updateNotice.success ? (
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span className="font-mono text-[11px] font-semibold">{updateNotice.message}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs">URL for</span><Dropdown label="Remote URL direction" value={urlDirection} options={[{ value: 'fetch', label: 'Fetch and pull' }, { value: 'push', label: 'Push' }]} onChange={value => setUrlDirection(value as 'fetch' | 'push')} />
          {urlDirection === 'push' && (currentRemote?.pushUrls?.length || 0) > 1 && <Dropdown label="Push URL to edit" value={String(pushIndex)} options={(currentRemote?.pushUrls || []).map((url, index) => ({ value: String(index), label: url }))} onChange={value => setPushIndex(Number(value))} />}
          {currentRemote?.hasEmbeddedCredentials && <p className="text-xs text-amber-600">This remote contains saved credentials. Reauthorize with a replacement token to remove them from its URLs.</p>}
        </div>
        {/* Section 1: Remote Repository URL */}
        <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] space-y-3">
          <div className="flex items-center justify-between pb-0.5">
            <span className="font-semibold text-xs text-[var(--text-primary)]">
              Remote Repository URL
            </span>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {isGiteaOrSelfHosted ? 'Gitea' : isGitHub ? 'GitHub' : isGitLab ? 'GitLab' : 'Remote'} &bull; {isSsh ? 'SSH' : 'HTTPS'}
            </span>
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

          {/* Actions Bar */}
          <div className="flex items-center justify-between pt-0.5">
            <button
              onClick={handleSwitchProtocol}
              disabled={isUpdating || !currentUrl}
              className="text-[11px] text-[var(--text-muted)] hover:text-[var(--accent-violet)] hover:underline inline-flex items-center gap-1 font-medium cursor-pointer transition"
            >
              <ArrowRightLeft className="w-3 h-3" />
              <span>{isSsh ? 'Switch to HTTPS' : 'Switch to SSH'}</span>
            </button>

            <button
              onClick={() => handleTestConnection(currentRemote?.name || 'origin')}
              disabled={testingRemote !== null}
              className="px-3.5 py-1.5 rounded-[33px] border border-[var(--border-interactive)] hover:border-[var(--text-muted)] bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium text-[11px] flex items-center gap-1.5 transition cursor-pointer shadow-xs"
            >
              <RefreshCw className={`w-3 h-3 ${testingRemote ? 'animate-spin' : ''}`} />
              <span>Test Connection</span>
            </button>
          </div>

          {/* Connection Test Result */}
          {testResult && (
            <div className={`p-3 rounded-xl border font-mono text-[11px] space-y-1.5 ${
              testResult.success
                ? 'bg-[var(--alert-success-bg)] text-[var(--alert-success-text)] border-[var(--alert-success-border)]'
                : 'bg-[var(--alert-error-bg)] text-[var(--alert-error-text)] border-[var(--alert-error-border)]'
            }`}>
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 font-semibold leading-relaxed">
                  {testResult.message}
                </div>
              </div>

              {testResult.rawError && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
                    className="text-[10px] text-[var(--alert-error-text)] underline inline-flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <span>{showTechnicalDetails ? 'Hide technical details' : 'Show technical error output'}</span>
                    {showTechnicalDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                  {showTechnicalDetails && (
                    <div className="mt-2 p-2.5 bg-black/90 text-rose-300 rounded-lg text-[10px] font-mono overflow-x-auto whitespace-pre-wrap select-text border border-rose-500/30">
                      {testResult.rawError}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Gitea / Self-Hosted SSH Key Authorization */}
        {isGiteaOrSelfHosted && (
          <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-[var(--accent-violet)]" />
                <span className="font-semibold text-xs text-[var(--text-primary)]">
                  Self-hosted Git SSH Authorization ({remoteHost || 'Self-Hosted'}:{remotePort})
                </span>
              </div>
              <button
                onClick={handleRegenerateKey}
                disabled={isRegeneratingKey}
                className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-violet)] hover:underline inline-flex items-center gap-1 cursor-pointer transition"
              >
                <RefreshCw className={`w-2.5 h-2.5 ${isRegeneratingKey ? 'animate-spin' : ''}`} />
                <span>Regenerate Key</span>
              </button>
            </div>

            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Add this dedicated Gitler SSH key to your Gitea account to authorize push &amp; pull for <strong>all your repositories</strong>:
            </p>

            {/* Public Key Display Box with 1-Click Copy */}
            <div className="rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-canvas)] p-3 space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                <span>Dedicated Gitler Key &bull; <strong className="text-[var(--text-primary)]">{gitlerKey?.keyType || 'ed25519'} (gitler-app)</strong></span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopyTitle}
                    className="px-2 py-0.5 rounded-[50px] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-interactive)] text-[var(--text-primary)] font-semibold flex items-center gap-1 cursor-pointer transition shadow-xs text-[10px]"
                    title="Copy key title for Gitea 'Key Name' field"
                  >
                    {copiedTitle ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <Copy className="w-2.5 h-2.5 text-[var(--accent-violet)]" />}
                    <span>{copiedTitle ? 'Title Copied' : 'Copy Title'}</span>
                  </button>
                  <button
                    onClick={handleCopyKey}
                    className="px-2.5 py-1 rounded-[50px] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-interactive)] text-[var(--text-primary)] font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                  >
                    {copiedKey ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-[var(--accent-violet)]" />}
                    <span>{copiedKey ? 'Copied to Clipboard!' : 'Copy Public Key'}</span>
                  </button>
                </div>
              </div>

              <div className="p-2.5 bg-black/5 dark:bg-black/30 rounded-lg font-mono text-[10px] break-all text-[var(--text-primary)] select-all leading-relaxed max-h-20 overflow-y-auto border border-[var(--border-subtle)]">
                {gitlerKey?.publicKey || 'Generating key...'}
              </div>
            </div>

            {/* Simple Step by Step Instructions */}
            <div className="text-[11px] text-[var(--text-muted)] space-y-1.5 pt-0.5 font-mono">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[var(--accent-violet)]/10 text-[var(--accent-violet)] text-[10px] font-bold flex items-center justify-center shrink-0">1</span>
                <span>Open your Git server’s <strong>SSH key settings</strong> and add a key.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[var(--accent-violet)]/10 text-[var(--accent-violet)] text-[10px] font-bold flex items-center justify-center shrink-0">2</span>
                <span>Set Key Name to <code className="text-[var(--accent-violet)]">gitler-app</code> and paste the copied key into Content.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-[var(--accent-violet)]/10 text-[var(--accent-violet)] text-[10px] font-bold flex items-center justify-center shrink-0">3</span>
                <span>Click <strong>Test Connection</strong> above to verify your access!</span>
              </div>
            </div>

            {/* HTTP/Token option only shown if using HTTP */}
            {isHttps && (
              <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5 text-[11px]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
                  <span>Alternative: Personal Access Token (HTTP)</span>
                </div>
                {!isGitHub && !isGitLab && <select aria-label="Token provider" value={tokenProvider} onChange={event => setTokenProvider(event.target.value as 'github' | 'gitlab' | 'gitea')} className="bg-[var(--bg-canvas)] border rounded p-1"><option value="gitea">Gitea / Forgejo</option><option value="gitlab">GitLab</option></select>}
                <p className="text-xs text-[var(--text-muted)]">The token is stored in your protected Gitler account settings and supplied through Git’s credential helper. It is never inserted into the remote URL.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    aria-label="Remote access token"
                    value={personalToken}
                    onChange={e => setPersonalToken(e.target.value)}
                    placeholder="Personal Access Token..."
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
            )}
          </div>
        )}

        {/* Section 3: GitHub Specific Authentication */}
        {(isGitHub || isGitLab) && (
          <div className="space-y-3">
            <span className="font-semibold text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-mono">
              macOS System Authentication Status
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-card)] flex items-start gap-2.5">
                <Key className="w-4 h-4 text-[var(--accent-violet)] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-[11px] text-[var(--text-primary)]">GitHub SSH (independent of HTTPS)</div>
                  <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                    {diagnostics?.sshConnected
                      ? `✓ Active for "${diagnostics.sshUser || 'user'}"`
                      : 'Not authenticated or key password needed'}
                  </div>
                </div>
              </div>

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

            {isHttps && (
              <div className="p-3.5 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-surface)] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px] text-[var(--text-primary)] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-[var(--accent-violet)]" />
                    <span>Personal Access Token</span>
                  </span>
                  <a
                    href={isGitHub ? 'https://github.com/settings/tokens/new?scopes=repo&description=Gitler' : `${new URL(currentUrl).origin}${isGitLab || tokenProvider === 'gitlab' ? '/-/user_settings/personal_access_tokens' : '/user/settings/applications'}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[var(--accent-violet)] hover:underline inline-flex items-center gap-1"
                  >
                    <span>Generate Token</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                {!isGitHub && !isGitLab && <select aria-label="Token provider" value={tokenProvider} onChange={event => setTokenProvider(event.target.value as 'github' | 'gitlab' | 'gitea')} className="bg-[var(--bg-canvas)] border rounded p-1"><option value="gitea">Gitea / Forgejo</option><option value="gitlab">GitLab</option></select>}
                <p className="text-xs text-[var(--text-muted)]">The token is stored in your protected Gitler account settings and supplied through Git’s credential helper. It is never inserted into the remote URL.</p>
                <div className="flex items-center gap-2">
                  <input
                    type="password"
                    aria-label="Remote access token"
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
            {isSsh ? 'SSH uses your host configuration, agent, and Gitler key.' : 'HTTPS uses your connected account and existing Git credential helpers.'}
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
