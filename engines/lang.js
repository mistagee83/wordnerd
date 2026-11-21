// Per-language letter handling for the letter games (word search, crossword, hangman, drowning).
// SPEC 5: nothing English-specific in the generators; every language rule lives here.
// Pure module, no imports. Uses Intl.Segmenter (Node 16+, all current browsers) for graphemes,
// so letters with combining accents count as one letter.

// Filler alphabets for the word search. A language without an entry falls back to the letters of the
// list itself plus the Latin base (see fillerAlphabet).
const ALPHABETS = {
  en: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  hu: 'AÁBCDEÉFGHIÍJKLMNOÓÖŐPQRSTUÚÜŰVWXYZ',
  de: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ',
  es: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZÁÉÍÓÚ',
  fr: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÂÇÉÈÊËÎÏÔÙÛ',
  it: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÈÉÌÒÙ',
};
const LATIN = ALPHABETS.en;

const segmenterCache = new Map();
function segmenter(lang) {
  if (!segmenterCache.has(lang)) segmenterCache.set(lang, new Intl.Segmenter(lang, { granularity: 'grapheme' }));
  return segmenterCache.get(lang);
}

export const isLetter = (g) => /\p{L}/u.test(g);

// Graphemes of a string (letters, spaces, punctuation), NFC-normalised.
export function graphemes(text, lang = 'en') {
  return Array.from(segmenter(lang).segment(String(text).normalize('NFC')), (s) => s.segment);
}

// Upper case one grapheme. If upper-casing would change the number of letters (German ß -> SS),
// the original letter is kept, so a word keeps its length on a grid.
export function upperGrapheme(g, lang = 'en') {
  const up = g.toLocaleUpperCase(lang);
  return graphemes(up, lang).length === 1 ? up : g;
}

// Letters only, upper case: what goes on a grid. Spaces, hyphens and apostrophes are dropped
// ("brother-in-law" -> BROTHERINLAW, "look after" -> LOOKAFTER).
export function gridLetters(text, lang = 'en') {
  return graphemes(text, lang).filter(isLetter).map((g) => upperGrapheme(g, lang));
}

// Slots for hangman-style games: letters are hidden, everything else (space, hyphen, apostrophe) is shown.
export function slots(text, lang = 'en') {
  return graphemes(text, lang).map((g) => (isLetter(g) ? { letter: upperGrapheme(g, lang), hidden: true } : { char: g, hidden: false }));
}

// The keyboard a hangman round offers: the language alphabet plus any letter of the answer missing from it.
export function keyboard(lang = 'en', extraLetters = []) {
  const base = graphemes(ALPHABETS[lang] ?? LATIN, lang);
  const extra = extraLetters.map((g) => upperGrapheme(g, lang)).filter((g) => !base.includes(g));
  return [...base, ...new Set(extra)];
}

// Filler letters for the word search: the language alphabet, or for an unknown language the Latin
// base plus every letter that occurs in the placed words (so fillers never give away odd letters).
export function fillerAlphabet(lang = 'en', words = []) {
  if (ALPHABETS[lang]) return graphemes(ALPHABETS[lang], lang);
  const seen = new Set(graphemes(LATIN, lang));
  for (const w of words) for (const g of w) seen.add(g);
  return [...seen];
}

// Comparison form for typed answers: NFC, trimmed, single spaces, typographic apostrophes and dashes
// made plain, locale lower case. Accents stay significant (in many languages they change the word).
export function normalizeAnswer(text, lang = 'en') {
  return String(text)
    .normalize('NFC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[‐-―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase(lang);
}

export const answersMatch = (typed, expected, lang = 'en') => normalizeAnswer(typed, lang) === normalizeAnswer(expected, lang);
