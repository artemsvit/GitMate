export interface LocalAIStatus {
  available: boolean;
  provider: 'ollama' | 'lmstudio' | 'none';
  endpoint: string;
  models: string[];
  activeModel: string;
}

export async function detectLocalAI(): Promise<LocalAIStatus> {
  // Check Ollama
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json() as any;
      const models = (data.models || []).map((m: any) => m.name);
      return {
        available: true,
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
        models,
        activeModel: models.find((m: string) => m.includes('gemma')) || models[0] || 'gemma2'
      };
    }
  } catch {
    // Ollama not reachable
  }

  // Check LM Studio / Local OpenAI server
  try {
    const res = await fetch('http://localhost:1234/v1/models', { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const data = await res.json() as any;
      const models = (data.data || []).map((m: any) => m.id);
      return {
        available: true,
        provider: 'lmstudio',
        endpoint: 'http://localhost:1234',
        models,
        activeModel: models[0] || 'local-model'
      };
    }
  } catch {
    // LM Studio not reachable
  }

  return {
    available: false,
    provider: 'none',
    endpoint: '',
    models: [],
    activeModel: ''
  };
}

export async function generateCommitMessage(options: {
  diff: string;
  repoName: string;
  changedFiles?: string[];
  provider?: string;
  model?: string;
  endpoint?: string;
}): Promise<{ message: string; source: 'local-ai' | 'smart-heuristic'; provider: string; model: string }> {
  const { diff, repoName, changedFiles = [], provider, model, endpoint } = options;

  // If diff is too long, truncate safely to ~4000 characters
  const trimmedDiff = diff.length > 5000 ? diff.slice(0, 5000) + '\n...[diff truncated for length]' : diff;

  const aiStatus = await detectLocalAI();
  const targetProvider = provider || aiStatus.provider;
  const targetModel = model || aiStatus.activeModel;

  const prompt = `You are an expert Git assistant. Generate a clean, conventional commit message based on the following diff for the repository "${repoName}".

Rules:
1. Follow the Conventional Commits format: <type>(<scope>): <concise subject>
2. Optional 2-3 bullet points for details if the change has multiple parts.
3. Keep the subject line under 72 characters.
4. Do NOT wrap your answer in backticks or quotes. Do NOT add meta commentary like "Here is your commit message:".

Changed files:
${changedFiles.join('\n')}

Diff:
${trimmedDiff}
`;

  if (targetProvider === 'ollama' || aiStatus.provider === 'ollama') {
    const targetEndpoint = endpoint || 'http://localhost:11434';
    try {
      const response = await fetch(`${targetEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel || 'gemma2',
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3
          }
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (response.ok) {
        const data = await response.json() as any;
        const msg = data.response?.trim();
        if (msg) {
          return {
            message: cleanCommitMessage(msg),
            source: 'local-ai',
            provider: 'Ollama',
            model: targetModel || 'gemma2'
          };
        }
      }
    } catch (err) {
      console.warn('Ollama generate failed, falling back to heuristics:', err);
    }
  } else if (targetProvider === 'lmstudio' || aiStatus.provider === 'lmstudio') {
    const targetEndpoint = endpoint || 'http://localhost:1234';
    try {
      const response = await fetch(`${targetEndpoint}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel || 'local-model',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3
        }),
        signal: AbortSignal.timeout(20000)
      });

      if (response.ok) {
        const data = await response.json() as any;
        const msg = data.choices?.[0]?.message?.content?.trim();
        if (msg) {
          return {
            message: cleanCommitMessage(msg),
            source: 'local-ai',
            provider: 'LM Studio / LocalAI',
            model: targetModel || 'local-model'
          };
        }
      }
    } catch (err) {
      console.warn('LM Studio generate failed, falling back to heuristics:', err);
    }
  }

  // Fallback: Smart heuristic commit generator
  const heuristicMsg = generateHeuristicCommit(changedFiles, diff);
  return {
    message: heuristicMsg,
    source: 'smart-heuristic',
    provider: 'Rule-based Heuristic',
    model: 'Smart Parser'
  };
}

function cleanCommitMessage(raw: string): string {
  let cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/```$/i, '').trim();
  // Strip markdown quote chars if wrapped
  cleaned = cleaned.replace(/^["']|["']$/g, '').trim();
  return cleaned;
}

function generateHeuristicCommit(files: string[], diff: string): string {
  if (files.length === 0) {
    return 'chore: update project files';
  }

  const isDocs = files.every(f => f.toLowerCase().endsWith('.md') || f.toLowerCase().includes('readme') || f.toLowerCase().includes('doc'));
  if (isDocs) return `docs: update documentation in ${files.slice(0, 2).join(', ')}`;

  const isTest = files.every(f => f.includes('test') || f.includes('spec'));
  if (isTest) return `test: update unit and integration tests`;

  const isConfig = files.every(f => f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml') || f.endsWith('.toml') || f.startsWith('.'));
  if (isConfig) return `chore(config): update configuration files`;

  const isUI = files.some(f => f.endsWith('.tsx') || f.endsWith('.jsx') || f.endsWith('.css') || f.endsWith('.html') || f.endsWith('.vue'));
  const scope = files.length === 1 ? files[0].split('/').pop()?.split('.')[0] : 'core';

  if (diff.includes('+') && !diff.includes('-')) {
    return `feat(${scope}): add new implementation and components\n\n- Updated ${files.slice(0, 3).join(', ')}`;
  } else if (diff.includes('fix') || diff.includes('bug') || diff.includes('error')) {
    return `fix(${scope}): resolve issues and refine logic\n\n- Changes in ${files.slice(0, 3).join(', ')}`;
  } else if (isUI) {
    return `feat(ui): refine visual layout and interactions\n\n- Updated ${files.slice(0, 3).join(', ')}`;
  }

  return `refactor(${scope}): update implementation in ${files.slice(0, 3).join(', ')}`;
}
