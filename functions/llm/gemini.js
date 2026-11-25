// Gemini adapter for the analysis: one call, JSON answer bound to a JSON schema, optional file parts
// (PDF or image, inline base64). Uses the generateContent endpoint, because the material may be a file
// (the sister apps call the Interactions API with text only).
// Returns { text, usage }; parsing and checks happen in engines/analysis/run.js.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class ProviderError extends Error {
  constructor(message, { status, unavailable = false } = {}) {
    super(message);
    this.status = status;
    this.unavailable = unavailable;
  }
}

export function geminiModel({ apiKey, model, schema, thinkingLevel = 'low', fetchImpl = fetch, timeoutMs = 150000 }) {
  if (!apiKey) throw new ProviderError('Gemini API key missing');
  if (!model) throw new ProviderError('model name missing');
  return {
    name: model,
    async complete({ system, text, files = [] }) {
      const parts = [];
      for (const f of files) parts.push({ inline_data: { mime_type: f.mimeType, data: f.data } });
      parts.push({ text });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetchImpl(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseJsonSchema: schema,
              thinkingConfig: { thinkingLevel },
            },
          }),
        });
      } finally {
        clearTimeout(timer);
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = JSON.stringify(json).slice(0, 400);
        // The configured model is unavailable: stop and ask, never substitute (CLAUDE.md).
        const unavailable = res.status === 404 || /model.*(not found|not supported|unknown)/i.test(msg);
        throw new ProviderError(`Gemini HTTP ${res.status}: ${msg}`, { status: res.status, unavailable });
      }
      const cand = json.candidates?.[0];
      if (!cand || cand.finishReason === 'SAFETY' || cand.finishReason === 'PROHIBITED_CONTENT') {
        throw new ProviderError(`Gemini returned no usable candidate (${cand?.finishReason ?? json.promptFeedback?.blockReason ?? 'none'})`);
      }
      const out = (cand.content?.parts ?? []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
      const u = json.usageMetadata ?? {};
      return {
        text: out,
        usage: { tokensIn: u.promptTokenCount ?? null, tokensOut: u.candidatesTokenCount ?? null, tokensThinking: u.thoughtsTokenCount ?? null },
      };
    },
  };
}
