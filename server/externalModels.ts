// Streaming chat with a local LM Studio or Ollama server. Only these fixed loopback endpoints are used.
export type ExternalProvider = 'lmstudio' | 'ollama';
export const externalEndpoints: Record<ExternalProvider, string> = { lmstudio: 'http://127.0.0.1:1234', ollama: 'http://127.0.0.1:11434' };

// LM Studio reports the context it loaded the model with; Ollama uses the size Git Mate requests.
export async function externalContextTokens(provider: ExternalProvider, model: string) {
  if (provider === 'ollama') return 16384;
  try {
    const res = await fetch(`${externalEndpoints.lmstudio}/api/v0/models`, { redirect: 'error', signal: AbortSignal.timeout(1500) });
    const entry = ((await res.json()) as any).data?.find((item: any) => item.id === model);
    return Number(entry?.loaded_context_length || entry?.max_context_length) || 8192;
  } catch { return 8192; }
}

// Removes <think>…</think> blocks from a stream whose tags may be split across chunks.
export function thoughtFilter() {
  let inside = false; let pending = '';
  return (chunk: string) => {
    let text = pending + chunk; pending = ''; let out = '';
    while (text) {
      const tag = inside ? '</think>' : '<think>'; const index = text.indexOf(tag);
      if (index === -1) {
        const keep = [...Array(tag.length - 1).keys()].map(n => n + 1).reverse().find(n => tag.startsWith(text.slice(-n))) || 0;
        if (!inside) out += text.slice(0, text.length - keep);
        pending = text.slice(text.length - keep); break;
      }
      if (!inside) out += text.slice(0, index);
      text = text.slice(index + tag.length); inside = !inside;
    }
    return out;
  };
}

export async function streamExternalChat(options: { provider: ExternalProvider; model: string; system: string; user: string; maxTokens: number; signal: AbortSignal; onText: (text: string) => void }) {
  const messages = [{ role: 'system', content: options.system }, { role: 'user', content: options.user }];
  const lmstudio = options.provider === 'lmstudio';
  const res = await fetch(lmstudio ? `${externalEndpoints.lmstudio}/v1/chat/completions` : `${externalEndpoints.ollama}/api/chat`, {
    method: 'POST', redirect: 'error', signal: options.signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(lmstudio
      ? { model: options.model, messages, stream: true, temperature: 0.3, max_tokens: options.maxTokens }
      : { model: options.model, messages, stream: true, think: false, options: { temperature: 0.3, num_ctx: 16384, num_predict: options.maxTokens } })
  });
  if (!res.ok || !res.body) throw new Error(`${lmstudio ? 'LM Studio' : 'Ollama'} did not answer (HTTP ${res.status}). Check that the model is loaded.`);
  const filter = thoughtFilter(); const decoder = new TextDecoder(); let buffer = '';
  const handle = (line: string) => {
    const data = lmstudio ? line.replace(/^data:\s*/, '') : line;
    if (!data.trim() || data.trim() === '[DONE]') return;
    let event: any; try { event = JSON.parse(data); } catch { return; }
    if (event.error) throw new Error(String(event.error.message || event.error));
    const text = filter(lmstudio ? event.choices?.[0]?.delta?.content || '' : event.message?.content || '');
    if (text) options.onText(text);
  };
  for await (const chunk of res.body as any) {
    buffer += decoder.decode(chunk, { stream: true }); const lines = buffer.split('\n'); buffer = lines.pop() || '';
    lines.forEach(handle);
  }
  buffer += decoder.decode(); if (buffer.trim()) handle(buffer);
}
