// Mock model for the emulator: answers with the sample list in the model's output shape and costs
// nothing. The text "MOCK:UNSUITABLE" / "MOCK:BROKEN" / "MOCK:UNAVAILABLE" in the material triggers the
// failure paths.
import { sampleAnswer } from '../engines/fixtures/sample-answer.js';

export function mockModel() {
  return {
    name: 'mock',
    async complete({ text }) {
      if (text.includes('MOCK:UNAVAILABLE')) throw Object.assign(new Error('mock model unavailable'), { unavailable: true });
      if (text.includes('MOCK:UNSUITABLE')) return { text: JSON.stringify({ suitable: false, reason: 'Not a text.', title: '', topic: '', items: [], cloze: { text: '', gaps: [] } }), usage: null };
      if (text.includes('MOCK:BROKEN')) return { text: '{"items": [', usage: null };
      return { text: JSON.stringify(sampleAnswer()), usage: { tokensIn: 0, tokensOut: 0, tokensThinking: 0 } };
    },
  };
}
