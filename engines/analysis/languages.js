// Languages the analysis offers. Target language: English only for now (SPEC 5); the support language is
// the translation language the teacher picks. Codes are ISO 639-1; the names go into the prompt.
export const TARGET_LANGS = { en: 'English' };

export const SUPPORT_LANGS = {
  hu: 'Hungarian', de: 'German', es: 'Spanish', fr: 'French', it: 'Italian', pt: 'Portuguese',
  pl: 'Polish', cs: 'Czech', sk: 'Slovak', ro: 'Romanian', hr: 'Croatian', sr: 'Serbian', sl: 'Slovenian',
  bg: 'Bulgarian', uk: 'Ukrainian', ru: 'Russian', nl: 'Dutch', sv: 'Swedish', da: 'Danish', no: 'Norwegian',
  fi: 'Finnish', el: 'Greek', tr: 'Turkish', ar: 'Arabic', zh: 'Chinese (Simplified)', ja: 'Japanese', ko: 'Korean',
  vi: 'Vietnamese', id: 'Indonesian', th: 'Thai',
};

export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
