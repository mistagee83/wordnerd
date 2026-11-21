// What the model must return for one analysis (SPEC 5), as a JSON schema for the model's structured
// output. The model never decides structure (CLAUDE.md rule 1): it fills these fields; ids, counts and
// the list document are built by code (normalize.js), which also rejects or repairs what the schema
// cannot express. Keep the schema small: type, properties, required, items, description only.
// Gemini refused the first version (2026-11-21, HTTP 400 "too many states for serving") because of the
// array length limits and the level enum; lengths and levels are checked by normalize.js instead.

const str = (description) => ({ type: 'string', description });
const strList = (description) => ({ type: 'array', items: { type: 'string' }, description });

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    suitable: { type: 'boolean', description: 'false if the material is not a usable text for vocabulary work' },
    reason: str('if not suitable: one short sentence why, in English'),
    title: str('a short title for the word list, at most 6 words'),
    topic: str('the topic in 1-3 words'),
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: str('the word or expression to learn, in its dictionary form'),
          pos: str('part of speech, e.g. noun, verb, adjective, phrasal verb, collocation'),
          level: str('CEFR level of the item: A1, A2, B1, B2, C1 or C2'),
          definition: str('simple target-language definition, at most 12 words, without the term itself'),
          translation: str('natural equivalent in the support language, at most 5 words'),
          sourceSentence: str('the sentence of the material where the term occurs, verbatim, at most 30 words'),
          example: {
            type: 'object',
            properties: {
              text: str('a new sentence with exactly one gap written as ___ where the term goes'),
              answer: str('the exact form of the term that fills the gap'),
            },
            required: ['text', 'answer'],
          },
          distractors: strList('three wrong options in the same grammatical form as example.answer'),
          family: strList('other members of the word family'),
          synonyms: strList('close synonyms'),
          antonyms: strList('antonyms, if natural'),
          category: str('a short group label; the list uses 2-4 different labels'),
        },
        required: ['term', 'pos', 'level', 'definition', 'translation', 'sourceSentence', 'example', 'distractors', 'category'],
      },
    },
    cloze: {
      type: 'object',
      properties: {
        text: str('a new connected text with the gaps marked {{1}}, {{2}}, ... in reading order'),
        gaps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              n: { type: 'integer' },
              term: str('the item term this gap practises, exactly as in items'),
              answer: str('the exact form that fills the gap'),
            },
            required: ['n', 'term', 'answer'],
          },
        },
      },
      required: ['text', 'gaps'],
    },
  },
  required: ['suitable', 'title', 'topic', 'items', 'cloze'],
};
