import path from 'path';
import { buildCommitPrompt, commitInstructions, finalizeCommitMessage, splitDiff } from './commitMessage';
import { commitModelReady, generateCommitWithModel, modelSpec } from './copilotService';

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
  recentSubjects?: string[];
}): Promise<{ message: string; source: 'embedded' | 'local-ai' | 'smart-heuristic'; provider: string; model: string }> {
  const { diff, repoName, changedFiles = [], provider, model, endpoint, recentSubjects = [] } = options;

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

      const prompt = `${commitInstructions}\n\n${buildCommitPrompt({ repoName, diff, changedFiles, recentSubjects, budget: 12000 })}`;

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
              options: { temperature: 0.2, num_predict: 400 }
            }),
            signal: AbortSignal.timeout(60000)
          });
          if (response.ok) {
            const data = await response.json() as any;
            const msg = (data.response || data.thinking || '').trim();
            if (msg) {
              return {
                message: finalizeCommitMessage(msg),
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
            signal: AbortSignal.timeout(60000)
          });
          if (response.ok) {
            const data = await response.json() as any;
            const msg = data.choices?.[0]?.message?.content?.trim();
            if (msg) {
              return {
                message: finalizeCommitMessage(msg),
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

  // Primary: the downloaded on-device Copilot model.
  if (commitModelReady()) {
    try {
      const message = await generateCommitWithModel({ repoName, diff, changedFiles, recentSubjects });
      return { message, source: 'local-ai', provider: 'Gitler Copilot (on-device)', model: modelSpec.name };
    } catch (err) {
      console.warn('On-device commit generation failed, falling back to Gitler Commit Suggestions:', err);
    }
  }

  // Fallback: rule-based suggestions that need no model.
  const embeddedMsg = generateEmbeddedCommit(changedFiles, diff, repoName);
  return {
    message: embeddedMsg,
    source: 'embedded',
    provider: 'Gitler Commit Suggestions',
    model: 'Built-in Heuristics'
  };
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

  // Branch A: Media / Artifacts files (e.g. .codex/artifacts/web-actor-*.jpg)
  if (mediaFiles.length === uniqueFiles.length) {
    scope = scope || (uniqueFiles.some(f => f.includes('artifact')) ? 'artifacts' : 'assets');
    type = isAllNew ? 'feat' : 'chore';
    const commonTopic = extractCommonTopic(uniqueFiles);
    if (commonTopic) {
      subject = `${isAllNew ? 'add' : 'update'} ${commonTopic} preview artifacts`;
    } else {
      subject = `${isAllNew ? 'add' : 'update'} visual previews and media assets`;
    }
  }
  // Branch B: Documentation only
  else if (docFiles.length === uniqueFiles.length) {
    type = 'docs';
    scope = scope || (uniqueFiles.length === 1 ? sanitizeScope(path.basename(uniqueFiles[0], path.extname(uniqueFiles[0]))) : 'docs');
    const mainDoc = uniqueFiles.length === 1 ? path.basename(uniqueFiles[0]) : 'documentation';
    subject = `update ${mainDoc}`;
  }
  // Branch C: Tests only
  else if (testFiles.length === uniqueFiles.length) {
    type = 'test';
    scope = scope || 'tests';
    subject = hasFixKeywords ? 'fix regression tests and assertions' : 'add automated test coverage and assertions';
  }
  // Branch D: CI / Workflows only
  else if (ciFiles.length === uniqueFiles.length) {
    type = 'ci';
    scope = scope || 'workflows';
    subject = hasFixKeywords ? 'fix automated workflow pipeline configuration' : 'update CI automation and build pipelines';
  }
  // Branch E: Config / Dependencies only
  else if (configFiles.length === uniqueFiles.length) {
    type = 'build';
    scope = scope || 'deps';
    subject = hasFixKeywords ? 'fix dependency configuration and build scripts' : 'update project dependencies and configuration';
  }
  // Branch F: Styles only
  else if (styleFiles.length === uniqueFiles.length) {
    type = 'style';
    scope = scope || 'styles';
    subject = 'refine stylesheet rules and theme appearance';
  }
  // Branch G: UI components
  else if (uiFiles.length > 0 && serverFiles.length === 0) {
    scope = scope || (uiFiles.length === 1 ? sanitizeScope(path.basename(uiFiles[0], path.extname(uiFiles[0]))) : 'ui');
    const componentNames = uiFiles.map(f => path.basename(f, path.extname(f))).slice(0, 2).join(' and ');
    if (hasFixKeywords) {
      type = 'fix';
      subject = `resolve ${componentNames} interaction issues`;
    } else if (isAllNew || hasNewFeatureKeywords) {
      type = 'feat';
      subject = `add ${componentNames} component`;
    } else {
      type = hasRefactorKeywords ? 'refactor' : 'feat';
      subject = `enhance ${componentNames} controls and layout`;
    }
  }
  // Branch H: Server / Backend code
  else if (serverFiles.length > 0 && uiFiles.length === 0) {
    scope = scope || (serverFiles.length === 1 ? sanitizeScope(path.basename(serverFiles[0], path.extname(serverFiles[0]))) : 'server');
    const moduleNames = serverFiles.map(f => path.basename(f, path.extname(f))).slice(0, 2).join(' and ');
    if (hasFixKeywords) {
      type = 'fix';
      subject = `resolve ${moduleNames} error handling and execution`;
    } else if (hasNewFeatureKeywords || isAllNew) {
      type = 'feat';
      subject = `add ${moduleNames} endpoint and service logic`;
    } else {
      type = hasRefactorKeywords ? 'refactor' : 'feat';
      subject = `enhance ${moduleNames} backend processing`;
    }
  }
  // Branch I: Mixed or General Codebase
  else {
    scope = scope || inferScope(uniqueFiles) || '';
    if (hasFixKeywords) {
      type = 'fix';
      subject = scope ? `resolve ${scope} issues and improve reliability` : 'resolve application bugs and edge cases';
    } else if (isAllNew || hasNewFeatureKeywords) {
      type = 'feat';
      subject = scope ? `add ${scope} feature and supporting logic` : 'implement new features and capabilities';
    } else if (hasRefactorKeywords) {
      type = 'refactor';
      subject = scope ? `restructure ${scope} architecture and flow` : 'refactor codebase structure and simplify logic';
    } else if (hasPerfKeywords) {
      type = 'perf';
      subject = scope ? `optimize ${scope} performance and responsiveness` : 'optimize application performance and resource usage';
    } else {
      type = 'chore';
      subject = scope ? `update ${scope} components and configurations` : 'update project components and assets';
    }
  }

  // The body lists only facts from the diff: which files changed and by how much.
  const stats = splitDiff(diff);
  const facts = uniqueFiles.length > 1 ? uniqueFiles.slice(0, 5).map(file => {
    const stat = stats.find(entry => entry.path === file);
    if (!stat) return `Change ${file}`;
    const verb = /^new file mode/m.test(stat.text) ? 'Add' : /^deleted file mode/m.test(stat.text) ? 'Remove' : 'Change';
    return `${verb} ${file}${stat.binary ? '' : ` (+${stat.added} -${stat.removed})`}`;
  }).concat(uniqueFiles.length > 5 ? [`Change ${uniqueFiles.length - 5} more files`] : []) : [];
  return formatCommitMessage(type, scope, subject, facts);
}
