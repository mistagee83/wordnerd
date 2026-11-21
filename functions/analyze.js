// wnAnalyze (callable, teacher): material in, word list out (SPEC 4, 9).
// Order: teacher check -> input check (no credit spent on a bad request) -> credits spent -> model call
// (one retry) -> code-side checks -> wnLists/{id} written. Any failure after the spend gives the credits
// back. The uploaded file is never stored: it lives only in this request.
import { fs, fail, teacher } from './common.js';
import { ACTIONS, MODEL, isMockModel } from './config.js';
import { CreditError, refundCredits, spendCredits } from './credits.js';
import { geminiModel } from './llm/gemini.js';
import { mockModel } from './llm/mock.js';
import { checkInput } from './engines/analysis/input.js';
import { ANALYSIS_SCHEMA } from './engines/analysis/schema.js';
import { runAnalysis } from './engines/analysis/run.js';

export const LISTS = 'wnLists';

export async function analyze(req, { apiKey }) {
  const uid = teacher(req);
  const checked = checkInput(req.data ?? {});
  if (!checked.ok) fail('invalid-argument', checked.reason);
  const { input } = checked;

  const model = isMockModel()
    ? mockModel()
    : geminiModel({ apiKey: apiKey(), model: MODEL.name, schema: ANALYSIS_SCHEMA });
  const listRef = fs().collection(LISTS).doc();
  const attempts = [];
  let result;
  try {
    result = await runAnalysis(input, {
      spend: () => spendCredits(fs(), { uid, action: ACTIONS.analyze, ref: listRef.id }),
      refund: (ledgerId) => refundCredits(fs(), ledgerId).catch((e) => console.error('refund failed', ledgerId, e)),
      model,
      log: (r) => {
        attempts.push({ outcome: r.outcome, usage: r.usage, ms: r.ms, warnings: r.warnings?.length ?? 0, error: r.error ?? null });
        console.log(JSON.stringify({ wn: 'analyze', uid, listId: listRef.id, kind: input.kind, ...r }));
      },
      save: async (list) => {
        const now = Date.now();
        await listRef.set({
          ...list,
          ownerUid: uid,
          analysis: { promptVersion: list.promptVersion, model: list.model, attempts },
          createdAt: now,
          updatedAt: now,
        });
        return listRef.id;
      },
    });
  } catch (e) {
    if (e instanceof CreditError && e.code === 'insufficient') fail('resource-exhausted', 'insufficient', { balance: e.balance, cost: e.cost });
    if (e instanceof CreditError && e.code === 'no_price') fail('failed-precondition', 'no-price');
    console.error('analysis failed', e);
    fail('internal', 'analysis-failed');
  }
  if (!result.ok) {
    if (result.reason === 'model-unavailable') fail('unavailable', 'model-unavailable');
    if (result.reason === 'unsuitable') fail('failed-precondition', 'unsuitable', { detail: result.detail ?? '' });
    fail('internal', 'analysis-failed', { detail: result.reason });
  }
  return { listId: result.listId, cost: result.cost, warnings: result.warnings.length };
}
