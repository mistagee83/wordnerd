// Matching renderer: drag (or tap) each word from the bank onto its definition card.
// Correct: the word snaps in and the card turns green. Wrong: the card shakes and the word flies back.
import { isMatch } from '/engines/games/matching.js';
import { enableDnD } from './dnd.js';
import { addMiss, flash, h, statusLine } from './ui.js';

export function render(p, ctx = {}) {
  const line = statusLine('Drag each word onto its meaning (or tap the word, then the meaning).');
  const misses = {};
  let matched = 0;
  let mistakes = 0;
  const firstTry = new Set(p.targets.map((t) => t.itemId));

  const bank = h('div', { class: 'chip-bank', 'aria-label': 'Words' },
    p.bank.map((w) => h('span', { class: 'chip', 'data-chip': '', 'data-item': w.itemId, tabindex: 0 }, w.text)));
  const cards = p.targets.map((t, i) => h('div', { class: 'match-card', 'data-drop': '', 'data-item': t.itemId },
    h('span', { class: 'match-num' }, i + 1),
    h('span', { class: 'match-def' }, t.text),
    h('span', { class: 'match-slot', 'aria-label': 'empty' })));

  const root = h('div', { class: 'g-matching' }, line, bank, h('div', { class: 'match-list' }, cards));

  const destroyDnD = enableDnD(root, (chip, card) => {
    if (!card.classList.contains('match-card') || card.classList.contains('is-done')) return false;
    const word = { itemId: chip.dataset.item };
    const target = { itemId: card.dataset.item };
    if (!isMatch(word, target)) {
      mistakes += 1;
      firstTry.delete(target.itemId);
      addMiss(misses, target.itemId);
      flash(card, 'is-wrong');
      line.textContent = `${matched} / ${p.targets.length} matched · ${mistakes} mistake${mistakes === 1 ? '' : 's'}`;
      return false;
    }
    chip.setAttribute('data-locked', '');
    chip.classList.remove('is-selected');
    card.querySelector('.match-slot').replaceWith(chip);
    card.classList.add('is-done');
    flash(card, 'is-pop');
    matched += 1;
    if (matched === p.targets.length) {
      line.textContent = mistakes ? `All matched with ${mistakes} mistake${mistakes === 1 ? '' : 's'}.` : 'All matched, no mistakes.';
      ctx.onFinish?.({ score: firstTry.size, max: p.targets.length, misses });
    } else line.textContent = `${matched} / ${p.targets.length} matched · ${mistakes} mistake${mistakes === 1 ? '' : 's'}`;
    return true;
  });

  return { el: root, destroy: destroyDnD };
}
