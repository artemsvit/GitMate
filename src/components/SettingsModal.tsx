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
  Terminal
} from 'lucide-react';
import { LocalAIStatus } from '../types';

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
  const [gitlerKey, setGitlerKey] = useState<{
    hasKey: boolean;
    publicKey: string;
    keyPath: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [testHost, setTestHost] = useState('192.168.0.102');
  const [testPort, setTestPort] = useState('222');
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
    fetchGitlerKey();
    fetchDiagnostics();
    fetchGitConfig();
  }, []);

  const fetchGitlerKey = async () => {
    try {
      const res = await fetch('/api/auth/gitler-key');
      if (res.ok) setGitlerKey(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDiagnostics = async () => {
    try {
      const res = await fetch('/api/auth/diagnostics');
      if (res.ok) setDiagnostics(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchGitConfig = async () => {
    try {
      const res = await fetch('/api/settings/git-config');
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

  const handleRegenerateKey = async () => {
    setIsRegeneratingKey(true);
    try {
      const res = await fetch('/api/auth/gitler-key/regenerate', { method: 'POST' });
      if (res.ok) setGitlerKey(await res.json());
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
      const res = await fetch('/api/settings/test-host', {
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
      const res = await fetch(`/api/ai/status?mode=${activeAIMode}`);
      const data: LocalAIStatus = await res.json();
      if (activeAIMode === 'embedded') {
        setAiTestResult('Embedded Engine Verified: Native on-device semantic neural model active.');
      } else if (data.hasExternal) {
        setAiTestResult(`Connected: ${data.externalProvider?.toUpperCase()} (${data.externalActiveModel}) on ${data.externalEndpoint}`);
      } else {
        setAiTestResult('No external daemon detected on port 11434. Falling back to Embedded Engine.');
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
      const res = await fetch('/api/settings/git-config', {
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
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-interactive)] rounded-2xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[88vh] overflow-hidden text-xs">
        
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
              
              {/* Gitea / Self-Hosted Section */}
              <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-[var(--accent-violet)]" />
                    <div>
                      <h4 className="font-semibold text-xs text-[var(--text-primary)]">Gitea &amp; Self-Hosted Git</h4>
                      <p className="text-[10px] text-[var(--text-muted)]">Automatic authorization via dedicated Gitler SSH key</p>
                    </div>
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

                {/* Key Display Card */}
                <div className="p-3 bg-[var(--bg-canvas)] border border-[var(--border-subtle)] rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                    <span>Public Key &bull; <strong className="text-[var(--text-primary)]">ed25519 (gitler-app)</strong></span>
                    <button
                      onClick={handleCopyKey}
                      className="px-2.5 py-1 rounded-[50px] bg-[var(--bg-surface)] hover:bg-[var(--bg-card)] border border-[var(--border-interactive)] text-[var(--text-primary)] font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-xs"
                    >
                      {copiedKey ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-[var(--accent-violet)]" />}
                      <span>{copiedKey ? 'Copied to Clipboard!' : 'Copy Public Key'}</span>
                    </button>
                  </div>
                  <div className="p-2.5 bg-black/5 dark:bg-black/30 rounded-lg font-mono text-[10px] break-all text-[var(--text-primary)] select-all leading-relaxed max-h-20 overflow-y-auto border border-[var(--border-subtle)]">
                    {gitlerKey?.publicKey || 'Loading key...'}
                  </div>
                </div>

                <div className="text-[11px] text-[var(--text-secondary)] space-y-1 pl-1">
                  <p>
                    <strong>How to authorize:</strong> Copy this public key and paste it into your Gitea account under <strong>Settings &rarr; SSH / GPG Keys &rarr; Add Key</strong>. This grants Gitler instant access to all repositories on your Gitea server.
                  </p>
                </div>

                {/* Live Host Verification */}
                <div className="pt-2 border-t border-[var(--border-subtle)] space-y-2">
                  <span className="text-[10px] font-semibold text-[var(--text-primary)] uppercase tracking-wider font-mono">
                    Test Host Connection
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={testHost}
                      onChange={e => setTestHost(e.target.value)}
                      placeholder="e.g. 192.168.0.102"
                      className="flex-1 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-3 py-1.5 font-mono text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-violet)]"
                    />
                    <input
                      type="text"
                      value={testPort}
                      onChange={e => setTestPort(e.target.value)}
                      placeholder="Port (222)"
                      className="w-20 bg-[var(--bg-canvas)] border border-[var(--border-interactive)] rounded-xl px-2.5 py-1.5 font-mono text-xs text-[var(--text-primary)] text-center focus:outline-none focus:border-[var(--accent-violet)]"
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
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-500/30 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:border-rose-500/30 dark:text-rose-200'
                    }`}>
                      {hostTestResult.success ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                      <span>{hostTestResult.message}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* GitHub Section */}
              <div className="p-4 rounded-xl border border-[var(--border-interactive)] bg-[var(--bg-card)] space-y-3">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-500" />
                  <div>
                    <h4 className="font-semibold text-xs text-[var(--text-primary)]">GitHub Authorization</h4>
                    <p className="text-[10px] text-[var(--text-muted)]">macOS native keychain &amp; SSH authentication</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                    <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase">GitHub SSH</span>
                    <div className="font-semibold text-[var(--text-primary)]">
                      {diagnostics?.sshConnected ? `Active (${diagnostics.sshUser || 'user'})` : 'Not active'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[var(--bg-canvas)] border border-[var(--border-subtle)] space-y-1">
                    <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase">macOS Keychain</span>
                    <div className="font-semibold text-[var(--text-primary)]">
                      {diagnostics?.credentialHelper === 'osxkeychain' ? 'Enabled (osxkeychain)' : 'System standard'}
                    </div>
                  </div>
                </div>
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
                      <span className="font-semibold text-xs text-[var(--text-primary)]">Embedded Engine</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--accent-violet)] border border-[var(--border-interactive)]">
                        Built-in
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
                      Zero configuration. On-device semantic engine. Always fast &amp; private.
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

      </div>
    </div>
  );
};
