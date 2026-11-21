// Crossword renderer: type a letter and the cursor jumps to the next cell (then to the next row).
// Backspace on an empty cell goes back; arrow keys move. A solved row turns green; when every row is
// solved the hidden word lights up. "Reveal" fills the focused cell (limited by the teacher setting).
import { rowCorrect } from '/engines/games/crossword.js';
import { gridLetters } from '/engines/lang.js';
import { addMiss, flash, h, statusLine } from './ui.js';

export function render(p, ctx = {}) {
  const lang = ctx.lang ?? 'en';
  const line = statusLine(`Fill in the rows. The yellow column hides a ${p.hidden.letters.length}-letter word.`);
  const misses = {};
  let reveals = p.settings.reveals;
  let solvedCount = 0;
  let lastFocus = null;
  const all = []; // every input in reading order: { input, row, i }

  const revealBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: reveal }, '');
  const updateReveal = () => { revealBtn.textContent = `Reveal a letter (${reveals})`; revealBtn.disabled = reveals <= 0; };
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

  const indexOf = (input) => all.findIndex((x) => x.input === input);
  const focusAt = (k) => { const x = all[Math.max(0, Math.min(all.length - 1, k))]; x.input.focus(); x.input.select(); };

  function checkRow(rowEl) {
    const typed = rowEl._inputs.map((inp) => inp.value);
    const ok = rowCorrect(rowEl._row, typed);
    const full = typed.every(Boolean);
    if (full && !ok && !rowEl._solved) { addMiss(misses, rowEl._row.itemId); flash(rowEl, 'is-wrong'); }
    if (ok !== rowEl._solved) {
      rowEl._solved = ok;
      rowEl.classList.toggle('is-solved', ok);
      if (ok) flash(rowEl, 'is-pop');
      solvedCount += ok ? 1 : -1;
    }
    if (solvedCount === p.rows.length) {
      el.classList.add('is-complete');
      line.textContent = `Solved. The hidden word: ${p.hidden.letters.join('')}`;
      all.forEach((x) => { x.input.readOnly = true; });
      revealBtn.disabled = true;
      ctx.onFinish?.({ score: p.rows.length - Object.keys(misses).length, max: p.rows.length, misses, revealsUsed: p.settings.reveals - reveals });
    }
  }

  function reveal() {
    const k = lastFocus ? indexOf(lastFocus) : all.findIndex((x) => !x.input.value);
    const target = all[k] && !all[k].input.value ? all[k] : all.find((x) => !x.input.value);
    if (!target || reveals <= 0) return;
    reveals -= 1;
    updateReveal();
    target.input.value = target.row.letters[target.i];
    target.input.classList.add('is-revealed');
    checkRow(rowEls[target.row.number - 1]);
    const next = all.findIndex((x, j) => j > indexOf(target.input) && !x.input.value);
    if (next >= 0) focusAt(next);
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
    const next = k + letters.length;
    if (next < all.length) focusAt(next);
    else input.blur();
  });
  gridEl.addEventListener('keydown', (e) => {
    const k = indexOf(e.target);
    if (k < 0) return;
    const { row, i } = all[k];
    if (e.key === 'Backspace' && !e.target.value) { e.preventDefault(); focusAt(k - 1); all[Math.max(0, k - 1)].input.value = ''; checkRow(rowEls[all[Math.max(0, k - 1)].row.number - 1]); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusAt(k + 1); }
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
  const el = h('div', { class: 'g-crossword' }, line, h('div', { class: 'cw-layout' }, h('div', {}, gridEl, h('p', {}, revealBtn)), clues));
  return { el, destroy: () => {} };
}
