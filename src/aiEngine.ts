import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from './api';

// One AI source serves both commit messages and Chat: Git Mate Local AI (downloaded models) or a running LM Studio / Ollama.
export type AIMode = 'embedded' | 'external';
export interface ExternalChoice { provider: 'lmstudio' | 'ollama'; model: string }
const modeKey = 'gitler_ai_mode'; const externalKey = 'gitler_external_model'; const changed = 'gitmate-ai-engine';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch {} window.dispatchEvent(new Event(changed)); };

export function readAIMode(): AIMode { return read(modeKey) === 'external' ? 'external' : 'embedded'; }
export function readExternalChoice(): ExternalChoice | null {
  try { const value = JSON.parse(read(externalKey) || 'null'); return value && ['lmstudio', 'ollama'].includes(value.provider) && typeof value.model === 'string' ? value : null; } catch { return null; }
}
export function setAIMode(mode: AIMode) { write(modeKey, mode); }
export function setExternalChoice(choice: ExternalChoice) { write(externalKey, JSON.stringify(choice)); }
export function notifyModelChanged() { window.dispatchEvent(new Event(changed)); }

// "lmstudio-community/Qwen2.5-Coder-7B-Instruct-GGUF/qwen2.5-coder-7b-instruct-q4_k_m.gguf" → "Qwen2.5 Coder 7B"
export function friendlyModelName(id: string) {
  let name = id.split('/').filter(Boolean).pop() || id;
  name = name.replace(/\.gguf$/i, '').replace(/:latest$/i, '').replace(/[-_.]?(?:gguf|mlx|q\d(?:_[a-z0-9]+)*|[0-9]+bit|instruct|chat|it)(?=$|[-_:])/gi, '');
  name = name.replace(/:/g, ' ').replace(/[-_]+/g, ' ').trim();
  const all = name.split(/\s+/); const size = all.find(word => /^\d+(?:\.\d+)?[bm]$/i.test(word));
  // Keep the family name and the parameter size; drop version dates and extra tags.
  const picked = all.length <= 3 ? all : [...all.slice(0, 2), ...(size && !all.slice(0, 2).includes(size) ? [size] : [all[2]])];
  const words = picked.map(word => /^\d+(?:\.\d+)?[bm]$/i.test(word) || /^(?:gpt|oss|r\d|vl|e\d+b)$/i.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1));
  return words.join(' ') || id;
}

export function useAIEngine() {
  const [mode, setMode] = useState<AIMode>(readAIMode);
  const [external, setExternal] = useState<ExternalChoice | null>(readExternalChoice);
  const [localLabel, setLocalLabel] = useState('');
  const refresh = useCallback(async () => {
    setMode(readAIMode()); setExternal(readExternalChoice());
    try { const res = await apiFetch('/api/copilot/model'); if (res.ok) setLocalLabel((await res.json()).label || ''); } catch {}
  }, []);
  useEffect(() => { void refresh(); window.addEventListener(changed, refresh); return () => window.removeEventListener(changed, refresh); }, [refresh]);
  const label = mode === 'external' ? (external ? friendlyModelName(external.model) : '') : localLabel;
  return { mode, external, label };
}
