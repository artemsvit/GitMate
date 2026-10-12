import { apiFetch } from '../api';
import React, { useState, useEffect } from 'react';
import {
  X,
  Settings,
  Cpu,
  Globe,
  User,
  Palette,
  Check,
  AlertCircle,
  RefreshCw,
  Copy,
  Server,
  Lock,
  Sun,
  Moon,
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Terminal,
  KeyRound,
  ChevronDown,
  ChevronUp,
  Link,
  Unlink,
  Sparkles
} from 'lucide-react';
import { LocalAIStatus, ProvidersStatus } from '../types';

export type SettingsTab = 'providers' | 'ai' | 'identity' | 'appearance';

interface SettingsModalProps {
  initialTab?: SettingsTab;
  aiStatus: LocalAIStatus | null;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onRefreshAIStatus: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  initialTab = 'providers',
  aiStatus,
  theme,
  onToggleTheme,
  onRefreshAIStatus,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // Tab 1: Providers & SSH
  const [providers, setProviders] = useState<ProvidersStatus | null>(null);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [connectModalProvider, setConnectModalProvider] = useState<'github' | 'gitlab' | 'gitea' | null>(null);
  const [connectToken, setConnectToken] = useState('');
  const [connectInstanceUrl, setConnectInstanceUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<string | null>(null);
  const [syncingSsh, setSyncingSsh] = useState<string | null>(null);
  const [syncSshNotice, setSyncSshNotice] = useState<string | null>(null);
  const [showManualSsh, setShowManualSsh] = useState(false);

  // Dedicated Gitler SSH Key
  const [gitlerKey, setGitlerKey] = useState<{
    hasKey: boolean;
    publicKey: string;
    keyPath: string;
    keyType?: 'ed25519' | 'rsa';
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [selectedKeyType, setSelectedKeyType] = useState<'ed25519' | 'rsa'>('ed25519');
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [testHost, setTestHost] = useState('');
  const [testPort, setTestPort] = useState('22');
  const [isTestingHost, setIsTestingHost] = useState(false);
  const [hostTestResult, setHostTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Diagnostics for GitHub
  const [diagnostics, setDiagnostics] = useState<{
    sshConnected: boolean;
    sshUser: string | null;
    ghCliInstalled: boolean;
    ghCliUser: string | null;
    credentialHelper: string | null;
  } | null>(null);

  // Tab 2: AI Engine State
  const [activeAIMode, setActiveAIMode] = useState<'embedded' | 'external'>(() => {
    return (localStorage.getItem('gitler_ai_mode') as 'embedded' | 'external') || 'embedded';
  });
  const [testingAI, setTestingAI] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<string | null>(null);

  // Tab 3: Git Identity State
  const [gitConfig, setGitConfig] = useState<{
    userName: string;
    userEmail: string;
    defaultBranch: string;
  }>({ userName: '', userEmail: '', defaultBranch: 'main' });
  const [isSavingGitConfig, setIsSavingGitConfig] = useState(false);
  const [gitConfigNotice, setGitConfigNotice] = useState<string | null>(null);

  // Load initial settings on mount
  useEffect(() => {
    fetchProviders();
    fetchGitlerKey();
    fetchDiagnostics();
    fetchGitConfig();
  }, []);

  const fetchProviders = async () => {
    setIsLoadingProviders(true);
    try {
      const res = await apiFetch('/api/auth/providers');
      if (res.ok) {
        setProviders(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingProviders(false);
    }
  };

  const handleOpenConnect = (provider: 'github' | 'gitlab' | 'gitea') => {
    setConnectModalProvider(provider);
    setConnectToken('');
    setConnectError(null);
    setConnectSuccess(null);
    if (provider === 'gitea') {
      setConnectInstanceUrl(providers?.gitea?.instanceUrl || 'http://192.168.0.102:3000');
    } else if (provider === 'gitlab') {
      setConnectInstanceUrl(providers?.gitlab?.instanceUrl || 'https://gitlab.com');
    } else {
      setConnectInstanceUrl('https://github.com');
    }
  };

  const handleConnectProvider = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectModalProvider || !connectToken.trim()) return;
    setIsConnecting(true);
    setConnectError(null);
    setConnectSuccess(null);
    try {
      const res = await apiFetch('/api/auth/providers/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: connectModalProvider,
          token: connectToken.trim(),
          instanceUrl: connectInstanceUrl.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        setConnectSuccess(`Connected as @${data.account?.username}! ${data.sshSyncedMessage || ''}`);
        await fetchProviders();
        setTimeout(() => {
          setConnectModalProvider(null);
          setConnectSuccess(null);
        }, 1200);
      } else {
        setConnectError(data.error || 'Connection failed.');
      }
    } catch (err: any) {
      setConnectError(err.message || 'Network error.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnectProvider = async (provider: 'github' | 'gitlab' | 'gitea') => {
    try {
      const res = await apiFetch('/api/auth/providers/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      if (res.ok) {
        await fetchProviders();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncSsh = async (provider: 'github' | 'gitlab' | 'gitea') => {
    setSyncingSsh(provider);
    setSyncSshNotice(null);
    try {
      const res = await apiFetch('/api/auth/providers/sync-ssh-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider })
      });
      const data = await res.json();
      if (res.ok) {
        setSyncSshNotice(data.message || 'SSH key uploaded successfully!');
        await fetchProviders();
        setTimeout(() => setSyncSshNotice(null), 3000);
      } else {
        setSyncSshNotice(`Error: ${data.error || 'Failed to sync key'}`);
      }
    } catch (err: any) {
      setSyncSshNotice(`Error: ${err.message}`);
    } finally {
      setSyncingSsh(null);
    }
  };

  const fetchGitlerKey = async () => {
    try {
      const res = await apiFetch('/api/auth/gitler-key');
      if (res.ok) {
        const data = await res.json();
        setGitlerKey(data);
        if (data.keyType) setSelectedKeyType(data.keyType);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDiagnostics = async () => {
    try {
      const res = await apiFetch('/api/auth/diagnostics');
      if (res.ok) setDiagnostics(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGitConfig = async () => {
    try {
      const res = await apiFetch('/api/settings/git-config');
      if (res.ok) {
        const data = await res.json();
        setGitConfig(data);
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

  const handleRegenerateKey = async (typeToGenerate?: 'ed25519' | 'rsa') => {
    const targetType = typeToGenerate || selectedKeyType;
    setIsRegeneratingKey(true);
    try {
      const res = await apiFetch('/api/auth/gitler-key/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyType: targetType })
      });
      if (res.ok) {
        const data = await res.json();
        setGitlerKey(data);
        if (data.keyType) setSelectedKeyType(data.keyType);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  const handleTestHost = async () => {
    if (!testHost.trim()) return;
    setIsTestingHost(true);
    setHostTestResult(null);
    try {
      const res = await apiFetch('/api/settings/test-host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: testHost.trim(), port: Number(testPort) || 22 })
      });
      const data = await res.json();
      setHostTestResult({
        success: data.success,
        message: data.message || (data.success ? 'Authentication successful!' : 'Connection failed')
      });
    } catch (err: any) {
      setHostTestResult({ success: false, message: err.message || 'Host test failed' });
    } finally {
      setIsTestingHost(false);
    }
  };

  const handleSelectAIMode = (mode: 'embedded' | 'external') => {
    setActiveAIMode(mode);
    localStorage.setItem('gitler_ai_mode', mode);
    onRefreshAIStatus();
  };

  const handleTestAI = async () => {
    setTestingAI(true);
    setAiTestResult(null);
    try {
      const res = await apiFetch(`/api/ai/status?mode=${activeAIMode}`);
      const data: LocalAIStatus = await res.json();
      if (activeAIMode === 'embedded') {
        setAiTestResult('Built-in commit suggestions are ready. Messages use local rules and staged changes.');
      } else if (data.hasExternal) {
        setAiTestResult(`Connected: ${data.externalProvider?.toUpperCase()} (${data.externalActiveModel}) on ${data.externalEndpoint}`);
      } else {
        setAiTestResult('No external daemon detected on port 11434. Using built-in commit suggestions.');
      }
      onRefreshAIStatus();
    } catch (err: any) {
      setAiTestResult(`Test failed: ${err.message}`);
    } finally {
      setTestingAI(false);
    }
  };

  const handleSaveGitConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingGitConfig(true);
    setGitConfigNotice(null);
    try {
      const res = await apiFetch('/api/settings/git-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gitConfig)
      });
      if (res.ok) {
        setGitConfigNotice('Global Git configuration saved successfully!');
        setTimeout(() => setGitConfigNotice(null), 3000);
      } else {
        setGitConfigNotice('Failed to update Git configuration');
      }
    } catch (err: any) {
      setGitConfigNotice(`Error: ${err.message}`);
    } finally {
      setIsSavingGitConfig(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl max-w-3xl w-full shadow-2xl flex flex-col h-[88vh] max-h-[860px] min-h-[640px] overflow-hidden text-xs">
        
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0 bg-[var(--bg-surface)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-violet)]/10 border border-[var(--accent-violet)]/20 flex items-center justify-center text-[var(--accent-violet)]">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Command Center &amp; Settings</h2>
              <p className="text-[11px] text-[var(--text-muted)] font-mono">
                Global configuration, providers &amp; intelligence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)] transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="px-6 pt-3 border-b border-[var(--border-subtle)] flex items-center gap-1.5 bg-[var(--bg-canvas)] shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('providers')}
            className={`px-3 py-2 rounded-t-xl text-xs font-medium flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'providers'
                ? 'border-[var(--accent-violet)] text-[var(--accent-violet)] bg-[var(--bg-surface)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Git Providers &amp; Auth</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-2 rounded-t-xl text-xs font-medium flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'ai'
                ? 'border-[var(--accent-violet)] text-[var(--accent-violet)] bg-[var(--bg-surface)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>AI Intelligence Engine</span>
          </button>

          <button
            onClick={() => setActiveTab('identity')}
            className={`px-3 py-2 rounded-t-xl text-xs font-medium flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'identity'
                ? 'border-[var(--accent-violet)] text-[var(--accent-violet)] bg-[var(--bg-surface)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Git Identity</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-3 py-2 rounded-t-xl text-xs font-medium flex items-center gap-2 border-b-2 transition cursor-pointer ${
              activeTab === 'appearance'
                ? 'border-[var(--accent-violet)] text-[var(--accent-violet)] bg-[var(--bg-surface)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card)]/50'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Appearance &amp; App</span>
          </button>
        </div>

        {/* Tab Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          
          {/* TAB 1: GIT PROVIDERS & AUTH */}
          {activeTab === 'providers' && (
            <div className="space-y-4">

              {/* Status Notice */}
              {syncSshNotice && (
                <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-mono animate-in fade-in ${
                  syncSshNotice.toLowerCase().startsWith('error')
                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
                    : 'border-[var(--alert-success-border)] bg-[var(--alert-success-bg)] text-[var(--alert-success-text)]'
                }`}>
                  <div className="flex items-center gap-2">
                    {syncSshNotice.toLowerCase().startsWith('error') ? (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                    <span>{syncSshNotice}</span>
                  </div>
                  <button
                    onClick={() => setSyncSshNotice(null)}
                    className="p-1 hover:opacity-70 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Section Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">Connected Git Providers</h3>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Authorize Gitler with your accounts for 1-click authentication and automated SSH key synchronization.
                  </p>
                </div>
                <button
                  onClick={fetchProviders}
                  disabled={isLoadingProviders}
                  className="px-2.5 py-1 text-[11px] font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingProviders ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {/* Providers Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 1. GitHub Provider Card */}
                <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-xl bg-black/10 dark:bg-white/10 flex items-center justify-center text-[var(--text-primary)]">
                        <Globe className="w-4 h-4" />
                      </div>
                      {providers?.github?.connected ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-canvas)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                          Not Connected
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text-primary)]">GitHub</h4>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono">github.com</p>
                    </div>

                    {providers?.github?.connected ? (
                      <div className="p-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center gap-1.5">
                          {providers.github.avatarUrl ? (
                            <img src={providers.github.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                          ) : (
                            <User className="w-3 h-3 text-[var(--text-muted)]" />
                          )}
                          <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                            @{providers.github.username}
                          </span>
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)] block font-mono">
                          {providers.github.authMethod === 'gh_cli' ? 'Via GitHub CLI (gh)' : 'Via Access Token'}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        Connect with your Personal Access Token to push and pull seamlessly.
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2">
                    {providers?.github?.connected ? (
                      <>
                        <button
                          onClick={() => handleDisconnectProvider('github')}
                          className="flex-1 py-1.5 rounded-lg bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] hover:border-rose-500/50 text-[var(--btn-secondary-text)] hover:text-rose-400 font-semibold text-[11px] transition cursor-pointer shadow-xs"
                        >
                          Disconnect
                        </button>
                        {providers.github.authMethod === 'token' && (
                          <button
                            onClick={() => handleSyncSsh('github')}
                            disabled={syncingSsh === 'github'}
                            className="px-2.5 py-1.5 rounded-lg bg-[var(--btn-secondary-bg)] hover:opacity-90 border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] font-semibold text-[11px] transition cursor-pointer shadow-xs"
                            title="Auto-upload Gitler SSH Key to GitHub"
                          >
                            <KeyRound className="w-3 h-3" />
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={() => handleOpenConnect('github')}
                        className="w-full py-2 rounded-xl bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] hover:opacity-95 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Link className="w-3.5 h-3.5" />
                        <span>Connect GitHub</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. GitLab Provider Card */}
                <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
                        <Globe className="w-4 h-4" />
                      </div>
                      {providers?.gitlab?.connected ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-canvas)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                          Not Connected
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text-primary)]">GitLab</h4>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                        {providers?.gitlab?.instanceUrl ? new URL(providers.gitlab.instanceUrl).hostname : 'gitlab.com'}
                      </p>
                    </div>

                    {providers?.gitlab?.connected ? (
                      <div className="p-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center gap-1.5">
                          {providers.gitlab.avatarUrl ? (
                            <img src={providers.gitlab.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                          ) : (
                            <User className="w-3 h-3 text-[var(--text-muted)]" />
                          )}
                          <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                            @{providers.gitlab.username}
                          </span>
                        </div>
                        <span className="text-[9px] text-[var(--text-muted)] block font-mono">
                          Personal Access Token
                        </span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        Connect GitLab.com or your self-hosted GitLab server.
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2">
                    {providers?.gitlab?.connected ? (
                      <>
                        <button
                          onClick={() => handleDisconnectProvider('gitlab')}
                          className="flex-1 py-1.5 rounded-lg bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] hover:border-rose-500/50 text-[var(--btn-secondary-text)] hover:text-rose-400 font-semibold text-[11px] transition cursor-pointer shadow-xs"
                        >
                          Disconnect
                        </button>
                        <button
                          onClick={() => handleSyncSsh('gitlab')}
                          disabled={syncingSsh === 'gitlab'}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--btn-secondary-bg)] hover:opacity-90 border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] font-semibold text-[11px] transition cursor-pointer shadow-xs"
                          title="Auto-upload Gitler SSH Key to GitLab"
                        >
                          <KeyRound className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleOpenConnect('gitlab')}
                        className="w-full py-2 rounded-xl bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] hover:opacity-95 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Link className="w-3.5 h-3.5" />
                        <span>Connect GitLab</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Gitea & Forgejo Provider Card */}
                <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="w-8 h-8 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-500">
                        <Server className="w-4 h-4" />
                      </div>
                      {providers?.gitea?.connected ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-canvas)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                          Not Connected
                        </span>
                      )}
                    </div>

                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text-primary)]">Gitea &amp; Forgejo</h4>
                      <p className="text-[10px] text-[var(--text-muted)] font-mono truncate">
                        {providers?.gitea?.instanceUrl || 'Self-Hosted Server'}
                      </p>
                    </div>

                    {providers?.gitea?.connected ? (
                      <div className="p-2 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                        <div className="flex items-center gap-1.5">
                          {providers.gitea.avatarUrl ? (
                            <img src={providers.gitea.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                          ) : (
                            <User className="w-3 h-3 text-[var(--text-muted)]" />
                          )}
                          <span className="font-semibold text-xs text-[var(--text-primary)] truncate">
                            @{providers.gitea.username}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-emerald-500 font-mono">
                          <Check className="w-2.5 h-2.5" />
                          <span>SSH Key Auto-Synchronized</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                        Connect with token. Gitler automatically installs its SSH key onto your Gitea server!
                      </p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-[var(--border-subtle)] flex items-center gap-2">
                    {providers?.gitea?.connected ? (
                      <>
                        <button
                          onClick={() => handleDisconnectProvider('gitea')}
                          className="flex-1 py-1.5 rounded-lg bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] hover:border-rose-500/50 text-[var(--btn-secondary-text)] hover:text-rose-400 font-semibold text-[11px] transition cursor-pointer shadow-xs"
                        >
                          Disconnect
                        </button>
                        <button
                          onClick={() => handleSyncSsh('gitea')}
                          disabled={syncingSsh === 'gitea'}
                          className="px-2.5 py-1.5 rounded-lg bg-[var(--btn-secondary-bg)] hover:opacity-90 border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] font-semibold text-[11px] transition cursor-pointer shadow-xs"
                          title="Re-sync Gitler SSH Key to Gitea"
                        >
                          <KeyRound className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleOpenConnect('gitea')}
                        className="w-full py-2 rounded-xl bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] hover:opacity-95 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        <Link className="w-3.5 h-3.5" />
                        <span>Connect Gitea</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Advanced Manual SSH Section (Collapsible) */}
              <div className="border border-[var(--border-subtle)] rounded-xl bg-[var(--bg-card)] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowManualSsh(!showManualSsh)}
                  className="w-full p-4 flex items-center justify-between text-left hover:bg-[var(--bg-canvas)]/50 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-[var(--accent-violet)]/10 text-[var(--accent-violet)] flex items-center justify-center">
                      <KeyRound className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text-primary)]">
                        Manual SSH Key Setup (Optional)
                      </h4>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        Only needed if your git host restricts API access or requires manual public keys
                      </p>
                    </div>
                  </div>
                  {showManualSsh ? (
                    <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                  )}
                </button>

                {showManualSsh && (
                  <div className="p-4 pt-1 border-t border-[var(--border-subtle)] space-y-3 animate-in fade-in">
                    {/* Algorithm Selection with High Contrast Design */}
                    <div className="flex items-center justify-between bg-[var(--bg-canvas)] p-2.5 rounded-xl border border-[var(--border-subtle)]">
                      <span className="text-[11px] font-medium text-[var(--text-secondary)]">Key Algorithm:</span>
                      <div className="flex items-center gap-1.5 bg-[var(--bg-surface)] p-1 rounded-lg border border-[var(--border-subtle)]">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKeyType('ed25519');
                            if (gitlerKey?.keyType !== 'ed25519') handleRegenerateKey('ed25519');
                          }}
                          className={`px-3 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                            (gitlerKey?.keyType || selectedKeyType) === 'ed25519'
                              ? 'bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] shadow-xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          Ed25519 (Modern)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedKeyType('rsa');
                            if (gitlerKey?.keyType !== 'rsa') handleRegenerateKey('rsa');
                          }}
                          className={`px-3 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                            (gitlerKey?.keyType || selectedKeyType) === 'rsa'
                              ? 'bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] shadow-xs'
                              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          RSA 4096 (Legacy)
                        </button>
                      </div>
                    </div>

                    {/* Key Display Card */}
                    <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2">
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                        <span>Public Key &bull; <strong className="text-[var(--text-primary)]">{gitlerKey?.keyType || 'ed25519'} (gitler-app)</strong></span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRegenerateKey()}
                            disabled={isRegeneratingKey}
                            className="text-[10px] text-[var(--text-muted)] hover:text-[var(--accent-violet)] hover:underline inline-flex items-center gap-1 cursor-pointer transition"
                          >
                            <RefreshCw className={`w-2.5 h-2.5 ${isRegeneratingKey ? 'animate-spin' : ''}`} />
                            <span>Regenerate</span>
                          </button>
                          <button
                            onClick={handleCopyKey}
                            className="px-2.5 py-1 rounded-lg bg-[var(--btn-secondary-bg)] hover:opacity-90 border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-xs text-[10px]"
                          >
                            {copiedKey ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-[var(--accent-violet)]" />}
                            <span>{copiedKey ? 'Copied!' : 'Copy Public Key'}</span>
                          </button>
                        </div>
                      </div>
                      <div className="p-2.5 bg-black/5 dark:bg-black/30 rounded-lg font-mono text-[10px] break-all text-[var(--text-primary)] select-all leading-relaxed max-h-20 overflow-y-auto border border-[var(--border-subtle)]">
                        {gitlerKey?.publicKey || 'Loading key...'}
                      </div>
                    </div>

                    {/* Live Host Verification */}
                    <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                          Test Host Connection
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          Default: Port 22 (Standard) or 2222 (Docker)
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={testHost}
                          onChange={e => setTestHost(e.target.value)}
                          placeholder="e.g. 192.168.0.102 or git.mycompany.com"
                          className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                        />
                        <input
                          type="text"
                          value={testPort}
                          onChange={e => setTestPort(e.target.value)}
                          placeholder="Port (22)"
                          className="w-24 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent-violet)]"
                        />
                        <button
                          onClick={handleTestHost}
                          disabled={isTestingHost || !testHost.trim()}
                          className="px-3.5 py-1.5 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs whitespace-nowrap cursor-pointer hover:opacity-90 disabled:opacity-40 transition"
                        >
                          {isTestingHost ? 'Testing...' : 'Test SSH Host'}
                        </button>
                      </div>

                      {hostTestResult && (
                        <div className={`p-2.5 rounded-lg border text-[11px] font-mono flex items-center gap-2 ${
                          hostTestResult.success
                            ? 'bg-[var(--alert-success-bg)] text-[var(--alert-success-text)] border-[var(--alert-success-border)]'
                            : 'bg-[var(--alert-error-bg)] text-[var(--alert-error-text)] border-[var(--alert-error-border)]'
                        }`}>
                          {hostTestResult.success ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                          )}
                          <span className="font-semibold">{hostTestResult.message}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TAB 2: AI INTELLIGENCE ENGINE */}
          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-[var(--accent-violet)]" />
                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text-primary)]">Active AI Mode</h4>
                      <p className="text-[10px] text-[var(--text-muted)]">Used for automated semantic commit generation &amp; AI Copilot</p>
                    </div>
                  </div>
                  <button
                    onClick={handleTestAI}
                    disabled={testingAI}
                    className="px-3 py-1 rounded-[33px] border border-[var(--border-interactive)] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] text-[var(--text-primary)] font-medium text-[11px] flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${testingAI ? 'animate-spin' : ''}`} />
                    <span>Test Status</span>
                  </button>
                </div>

                {/* AI Mode Options */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => handleSelectAIMode('embedded')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer space-y-1.5 ${
                      activeAIMode === 'embedded'
                        ? 'border-[var(--accent-violet)] bg-[var(--accent-violet)]/10 ring-1 ring-[var(--accent-violet)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-interactive)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[var(--text-primary)]">Built-in Suggestions</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--accent-violet)] border border-[var(--border-interactive)]">
                        Built-in
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      Zero configuration. Local rules for draft commit messages. No neural model.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectAIMode('external')}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer space-y-1.5 ${
                      activeAIMode === 'external'
                        ? 'border-[var(--accent-violet)] bg-[var(--accent-violet)]/10 ring-1 ring-[var(--accent-violet)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-interactive)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[var(--text-primary)]">External Ollama</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-interactive)]">
                        Local Daemon
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      Connect to your local Ollama or LM Studio instance on port 11434.
                    </p>
                  </button>
                </div>

                {aiTestResult && (
                  <div className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] font-mono text-[11px] text-[var(--text-secondary)]">
                    {aiTestResult}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GIT IDENTITY */}
          {activeTab === 'identity' && (
            <form onSubmit={handleSaveGitConfig} className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3.5">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-[var(--accent-violet)]" />
                  <div>
                    <h4 className="font-semibold text-xs text-[var(--text-primary)]">Global Git Author Identity</h4>
                    <p className="text-[10px] text-[var(--text-muted)]">Configured in ~/.gitconfig for all commits</p>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                      Author Name (user.name)
                    </label>
                    <input
                      type="text"
                      value={gitConfig.userName}
                      onChange={e => setGitConfig({ ...gitConfig, userName: e.target.value })}
                      placeholder="e.g. John Doe"
                      className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                      Author Email (user.email)
                    </label>
                    <input
                      type="email"
                      value={gitConfig.userEmail}
                      onChange={e => setGitConfig({ ...gitConfig, userEmail: e.target.value })}
                      placeholder="e.g. john@example.com"
                      className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">
                      Default Initial Branch (init.defaultBranch)
                    </label>
                    <input
                      type="text"
                      value={gitConfig.defaultBranch}
                      onChange={e => setGitConfig({ ...gitConfig, defaultBranch: e.target.value })}
                      placeholder="main"
                      className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                  {gitConfigNotice ? (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 font-medium">
                      {gitConfigNotice}
                    </span>
                  ) : <span />}
                  <button
                    type="submit"
                    disabled={isSavingGitConfig}
                    className="px-4 py-2 rounded-xl bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] font-semibold text-xs cursor-pointer hover:opacity-90 disabled:opacity-40 transition"
                  >
                    {isSavingGitConfig ? 'Saving...' : 'Save Git Config'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB 4: APPEARANCE & APP */}
          {activeTab === 'appearance' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4 text-[var(--accent-violet)]" />
                  <div>
                    <h4 className="font-semibold text-xs text-[var(--text-primary)]">Interface Theme</h4>
                    <p className="text-[10px] text-[var(--text-muted)]">Switch between dark and light appearance</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    onClick={() => {
                      if (theme !== 'dark') onToggleTheme();
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      theme === 'dark'
                        ? 'border-[var(--accent-violet)] bg-[var(--accent-violet)]/10 ring-1 ring-[var(--accent-violet)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-interactive)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Moon className="w-4 h-4 text-[var(--accent-violet)]" />
                      <span className="font-semibold text-xs text-[var(--text-primary)]">Dark Theme</span>
                    </div>
                    {theme === 'dark' && <Check className="w-3.5 h-3.5 text-[var(--accent-violet)]" />}
                  </button>

                  <button
                    onClick={() => {
                      if (theme !== 'light') onToggleTheme();
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                      theme === 'light'
                        ? 'border-[var(--accent-violet)] bg-[var(--accent-violet)]/10 ring-1 ring-[var(--accent-violet)]'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-canvas)] hover:border-[var(--border-interactive)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Sun className="w-4 h-4 text-[var(--accent-violet)]" />
                      <span className="font-semibold text-xs text-[var(--text-primary)]">Light Theme</span>
                    </div>
                    {theme === 'light' && <Check className="w-3.5 h-3.5 text-[var(--accent-violet)]" />}
                  </button>
                </div>
              </div>

              {/* Application Details */}
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-muted)]">Gitler Application</span>
                  <span className="text-[var(--text-primary)] font-semibold">v1.0.0</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-muted)]">Architecture</span>
                  <span className="text-[var(--text-primary)]">macOS Apple Silicon (arm64)</span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-[var(--text-muted)]">Privacy Guarantee</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">100% Local &bull; No Telemetry</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-3 border-t border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-surface)] shrink-0">
          <span className="text-[10px] text-[var(--text-muted)] font-mono">
            Gitler Command Center &bull; All changes saved automatically
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-[33px] bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-semibold hover:opacity-90 transition cursor-pointer"
          >
            Done
          </button>
        </div>

      {/* Interactive Provider Connect Modal */}
      {connectModalProvider && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent-violet)]/10 text-[var(--accent-violet)] flex items-center justify-center font-bold">
                  <Link className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                    Connect {connectModalProvider === 'github' ? 'GitHub' : connectModalProvider === 'gitlab' ? 'GitLab' : 'Gitea / Forgejo'}
                  </h3>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Follow the steps below to authorize Gitler
                  </p>
                </div>
              </div>
              <button
                onClick={() => setConnectModalProvider(null)}
                className="p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {connectError && (
              <div className="space-y-1.5">
                <div className="p-2.5 rounded-xl border border-[var(--alert-error-border)] bg-[var(--alert-error-bg)] text-[var(--alert-error-text)] text-[11px] font-mono flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span className="leading-relaxed flex-1 select-text">{connectError}</span>
                </div>
                {connectError.includes('Local Network') && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        apiFetch('/api/system/request-local-network-permission', { method: 'POST' });
                      }}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <span>Trigger System Prompt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => apiFetch('/api/system/open-local-network-settings', { method: 'POST' })}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-[var(--btn-secondary-bg)] hover:opacity-90 border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
                    >
                      <span>Open Settings</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {connectSuccess && (
              <div className="p-2.5 rounded-xl border border-[var(--alert-success-border)] bg-[var(--alert-success-bg)] text-[var(--alert-success-text)] text-[11px] font-mono flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                <span>{connectSuccess}</span>
              </div>
            )}

            <form onSubmit={handleConnectProvider} className="space-y-3.5">
              {/* Server URL for Gitea / GitLab */}
              {connectModalProvider !== 'github' && (
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--text-primary)] block">
                    Server URL
                  </label>
                  <input
                    type="text"
                    required
                    value={connectInstanceUrl}
                    onChange={e => setConnectInstanceUrl(e.target.value)}
                    placeholder={connectModalProvider === 'gitea' ? 'http://192.168.0.102:3000' : 'https://gitlab.com'}
                    className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                  />
                  <span className="text-[10px] text-[var(--text-muted)]">
                    {connectModalProvider === 'gitea' ? 'Your local or remote Gitea/Forgejo web address' : 'GitLab instance domain'}
                  </span>
                </div>
              )}

              {/* Step 1: Token Guide Link */}
              <div className="p-3 rounded-xl bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1.5">
                <span className="text-[10px] font-semibold text-[var(--accent-violet)] uppercase tracking-wider block font-mono">
                  Step 1: Generate Access Token
                </span>
                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {connectModalProvider === 'gitea' ? (
                    <>In your Gitea web interface, go to <strong>Settings &rarr; Applications</strong> and create a token.</>
                  ) : connectModalProvider === 'github' ? (
                    <>Create a Personal Access Token with <code className="text-[var(--accent-violet)]">repo</code> and <code className="text-[var(--accent-violet)]">read:user</code> scopes.</>
                  ) : (
                    <>In GitLab, go to <strong>User Settings &rarr; Access Tokens</strong> and create a token with <code className="text-[var(--accent-violet)]">api</code> scope.</>
                  )}
                </p>
                <a
                  href={
                    connectModalProvider === 'gitea'
                      ? `${connectInstanceUrl || 'http://192.168.0.102:3000'}/user/settings/applications`
                      : connectModalProvider === 'github'
                        ? 'https://github.com/settings/tokens/new?scopes=repo,read:user&description=Gitler'
                        : `${connectInstanceUrl || 'https://gitlab.com'}/-/user_settings/personal_access_tokens`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-[var(--accent-violet)] hover:underline font-semibold"
                >
                  <span>Open Token Settings in Browser</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Step 2: Paste Token */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-[var(--text-primary)] block">
                  Step 2: Paste Personal Access Token
                </label>
                <input
                  type="password"
                  required
                  value={connectToken}
                  onChange={e => setConnectToken(e.target.value)}
                  placeholder="Paste token here..."
                  className="w-full bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-2 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                />
              </div>

              {connectModalProvider === 'gitea' && (
                <div className="p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-[10px] text-teal-600 dark:text-teal-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>Gitler will automatically upload its SSH key to your Gitea account upon connection.</span>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setConnectModalProvider(null)}
                  className="px-4 py-2 rounded-xl bg-[var(--btn-secondary-bg)] border border-[var(--btn-secondary-border)] text-[var(--btn-secondary-text)] hover:opacity-90 text-xs font-semibold cursor-pointer transition shadow-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isConnecting || !connectToken.trim()}
                  className="px-5 py-2 rounded-xl bg-[var(--btn-accent-bg)] text-[var(--btn-accent-text)] text-xs font-bold hover:opacity-95 disabled:opacity-40 cursor-pointer transition flex items-center gap-1.5 shadow-sm"
                >
                  {isConnecting && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>{isConnecting ? 'Verifying...' : 'Verify & Connect'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      </div>
    </div>
  );
};
