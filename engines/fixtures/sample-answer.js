// The sample list written as the MODEL would answer (ANALYSIS_SCHEMA): no ids, gaps point at terms.
// Used by the mock model (emulator) and the tests of the analysis.
import sample from './sample-family-b1.js';

export function sampleAnswer() {
  const byId = new Map(sample.items.map((it) => [it.id, it]));
  return {
    suitable: true,
    reason: '',
    title: sample.title,
    topic: sample.topic,
    items: sample.items.map(({ id, lemma, ...it }) => structuredClone(it)),
    cloze: { text: sample.cloze.text, gaps: sample.cloze.gaps.map((g) => ({ n: g.n, term: byId.get(g.itemId).term, answer: g.answer })) },
  };
}
