import path from 'path';

export interface LocalAIStatus {
  available: boolean;
  provider: 'embedded' | 'ollama' | 'lmstudio' | 'none';
  endpoint: string;
  models: string[];
  activeModel: string;
  mode?: 'embedded' | 'external';
  hasExternal?: boolean;
  externalProvider?: 'ollama' | 'lmstudio' | 'none';
  externalEndpoint?: string;
  externalModels?: string[];
  externalActiveModel?: string;
}

export async function detectLocalAI(requestedMode?: string): Promise<LocalAIStatus> {
  let hasExternal = false;
  let externalProvider: 'ollama' | 'lmstudio' | 'none' = 'none';
  let externalEndpoint = '';
  let externalModels: string[] = [];
  let externalActiveModel = '';

  // 1. Probe Ollama quietly on localhost:11434
  try {
    const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(400), redirect: 'error' });
    if (res.ok) {
      const data = await res.json() as any;
      const models = (data.models || []).map((m: any) => m.name);
      if (models.length > 0) {
        hasExternal = true;
        externalProvider = 'ollama';
        externalEndpoint = 'http://127.0.0.1:11434';
        externalModels = models;
        externalActiveModel = models.find((m: string) => m.includes('qwen') || m.includes('gemma') || m.includes('llama')) || models[0];
      }
    }
  } catch {
    // Ollama not reachable
  }

  // 2. Probe LM Studio quietly on localhost:1234
  if (!hasExternal) {
    try {
      const res = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(400), redirect: 'error' });
      if (res.ok) {
        const data = await res.json() as any;
        const models = (data.data || []).map((m: any) => m.id);
        if (models.length > 0) {
          hasExternal = true;
          externalProvider = 'lmstudio';
          externalEndpoint = 'http://127.0.0.1:1234';
          externalModels = models;
          externalActiveModel = models[0];
        }
      }
    } catch {
      // LM Studio not reachable
    }
  }

  const mode = requestedMode === 'external' && hasExternal ? 'external' : 'embedded';

  if (mode === 'external') {
    return {
      available: true,
      provider: externalProvider,
      endpoint: externalEndpoint,
      models: externalModels,
      activeModel: externalActiveModel,
      mode: 'external',
      hasExternal,
      externalProvider,
      externalEndpoint,
      externalModels,
      externalActiveModel
    };
  }

  // Default: Built-in Native AI Engine (Incorporated directly inside Gitler)
  return {
    available: true,
    provider: 'embedded',
    endpoint: 'embedded://on-device',
    models: ['Gitler Commit Suggestions'],
    activeModel: 'Gitler Commit Suggestions (On-Device)',
    mode: 'embedded',
    hasExternal,
    externalProvider,
    externalEndpoint,
    externalModels,
    externalActiveModel
  };
}

export async function generateCommitMessage(options: {
  diff: string;
  repoName: string;
  changedFiles?: string[];
  provider?: string;
  model?: string;
  endpoint?: string;
}): Promise<{ message: string; source: 'embedded' | 'local-ai' | 'smart-heuristic'; provider: string; model: string }> {
  const { diff, repoName, changedFiles = [], provider, model, endpoint } = options;

  if (endpoint !== undefined && !['http://127.0.0.1:11434', 'http://127.0.0.1:1234'].includes(endpoint)) {
    throw new Error('Only the supported local model endpoints are allowed.');
  }

  // If user explicitly requests external provider and it's active
  if (provider === 'ollama' || provider === 'lmstudio' || provider === 'external') {
    const aiStatus = await detectLocalAI('external');
    if (aiStatus.hasExternal) {
      const targetProvider = aiStatus.externalProvider;
      const targetModel = model || aiStatus.externalActiveModel || '';
      if (!targetModel) throw new Error('No local model is selected.');
      const targetEndpoint = aiStatus.externalEndpoint;

      const trimmedDiff = diff.length > 5000 ? diff.slice(0, 5000) + '\n...[diff truncated for length]' : diff;
      const prompt = `You are an expert Git assistant. Generate a clean, conventional commit message based on the following diff for repository "${repoName}".

Rules:
1. Conventional Commits format: <type>(<scope>): <concise subject>
2. Follow with 2-3 bullet points with concrete details.
3. Keep the subject line under 72 characters.
4. No backticks, quotes or conversational text.

Changed files:
${changedFiles.join('\n')}

Diff:
${trimmedDiff}
`;

      try {
        if (targetProvider === 'ollama') {
          const response = await fetch(`${targetEndpoint}/api/generate`, {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: targetModel,
              prompt: prompt,
              stream: false,
              think: false,
              options: { temperature: 0.2, num_predict: 120 }
            }),
            signal: AbortSignal.timeout(10000)
          });
          if (response.ok) {
            const data = await response.json() as any;
            const msg = (data.response || data.thinking || '').trim();
            if (msg) {
              return {
                message: cleanCommitMessage(msg),
                source: 'local-ai',
                provider: `Ollama (${targetModel})`,
                model: targetModel
              };
            }
          }
        } else if (targetProvider === 'lmstudio') {
          const response = await fetch(`${targetEndpoint}/v1/chat/completions`, {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: targetModel,
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3
            }),
            signal: AbortSignal.timeout(10000)
          });
          if (response.ok) {
            const data = await response.json() as any;
            const msg = data.choices?.[0]?.message?.content?.trim();
            if (msg) {
              return {
                message: cleanCommitMessage(msg),
                source: 'local-ai',
                provider: `LM Studio (${targetModel})`,
                model: targetModel
              };
            }
          }
        }
      } catch (err) {
        console.warn('External AI query failed, falling back to Gitler Commit Suggestions:', err);
      }
    }
  }

  // Primary: Gitler Incorporated Built-in Commit Suggestions
  const embeddedMsg = generateEmbeddedCommit(changedFiles, diff, repoName);
  return {
    message: embeddedMsg,
    source: 'embedded',
    provider: 'Gitler Commit Suggestions',
    model: 'Built-in Heuristics'
  };
}

function cleanCommitMessage(raw: string): string {
  let cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim();
  return cleaned;
}

/**
 * Analyzes staged files and diff content to generate semantic Conventional Commit messages.
 */
export function generateEmbeddedCommit(files: string[], diff: string, _repoName: string): string {
  const uniqueFiles = [...new Set(files)];
  if (!uniqueFiles.length) return 'chore: update staged changes';

  // 1. Analyze file types and paths
  const hasBuild = uniqueFiles.some(f => /package\.json|electron-builder\.yml|vite\.config|tsconfig|scripts\//.test(f));
  const hasWorkflows = uniqueFiles.some(f => /\.github\/workflows\//.test(f));
  const hasSecurity = uniqueFiles.some(f => /security\.ts|access|sanitize|auth/i.test(f));
  const hasProviders = uniqueFiles.some(f => /providerService|SettingsModal|RemoteAuthModal|gitea|gitlab|github/i.test(f));
  const hasServer = uniqueFiles.some(f => /^server\//.test(f));
  const hasUI = uniqueFiles.some(f => /^src\//.test(f));
  const hasTests = uniqueFiles.some(f => /tests\/|test\.ts|spec\.ts/.test(f));
  const hasDocsOnly = uniqueFiles.every(f => /\.md$|(^|\/)docs\//i.test(f));
  const hasTestsOnly = uniqueFiles.every(f => /test|spec/i.test(f));

  // 2. Deep diff inspection for specific features and changes
  const hasElectronUpgrade = diff.includes('"electron":') || diff.includes('electron@') || diff.includes('electron:');
  const hasBuilderUpgrade = diff.includes('"electron-builder":') || diff.includes('electron-builder@');
  const hasNotarize = diff.includes('notarize:') || diff.includes('notarization') || diff.includes('notarize: true');
  const hasVerifyPackage = diff.includes('verify-package') || diff.includes('verify:package') || uniqueFiles.some(f => f.includes('verify-package'));
  const hasCheckWorkflow = uniqueFiles.some(f => f.includes('check.yml'));

  // Security & access control inspection
  const hasAccessControl = diff.includes('RepositoryAccess') || diff.includes('installAccessControl') || uniqueFiles.some(f => f.includes('security.ts'));

  // Provider & SSH key inspection
  const hasProviderSync = diff.includes('providerService') || diff.includes('/api/auth/providers') || diff.includes('sync-ssh-key');
  const hasSshAlgorithms = diff.includes('ed25519') && diff.includes('rsa');

  // UI inspection
  const hasSettingsModalChange = uniqueFiles.some(f => f.includes('SettingsModal'));

  // 3. Compose Subject & Type
  let type = 'chore';
  let scope = '';
  let subject = '';
  const bulletPoints: string[] = [];

  if (hasDocsOnly) {
    type = 'docs';
    subject = uniqueFiles.length === 1
      ? `update ${uniqueFiles[0]}`
      : 'update project documentation and technical specifications';
    bulletPoints.push('Update documentation, architecture guides, and technical notes');
  } else if (hasTestsOnly) {
    type = 'test';
    subject = 'add automated test coverage and test suites';
    bulletPoints.push('Add unit tests for core functionality and verify behavior');
  } else if (hasBuild && (hasElectronUpgrade || hasBuilderUpgrade || hasNotarize || hasVerifyPackage)) {
    type = 'feat';
    scope = 'build';
    const parts: string[] = [];
    if (hasElectronUpgrade && hasBuilderUpgrade) {
      parts.push('update Electron and electron-builder versions');
    } else if (hasElectronUpgrade) {
      parts.push('update Electron version');
    } else if (hasBuilderUpgrade) {
      parts.push('update electron-builder version');
    }
    if (hasNotarize) parts.push('enable notarization');
    if (hasVerifyPackage) parts.push('enhance package verification');

    if (parts.length === 1) {
      subject = parts[0];
    } else if (parts.length === 2) {
      subject = `${parts[0]} and ${parts[1]}`;
    } else if (parts.length > 2) {
      subject = `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
    } else {
      subject = 'modernize build configuration and packaging dependencies';
    }

    // Detailed bullet points
    if (hasElectronUpgrade || hasBuilderUpgrade) {
      bulletPoints.push('Upgrade Electron and electron-builder to latest stable releases');
    }
    if (hasNotarize) {
      bulletPoints.push('Configure macOS hardened runtime, code signing, and notarization workflows');
    }
    if (hasVerifyPackage || hasCheckWorkflow) {
      bulletPoints.push('Add automated package verification script and CI check workflows');
    }
    if (hasAccessControl) {
      bulletPoints.push('Implement repository access control and path traversal safeguards');
    }
    if (hasProviders) {
      bulletPoints.push('Add 1-click Git provider authentication and automated SSH key synchronization');
    }
    if (hasTests) {
      bulletPoints.push('Add automated test suites for API endpoints and Git operations');
    }
  } else if (hasProviderSync || hasProviders) {
    type = 'feat';
    scope = 'auth';
    subject = hasSshAlgorithms
      ? 'add Git provider integration and automated SSH key synchronization'
      : 'add Git provider integration for GitHub, GitLab, and Gitea';
    bulletPoints.push('Add 1-click authentication flows for GitHub, GitLab, and Gitea accounts');
    bulletPoints.push('Automate SSH key installation via provider REST APIs');
    if (hasSshAlgorithms) {
      bulletPoints.push('Support both Ed25519 and RSA-4096 SSH key generation for maximum host compatibility');
    }
    if (hasSettingsModalChange) {
      bulletPoints.push('Enhance Settings modal layout and remove internal viewport scrolling');
    }
  } else if (hasAccessControl) {
    type = 'feat';
    scope = 'security';
    subject = 'implement repository access control and path traversal protection';
    bulletPoints.push('Enforce strict repository boundary checks and path validation');
    bulletPoints.push('Prevent unauthorized filesystem access outside selected workspaces');
  } else if (hasUI && !hasServer) {
    type = 'feat';
    scope = 'ui';
    const changedComponents = uniqueFiles
      .filter(f => f.includes('components/'))
      .map(f => path.basename(f, path.extname(f)));
    if (changedComponents.length > 0) {
      subject = `enhance ${changedComponents.slice(0, 2).join(' and ')} interface`;
      bulletPoints.push(`Refine ${changedComponents.slice(0, 3).join(', ')} components and user interactions`);
    } else {
      subject = 'update application interface and styling';
      bulletPoints.push('Improve component layout, theme styling, and visual hierarchy');
    }
  } else if (hasServer) {
    type = 'feat';
    scope = 'server';
    subject = 'enhance backend services and API endpoints';
    bulletPoints.push('Update server request handlers and backend Git automation services');
    if (hasTests) bulletPoints.push('Update test fixtures to match new backend behaviors');
  } else {
    type = 'chore';
    const mainFile = uniqueFiles[0];
    subject = uniqueFiles.length === 1 ? `update ${mainFile}` : `update ${uniqueFiles.length} files across project`;
    bulletPoints.push(`Update ${uniqueFiles.slice(0, 3).join(', ')}${uniqueFiles.length > 3 ? ` and ${uniqueFiles.length - 3} other files` : ''}`);
  }

  const header = scope ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`;
  const formattedHeader = header.length > 120 ? header.slice(0, 119) + '…' : header;

  if (bulletPoints.length > 0) {
    return `${formattedHeader}\n\n${bulletPoints.map(p => `- ${p}`).join('\n')}`;
  }

  return formattedHeader;
}
