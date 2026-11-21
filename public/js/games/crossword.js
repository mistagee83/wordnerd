// Crossword renderer. The goal is the secret word in the yellow column: solve rows to get its letters,
// and guess it whenever you see it (limited guesses). Solving every row also finds it.
// Typing moves the cursor to the next cell and on to the next row; Backspace on an empty cell goes back;
// arrow keys move; a paste or mobile autocomplete fills the following cells. "Reveal" fills one cell.
import { rowCorrect, secretCorrect } from '/engines/games/crossword.js';
import { gridLetters } from '/engines/lang.js';
import { addMiss, flash, h, statusLine } from './ui.js';

export function render(p, ctx = {}) {
  const lang = ctx.lang ?? 'en';
  const L = p.hidden.letters.length;
  const line = statusLine(`Find the secret ${L}-letter word in the yellow column. Solve rows to get its letters, guess it when you see it.`);
  const misses = {};
  let reveals = p.settings.reveals;
  let guesses = p.settings.guesses;
  let solvedCount = 0;
  let finished = false;
  let lastFocus = null;
  const all = []; // every input in reading order: { input, row, i }

  const revealBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: reveal }, '');
  const updateReveal = () => { revealBtn.textContent = `Reveal a letter (${reveals})`; revealBtn.disabled = finished || reveals <= 0; };
  updateReveal();

  const rowEls = p.rows.map((row) => {
    const inputs = row.letters.map((_, i) => {
      const input = h('input', {
        class: `cw-cell${row.offset + i === p.hiddenCol ? ' is-hidden-col' : ''}`,
        inputmode: 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
        'aria-label': `Row ${row.number}, letter ${i + 1} of ${row.letters.length}`,
      });
      all.push({ input, row, i });
      return input;
    });
    const el = h('div', { class: 'cw-row', style: { '--offset': row.offset } },
      h('span', { class: 'cw-num' }, row.number), h('span', { class: 'cw-cells' }, inputs));
    el._inputs = inputs;
    el._row = row;
    el._solved = false;
    return el;
  });

  // the secret word box: one tile per letter, filled from the solved rows; plus the guess field
  const tiles = p.hidden.letters.map(() => h('span', { class: 'cw-secret-tile' }));
  const guessInput = h('input', { type: 'text', class: 'cw-guess', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: `${L} letters`, 'aria-label': 'Your guess at the secret word' });
  const guessBtn = h('button', { class: 'btn btn-small' }, '');
  const updateGuess = () => { guessBtn.textContent = `Guess (${guesses} left)`; guessBtn.disabled = guessInput.disabled = finished || guesses <= 0; };
  updateGuess();
  const guessForm = h('form', { class: 'cw-guess-form', onsubmit: (e) => {
    e.preventDefault();
    if (finished || guesses <= 0 || !guessInput.value.trim()) return;
    if (secretCorrect(p, guessInput.value, lang)) { finish(true); return; }
    guesses -= 1;
    flash(guessForm, 'is-wrong');
    guessInput.select();
    updateGuess();
    if (guesses <= 0) line.textContent = 'No guesses left: solve the rows to uncover the secret word.';
  } }, guessInput, guessBtn);
  const secretBox = h('div', { class: 'cw-secret' }, h('span', { class: 'cw-secret-label' }, 'Secret word'), h('span', { class: 'cw-secret-tiles' }, tiles), guessForm);

  const indexOf = (input) => all.findIndex((x) => x.input === input);
  const focusAt = (k) => { const x = all[Math.max(0, Math.min(all.length - 1, k))]; x.input.focus(); x.input.select(); };

  function finish(guessedEarly) {
    finished = true;
    el.classList.add('is-complete');
    tiles.forEach((t, i) => { t.textContent = p.hidden.letters[i]; });
    // unsolved rows show their answers greyed, so the words are still learnt
    for (const r of rowEls) {
      if (r._solved) continue;
      r.classList.add('is-shown');
      r._inputs.forEach((inp, i) => { inp.value = r._row.letters[i]; });
    }
    all.forEach((x) => { x.input.readOnly = true; });
    updateReveal();
    updateGuess();
    line.textContent = guessedEarly
      ? `You found the secret word ${p.hidden.letters.join('')} with ${solvedCount} of ${p.rows.length} rows solved.`
      : `All rows solved. The secret word: ${p.hidden.letters.join('')}`;
    ctx.onFinish?.({
      score: solvedCount, max: p.rows.length, misses, secretFound: true, guessedEarly,
      guessesUsed: p.settings.guesses - guesses, revealsUsed: p.settings.reveals - reveals,
    });
  }

  function checkRow(rowEl) {
    if (finished) return;
    const typed = rowEl._inputs.map((inp) => inp.value);
    const ok = rowCorrect(rowEl._row, typed);
    if (typed.every(Boolean) && !ok && !rowEl._solved) { addMiss(misses, rowEl._row.itemId); flash(rowEl, 'is-wrong'); }
    if (ok !== rowEl._solved) {
      rowEl._solved = ok;
      rowEl.classList.toggle('is-solved', ok);
      if (ok) flash(rowEl, 'is-pop');
      solvedCount += ok ? 1 : -1;
      const tile = tiles[rowEl._row.number - 1];
      tile.textContent = ok ? p.hidden.letters[rowEl._row.number - 1] : '';
      if (ok) flash(tile, 'is-pop');
    }
    if (solvedCount === p.rows.length) finish(false);
  }

  function reveal() {
    const k = lastFocus ? indexOf(lastFocus) : all.findIndex((x) => !x.input.value);
    const target = all[k] && !all[k].input.value ? all[k] : all.find((x) => !x.input.value);
    if (!target || reveals <= 0 || finished) return;
    reveals -= 1;
    updateReveal();
    target.input.value = target.row.letters[target.i];
    target.input.classList.add('is-revealed');
    checkRow(rowEls[target.row.number - 1]);
    const next = all.findIndex((x, j) => j > indexOf(target.input) && !x.input.value);
    if (next >= 0 && !finished) focusAt(next);
  }

  const gridEl = h('div', { class: 'cw-grid', style: { '--w': p.width } }, rowEls);
  gridEl.addEventListener('focusin', (e) => { if (e.target.matches('.cw-cell')) { lastFocus = e.target; e.target.select(); } });
  gridEl.addEventListener('input', (e) => {
    const input = e.target;
    const k = indexOf(input);
    let letters = gridLetters(input.value, lang);
    // typing over a selected letter gives one letter; a paste or mobile autocomplete gives several:
    // they flow into the following cells, as if typed one by one
    if (letters.length === 2 && e.inputType === 'insertText') letters = letters.slice(-1);
    if (!letters.length) { input.value = ''; checkRow(rowEls[all[k].row.number - 1]); return; }
    const touched = new Set();
    letters.forEach((l, j) => {
      const x = all[k + j];
      if (!x) return;
      x.input.value = l;
      touched.add(x.row.number - 1);
    });
    touched.forEach((r) => checkRow(rowEls[r]));
    if (finished) return;
    const next = k + letters.length;
    if (next < all.length) focusAt(next);
    else input.blur();
  });
  gridEl.addEventListener('keydown', (e) => {
    const k = indexOf(e.target);
    if (k < 0 || finished) return;
    const { row, i } = all[k];
    if (e.key === 'Backspace' && !e.target.value) {
      e.preventDefault();
      const prev = Math.max(0, k - 1);
      focusAt(prev);
      all[prev].input.value = '';
      checkRow(rowEls[all[prev].row.number - 1]);
    } else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(k + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusAt(k - 1); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
      e.preventDefault();
      const nr = row.number - 1 + (e.key === 'ArrowUp' ? -1 : 1);
      if (nr < 0 || nr >= p.rows.length) return;
      const col = row.offset + i; // keep the same column if the next row has it
      const next = p.rows[nr];
      const j = Math.max(0, Math.min(next.letters.length - 1, col - next.offset));
      focusAt(indexOf(rowEls[nr]._inputs[j]));
    }
  });

  const clues = h('ol', { class: 'cw-clues' }, p.rows.map((r) => h('li', {}, r.clue)));
  const el = h('div', { class: 'g-crossword' }, line, secretBox,
    h('div', { class: 'cw-layout' }, h('div', {}, gridEl, h('p', {}, revealBtn)), clues));
  return { el, destroy: () => {} };
}
