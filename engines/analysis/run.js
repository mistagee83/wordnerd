// One analysis, start to end, with every outside effect injected (credits, model, storage, log), so the
// whole flow is testable without Firebase or a real model. The Cloud Function wires in the real ones.
// Rules (Hub "Kreditek"): credits are spent BEFORE the model call; any failure gives them back.
import { buildPrompt, PROMPT_VERSION } from './prompt.js';
import { normalizeAnalysis } from './normalize.js';

export const MAX_ATTEMPTS = 2; // one retry after a broken or unusable answer

/**
 * input: the checked input (input.js). deps:
 *   spend() -> { ledgerId, cost }            throws on no credits (passed through untouched)
 *   refund(ledgerId)                         idempotent
 *   model.complete({ system, text, file }) -> { text, usage }   throws { unavailable: true } if the model is gone
 *   save(list) -> listId
 *   log(record)                              one record per model attempt
 * Returns { ok: true, listId, cost, warnings } or { ok: false, reason, detail? } (credits refunded).
 */
export async function runAnalysis(input, { spend, refund, model, save, log = () => {}, now = () => Date.now() }) {
  const { ledgerId, cost } = await spend();
  const prompt = buildPrompt({ ...input, material: input.kind === 'text' ? input.text : '' });
  let last = { reason: 'bad_output' };
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const t0 = now();
      const record = { promptVersion: PROMPT_VERSION, model: model.name ?? null, attempt, outcome: null, usage: null, ms: null, warnings: [] };
      let raw = null;
      try {
        const res = await model.complete({ system: prompt.system, text: prompt.text, file: input.kind === 'file' ? input.file : null });
        record.usage = res.usage ?? null;
        raw = JSON.parse(res.text);
      } catch (e) {
        record.ms = now() - t0;
        if (e?.unavailable) {
          record.outcome = 'model_unavailable';
          log(record);
          await refund(ledgerId);
          return { ok: false, reason: 'model-unavailable' };
        }
        record.outcome = e instanceof SyntaxError ? 'parse_error' : 'provider_error';
        record.error = String(e?.message ?? e).slice(0, 300);
        log(record);
        last = { reason: record.outcome };
        continue;
      }
      const result = normalizeAnalysis(raw, { ...input, source: input.source });
      record.ms = now() - t0;
      record.warnings = result.warnings.slice(0, 20);
      record.outcome = result.ok ? 'ok' : result.reason;
      log(record);
      if (result.ok) {
        const listId = await save({ ...result.list, promptVersion: PROMPT_VERSION, model: model.name ?? null });
        return { ok: true, listId, cost, warnings: result.warnings };
      }
      last = { reason: result.reason, detail: result.detail };
      if (!result.retry) break;
    }
  } catch (e) {
    await refund(ledgerId);
    throw e;
  }
  await refund(ledgerId);
  return { ok: false, ...last };
}
