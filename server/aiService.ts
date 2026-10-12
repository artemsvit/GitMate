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
1. Conventional Commits format: <type>(<scope>): <concise subject in imperative mood>
2. Keep the subject line lowercase, under 72 characters, with no trailing period.
3. Separate the subject line and body with one blank line.
4. Follow with 2-3 concise bullet points explaining what was changed and why.
5. Each bullet must start with a hyphen, space, and capital letter: "- Action description"
6. Do not include markdown code fences, quotes, backticks, or conversational preamble.

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

function sanitizeScope(val: string): string {
  const cleaned = val
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/-$/, '');
  return cleaned.slice(0, 16);
}

function inferScope(files: string[]): string {
  if (!files.length) return '';
  if (files.length === 1) {
    const f = files[0];
    const base = path.basename(f);
    if (/^package(?:-lock)?\.json$/i.test(base)) return 'deps';
    if (/^readme(\..+)?$/i.test(base)) return 'readme';
    if (/^license(\..+)?$/i.test(base)) return 'license';
    return sanitizeScope(path.basename(f, path.extname(f)));
  }

  const dirParts = files.map(f => {
    const dir = path.dirname(f);
    return dir === '.' ? [] : dir.split(/[\/\\]/).filter(Boolean);
  });

  if (dirParts.every(p => p.length > 0)) {
    const minLen = Math.min(...dirParts.map(p => p.length));
    const common: string[] = [];
    for (let i = 0; i < minLen; i++) {
      const seg = dirParts[0][i];
      if (dirParts.every(p => p[i] === seg)) {
        common.push(seg);
      } else {
        break;
      }
    }
    if (common.length > 0) {
      const candidates = common.filter(s => !['src', 'app', 'source', 'pkg', '.'].includes(s.toLowerCase()));
      const selected = candidates.length > 0 ? candidates[candidates.length - 1] : common[common.length - 1];
      const cleaned = sanitizeScope(selected.replace(/^\./, ''));
      if (cleaned) return cleaned;
    }
  }

  return '';
}

function extractCommonTopic(files: string[]): string {
  const baseNames = files.map(f => path.basename(f, path.extname(f)).toLowerCase());
  const wordLists = baseNames.map(name => name.split(/[-_.\s]+/).filter(w => w.length > 2));
  if (!wordLists.length || !wordLists[0].length) return '';

  const commonWords: string[] = [];
  for (const word of wordLists[0]) {
    if (wordLists.every(list => list.includes(word)) && !commonWords.includes(word)) {
      commonWords.push(word);
    }
  }

  const meaningful = commonWords.filter(w => !['image', 'screenshot', 'file', 'asset', 'page', 'artifact', 'test', 'flow'].includes(w));
  if (meaningful.length > 0) return meaningful.slice(0, 3).join(' ');
  if (commonWords.length > 0) return commonWords.slice(0, 2).join(' ');
  return '';
}

function formatCommitMessage(type: string, scope: string, subject: string, bulletPoints: string[]): string {
  let cleanedSubject = subject.trim().replace(/\.$/, '');
  if (cleanedSubject.length > 0) {
    cleanedSubject = cleanedSubject.charAt(0).toLowerCase() + cleanedSubject.slice(1);
  }

  const scopePrefix = scope ? `${type}(${scope}): ` : `${type}: `;
  const maxSubjectLen = Math.max(48, 72 - scopePrefix.length);
  if (cleanedSubject.length > maxSubjectLen) {
    cleanedSubject = cleanedSubject.slice(0, maxSubjectLen - 1).trim() + '…';
  }

  const header = `${scopePrefix}${cleanedSubject}`;
  const validBullets = bulletPoints
    .map(b => b.trim())
    .filter(Boolean)
    .map(b => {
      const cap = b.charAt(0).toUpperCase() + b.slice(1);
      return `- ${cap}`;
    });

  if (validBullets.length > 0) {
    return `${header}\n\n${validBullets.join('\n')}`;
  }
  return header;
}

/**
 * Analyzes staged files and diff content to generate semantic Conventional Commit messages.
 */
export function generateEmbeddedCommit(files: string[], diff: string, _repoName: string): string {
  const uniqueFiles = [...new Set(files.filter(Boolean))];
  if (!uniqueFiles.length) return 'chore: update staged changes';

  // 1. High-confidence Gitler repository build detections
  const hasBuildTooling = uniqueFiles.some(f => /package\.json|electron-builder\.yml|vite\.config|tsconfig/.test(f));
  const hasElectronUpgrade = diff.includes('"electron":') || diff.includes('electron@') || diff.includes('notarize') || diff.includes('verify-package');
  if (hasBuildTooling && hasElectronUpgrade) {
    return formatCommitMessage('feat', 'build', 'update Electron packaging and build configuration', [
      'Upgrade build toolchain and packaging configurations',
      'Ensure hardened runtime, code signing, and bundle verification'
    ]);
  }

  const hasProviderSync = (diff.includes('providerService') || diff.includes('/api/auth/providers') || diff.includes('sync-ssh-key')) &&
    uniqueFiles.some(f => /providerService|SettingsModal|RemoteAuthModal/i.test(f));
  if (hasProviderSync) {
    return formatCommitMessage('feat', 'auth', 'add Git provider integration and automated SSH key synchronization', [
      'Add 1-click authentication flows for GitHub, GitLab, and Gitea accounts',
      'Automate SSH key installation via provider REST APIs'
    ]);
  }

  // 2. File and path categorization
  const isImageOrMedia = (f: string) => /\.(jpe?g|png|gif|svg|webp|ico|bmp|avif|mp4|webm)$/i.test(f);
  const isDoc = (f: string) => /\.(md|markdown|txt|rst|adoc)$/i.test(f) || /^(README|LICENSE|CHANGELOG|CONTRIBUTING)(\..+)?$/i.test(path.basename(f));
  const isTest = (f: string) => /(?:^|[._/-])(?:test|spec)\.[a-z0-9]+$/i.test(f) || /(?:^|\/)(?:__tests__|tests?)\//i.test(f);
  const isStyle = (f: string) => /\.(css|scss|sass|less|styl)$/i.test(f);
  const isCi = (f: string) => /^\.github\/(?:workflows|actions)\/|^\.gitlab-ci|\.circleci/i.test(f);
  const isConfigOrBuild = (f: string) => /package\.json|package-lock\.json|pnpm-lock|yarn\.lock|Cargo\.toml|go\.mod|requirements\.txt|tsconfig|\.(?:config|rc)\.[a-z0-9]+$/i.test(f);
  const isUi = (f: string) => /^(?:src\/)?(?:components|views|pages|screens|ui|app)\/|\.(?:tsx|jsx|vue|svelte)$/i.test(f);
  const isServer = (f: string) => /^(?:server|backend|api|controllers|routes|services)\//i.test(f);

  const mediaFiles = uniqueFiles.filter(isImageOrMedia);
  const docFiles = uniqueFiles.filter(isDoc);
  const testFiles = uniqueFiles.filter(isTest);
  const styleFiles = uniqueFiles.filter(isStyle);
  const ciFiles = uniqueFiles.filter(isCi);
  const configFiles = uniqueFiles.filter(isConfigOrBuild);
  const uiFiles = uniqueFiles.filter(isUi);
  const serverFiles = uniqueFiles.filter(isServer);

  // 3. Diff content heuristics
  const hasAdditions = /^\+[^+]/m.test(diff);
  const hasDeletions = /^-[^-]/m.test(diff);
  const isAllNew = diff.includes('new file mode') && !diff.includes('deleted file mode') && !hasDeletions;
  const hasFixKeywords = /(?:fix(?:es|ed)?|bug|patch|resolv(?:e|ed|es)|prevent|null-check|overflow|clipping|dismiss|fallback|catch|workaround|error)/i.test(diff);
  const hasNewFeatureKeywords = /(?:export\s+(?:function|const|class|type|interface)|router\.(?:get|post|put|delete)|app\.(?:get|post)|def\s+\w+|fn\s+\w+|class\s+\w+)/i.test(diff);
  const hasStyleKeywords = /(?:className|class=|style=|theme|color|bg-|text-|border-|padding|margin|font-|layout)/i.test(diff);
  const hasRefactorKeywords = /(?:refactor|cleanup|restructure|deprecate|modular|simplify)/i.test(diff);
  const hasPerfKeywords = /(?:useMemo|useCallback|cache|throttle|debounce|optimize|lazy)/i.test(diff);

  // 4. Derive scope
  let scope = inferScope(uniqueFiles);

  // 5. Determine type, subject, and bullets
  let type = 'chore';
  let subject = '';
  const bullets: string[] = [];

  // Branch A: Media / Artifacts files (e.g. .codex/artifacts/web-actor-*.jpg)
  if (mediaFiles.length === uniqueFiles.length) {
    scope = scope || (uniqueFiles.some(f => f.includes('artifact')) ? 'artifacts' : 'assets');
    type = isAllNew ? 'feat' : 'chore';
    const commonTopic = extractCommonTopic(uniqueFiles);
    if (commonTopic) {
      subject = `${isAllNew ? 'add' : 'update'} ${commonTopic} preview artifacts`;
      bullets.push(`Add and update visual capture assets for ${commonTopic}`);
    } else {
      subject = `${isAllNew ? 'add' : 'update'} visual previews and media assets`;
      bullets.push('Update image previews and graphic assets');
    }
    const sampleNames = uniqueFiles.map(f => path.basename(f, path.extname(f))).slice(0, 3).join(', ');
    bullets.push(`Refresh captured previews for ${sampleNames}${uniqueFiles.length > 3 ? ` and ${uniqueFiles.length - 3} other files` : ''}`);
  }
  // Branch B: Documentation only
  else if (docFiles.length === uniqueFiles.length) {
    type = 'docs';
    scope = scope || (uniqueFiles.length === 1 ? sanitizeScope(path.basename(uniqueFiles[0], path.extname(uniqueFiles[0]))) : 'docs');
    const mainDoc = uniqueFiles.length === 1 ? path.basename(uniqueFiles[0]) : 'documentation';
    subject = `update ${mainDoc} and specifications`;
    bullets.push(`Update project documentation in ${uniqueFiles.slice(0, 2).map(f => path.basename(f)).join(', ')}`);
    bullets.push('Clarify system instructions, configurations, and technical details');
  }
  // Branch C: Tests only
  else if (testFiles.length === uniqueFiles.length) {
    type = 'test';
    scope = scope || 'tests';
    subject = hasFixKeywords ? 'fix regression tests and assertions' : 'add automated test coverage and assertions';
    bullets.push(`Update test suites across ${uniqueFiles.slice(0, 2).map(f => path.basename(f)).join(', ')}`);
    bullets.push('Verify edge cases, error handling, and expected behaviors');
  }
  // Branch D: CI / Workflows only
  else if (ciFiles.length === uniqueFiles.length) {
    type = 'ci';
    scope = scope || 'workflows';
    subject = hasFixKeywords ? 'fix automated workflow pipeline configuration' : 'update CI automation and build pipelines';
    bullets.push('Update GitHub Actions workflow triggers and step definitions');
    bullets.push('Ensure consistent CI testing and release automation');
  }
  // Branch E: Config / Dependencies only
  else if (configFiles.length === uniqueFiles.length) {
    type = 'build';
    scope = scope || 'deps';
    subject = hasFixKeywords ? 'fix dependency configuration and build scripts' : 'update project dependencies and configuration';
    bullets.push(`Update configuration files in ${uniqueFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}`);
    bullets.push('Synchronize package dependencies and build toolchain settings');
  }
  // Branch F: Styles only
  else if (styleFiles.length === uniqueFiles.length) {
    type = 'style';
    scope = scope || 'styles';
    subject = 'refine stylesheet rules and theme appearance';
    bullets.push('Update CSS classes, layout styling, and color contrast tokens');
  }
  // Branch G: UI components
  else if (uiFiles.length > 0 && serverFiles.length === 0) {
    scope = scope || (uiFiles.length === 1 ? sanitizeScope(path.basename(uiFiles[0], path.extname(uiFiles[0]))) : 'ui');
    const componentNames = uiFiles.map(f => path.basename(f, path.extname(f))).slice(0, 2).join(' and ');
    if (hasFixKeywords) {
      type = 'fix';
      subject = `resolve ${componentNames} interaction issues`;
      bullets.push(`Fix component behavior and edge-case handling in ${componentNames}`);
      if (hasStyleKeywords) bullets.push('Refine visual styles, focus contrast, and container layout');
    } else if (isAllNew || hasNewFeatureKeywords) {
      type = 'feat';
      subject = `add ${componentNames} component`;
      bullets.push(`Implement ${componentNames} interface and user controls`);
    } else {
      type = hasRefactorKeywords ? 'refactor' : 'feat';
      subject = `enhance ${componentNames} controls and layout`;
      bullets.push(`Update ${componentNames} component logic and appearance`);
    }
    if (bullets.length < 2) {
      bullets.push('Improve interactive responsiveness and visual consistency');
    }
  }
  // Branch H: Server / Backend code
  else if (serverFiles.length > 0 && uiFiles.length === 0) {
    scope = scope || (serverFiles.length === 1 ? sanitizeScope(path.basename(serverFiles[0], path.extname(serverFiles[0]))) : 'server');
    const moduleNames = serverFiles.map(f => path.basename(f, path.extname(f))).slice(0, 2).join(' and ');
    if (hasFixKeywords) {
      type = 'fix';
      subject = `resolve ${moduleNames} error handling and execution`;
      bullets.push(`Fix issue handling and runtime fallbacks in ${moduleNames}`);
    } else if (hasNewFeatureKeywords || isAllNew) {
      type = 'feat';
      subject = `add ${moduleNames} endpoint and service logic`;
      bullets.push(`Implement service capabilities and API handlers in ${moduleNames}`);
    } else {
      type = hasRefactorKeywords ? 'refactor' : 'feat';
      subject = `enhance ${moduleNames} backend processing`;
      bullets.push(`Update request processing and service logic in ${moduleNames}`);
    }
    if (bullets.length < 2) {
      bullets.push('Ensure robust error handling and API contract compatibility');
    }
  }
  // Branch I: Mixed or General Codebase
  else {
    scope = scope || inferScope(uniqueFiles) || '';
    if (hasFixKeywords) {
      type = 'fix';
      subject = scope ? `resolve ${scope} issues and improve reliability` : 'resolve application bugs and edge cases';
      bullets.push('Fix identified runtime errors and edge-case boundary conditions');
      bullets.push(`Update affected modules across ${uniqueFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}`);
    } else if (isAllNew || hasNewFeatureKeywords) {
      type = 'feat';
      subject = scope ? `add ${scope} feature and supporting logic` : 'implement new features and capabilities';
      bullets.push('Add new modules and functionality');
      bullets.push(`Expand codebase capabilities across ${uniqueFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}`);
    } else if (hasRefactorKeywords) {
      type = 'refactor';
      subject = scope ? `restructure ${scope} architecture and flow` : 'refactor codebase structure and simplify logic';
      bullets.push('Clean up module structure and improve maintainability');
      bullets.push(`Refactor components across ${uniqueFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}`);
    } else if (hasPerfKeywords) {
      type = 'perf';
      subject = scope ? `optimize ${scope} performance and responsiveness` : 'optimize application performance and resource usage';
      bullets.push('Reduce unnecessary recomputations and optimize memory usage');
    } else {
      type = 'chore';
      subject = scope ? `update ${scope} components and configurations` : 'update project components and assets';
      bullets.push(`Update changes across ${uniqueFiles.slice(0, 3).map(f => path.basename(f)).join(', ')}${uniqueFiles.length > 3 ? ` and ${uniqueFiles.length - 3} other files` : ''}`);
    }
  }

  return formatCommitMessage(type, scope, subject, bullets);
}
