// The teacher settings form of one game, built from the engine's defaults and limits. Shared by the dev
// preview and the teacher page (F3) – and the session set-up in F4.
import { GAMES } from '/engines/games/index.js';
import { h } from './ui.js';

const CHOICES = {
  clueMode: {
    memory: ['translation', 'definition'], matching: ['definition', 'translation'], wordsearch: ['term', 'translation', 'definition'],
    crossword: ['definition', 'translation'], hangman: ['translation', 'definition', 'none'], drowning: ['translation', 'definition'],
  },
  directions: ['easy', 'medium', 'hard'],
  speed: ['slow', 'normal', 'fast'],
};
const LABELS = {
  grid: 'Board (n × n)', size: 'Grid size (0 = auto)', extras: 'Extra words in the bank', flipMs: 'Wrong pair shown (ms)',
  lives: 'Lives (balloons, shared)', guesses: 'Secret word guesses', hiddenLength: 'Secret word length', clueMode: 'Clue',
  pairs: 'Pairs', words: 'Words', directions: 'Directions', reveals: 'Letter reveals', speed: 'Water speed',
};
const OPTION_LABELS = { term: 'the word', translation: 'translation', definition: 'definition', none: 'no clue' };

/** onChange(newSettings) is called after every change. */
export function settingsForm(gameId, settings, onChange) {
  const g = GAMES[gameId];
  const st = { ...g.defaults, ...settings };
  const fields = Object.keys(g.defaults).map((key) => {
    const options = key === 'clueMode' ? CHOICES.clueMode[gameId] : CHOICES[key];
    const change = (e) => { st[key] = e.target.type === 'number' ? Number(e.target.value) : e.target.value; onChange({ ...st }); };
    if (options) {
      return h('label', { class: 'set-field' }, LABELS[key] ?? key,
        h('select', { onchange: change }, options.map((o) => h('option', { value: o, selected: o === st[key] }, OPTION_LABELS[o] ?? o))));
    }
    const lim = g.limits[key] ?? {};
    return h('label', { class: 'set-field' }, LABELS[key] ?? key,
      h('input', { type: 'number', value: st[key], min: key === 'size' ? 0 : lim.min, max: lim.max, onchange: change }));
  });
  return h('div', { class: 'set-form' }, fields);
}
