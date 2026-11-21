// Gapfill renderer: a connected text with gaps and a word bank. Drag (or tap) words into the gaps, move
// them between gaps or back to the bank, then check everything at the end.
import { checkAll } from '/engines/games/gapfill.js';
import { enableDnD } from './dnd.js';
import { h, statusLine } from './ui.js';

export function render(p, ctx = {}) {
  const gapCount = Object.keys(p.answers).length;
  const line = statusLine(`Drag the words into the text (or tap a word, then a gap). ${gapCount} gaps${p.bank.length > gapCount ? `, ${p.bank.length - gapCount} extra word${p.bank.length - gapCount === 1 ? '' : 's'}` : ''}.`);
  const bank = h('div', { class: 'chip-bank', 'data-drop': 'bank', 'aria-label': 'Word bank' },
    p.bank.map((c) => h('span', { class: 'chip', 'data-chip': '', 'data-text': c.text, tabindex: 0 }, c.text)));
  const gapEls = {};
  const text = h('p', { class: 'gf-text' }, p.segments.map((seg) => {
    if (seg.type === 'text') return seg.text;
    const gap = h('span', { class: 'gf-gap', 'data-drop': 'gap', 'data-gap': seg.gapId, 'aria-label': 'gap' });
    gapEls[seg.gapId] = gap;
    return gap;
  }));
  const checkBtn = h('button', { type: 'button', class: 'btn', onclick: check }, 'Check');
  const root = h('div', { class: 'g-gapfill' }, line, bank, text, h('p', {}, checkBtn));

  const destroyDnD = enableDnD(root, (chip, place) => {
    if (root.classList.contains('is-checked')) return false;
    if (place.dataset.drop === 'bank') { bank.append(chip); updateLine(); return true; }
    if (place.dataset.drop !== 'gap') return false;
    const from = chip.parentElement;
    const occupant = place.querySelector('.chip');
    if (occupant === chip) return true;
    if (occupant) {
      // swap when the word came from another gap, otherwise the old word goes back to the bank
      if (from?.classList.contains('gf-gap')) from.append(occupant);
      else bank.append(occupant);
    }
    place.append(chip);
    updateLine();
    return true;
  });

  function placed() {
    return Object.fromEntries(Object.entries(gapEls).map(([id, g]) => [id, g.querySelector('.chip')?.dataset.text ?? '']));
  }
  function updateLine() {
    const filled = Object.values(placed()).filter(Boolean).length;
    line.textContent = `${filled} / ${gapCount} gaps filled.`;
  }

  function check() {
    const result = checkAll(p, placed(), ctx.lang ?? 'en');
    root.classList.add('is-checked');
    checkBtn.disabled = true;
    root.querySelectorAll('.chip').forEach((c) => c.setAttribute('data-locked', ''));
    const misses = {};
    for (const seg of p.segments) {
      if (seg.type !== 'gap') continue;
      const ok = result.results[seg.gapId];
      const gap = gapEls[seg.gapId];
      gap.classList.add(ok ? 'is-right' : 'is-wrong');
      if (!ok) {
        if (seg.itemId) misses[seg.itemId] = 1;
        // an empty gap shows the answer inside it; a wrong word gets the answer under it
        gap.append(h('span', { class: gap.querySelector('.chip') ? 'gf-fix' : 'gf-fix is-inside' }, p.answers[seg.gapId]));
      }
    }
    line.textContent = `${result.score} / ${result.max} correct.`;
    ctx.onFinish?.({ score: result.score, max: result.max, misses });
  }

  return { el: root, destroy: destroyDnD };
}
