import { test } from 'node:test';
import assert from 'node:assert/strict';
import list from '../engines/fixtures/sample-family-b1.js';
import { GAMES, GAME_IDS, gameSeed, generateGame } from '../engines/games/index.js';
import { isPair } from '../engines/games/memory.js';
import { isMatch } from '../engines/games/matching.js';
import { cellsOf, findWord, lineCells } from '../engines/games/wordsearch.js';
import { rowCorrect } from '../engines/games/crossword.js';
import { display, guess, newRound, status } from '../engines/games/hangman.js';
import { checkAll } from '../engines/games/gapfill.js';
import { isCorrect as drownCorrect, waterLevel } from '../engines/games/drowning.js';
import { gridLetters } from '../engines/lang.js';

const SEEDS = Array.from({ length: 300 }, (_, i) => `seed-${i}`);
const byId = Object.fromEntries(list.items.map((it) => [it.id, it]));

test('every game: default settings work, same seed gives the same puzzle', () => {
  for (const id of GAME_IDS) {
    const a = generateGame(id, list, {}, 'abc:0');
    const b = generateGame(id, list, {}, 'abc:0');
    assert.equal(a.ok, true, `${id}: ${a.reason}`);
    assert.deepEqual(a, b, id);
  }
});

test('every game: different seeds give different puzzles', () => {
  for (const id of GAME_IDS) {
    const outs = new Set(SEEDS.slice(0, 10).map((s) => JSON.stringify(generateGame(id, list, {}, s))));
    assert.ok(outs.size > 1, id);
  }
});

test('every game: 300 seeds × settings extremes, no exceptions, always ok', () => {
  for (const id of GAME_IDS) {
    const { limits } = GAMES[id];
    const lows = Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v.min]));
    const highs = Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v.max]));
    for (const settings of [{}, lows, highs]) {
      for (const seed of SEEDS) {
        const p = generateGame(id, list, settings, seed);
        assert.equal(p.ok, true, `${id} ${JSON.stringify(settings)} ${seed}: ${p.reason}`);
      }
    }
  }
});

test('settings are clamped and unknown values fall back to defaults', () => {
  const p = generateGame('memory', list, { grid: 99, clueMode: 'nonsense', flipMs: -5 }, 's');
  assert.deepEqual(p.settings, { grid: 6, clueMode: 'translation', flipMs: 500 });
});

test('too few words gives ok:false with a reason, never throws', () => {
  const tiny = { ...list, items: list.items.slice(0, 2), cloze: undefined };
  for (const id of GAME_IDS) {
    const p = generateGame(id, tiny, {}, 's');
    if (id === 'hangman') continue; // one word is enough for hangman
    assert.equal(p.ok, false, id);
    assert.equal(typeof p.reason, 'string');
  }
  assert.equal(generateGame('nope', list, {}, 's').ok, false);
  assert.equal(generateGame('memory', null, {}, 's').ok, false);
});

test('gameSeed separates games of a session', () => {
  assert.notDeepEqual(generateGame('memory', list, {}, gameSeed('S', 0)), generateGame('memory', list, {}, gameSeed('S', 1)));
});

test('memory: square board, every word twice (once per face), logo tile in the centre of odd boards', () => {
  for (const grid of [3, 4, 5, 6]) {
    for (const seed of SEEDS.slice(0, 50)) {
      const p = generateGame('memory', list, { grid, clueMode: 'definition' }, seed);
      assert.equal(p.grid, grid);
      assert.equal(p.cards.length, grid * grid);
      assert.equal(p.pairs, Math.floor((grid * grid) / 2));
      const logos = p.cards.map((c, i) => (c.logo ? i : -1)).filter((i) => i >= 0);
      assert.deepEqual(logos, grid % 2 ? [Math.floor((grid * grid) / 2)] : []);
      const ids = new Set(p.cards.filter((c) => !c.logo).map((c) => c.itemId));
      assert.equal(ids.size, p.pairs);
      for (const id of ids) {
        const two = p.cards.filter((c) => c.itemId === id);
        assert.ok(isPair(two[0], two[1]));
        assert.equal(two.find((c) => c.face === 'clue').text, byId[id].definition);
      }
      assert.equal(new Set(p.cards.map((c) => c.cardId)).size, grid * grid);
    }
  }
});

test('memory: a short list gets the largest square board it can fill', () => {
  const p = generateGame('memory', { ...list, items: list.items.slice(0, 10) }, { grid: 6 }, 's');
  assert.equal(p.grid, 4);
  assert.equal(p.pairs, 8);
});

test('matching: definitions as targets, the same words shuffled in the bank', () => {
  const p = generateGame('matching', list, {}, 'm');
  assert.equal(p.settings.clueMode, 'definition');
  assert.equal(p.targets.length, 6);
  assert.deepEqual(new Set(p.targets.map((t) => t.itemId)), new Set(p.bank.map((w) => w.itemId)));
  for (const t of p.targets) {
    assert.equal(t.text, byId[t.itemId].definition);
    assert.ok(isMatch(p.bank.find((w) => w.itemId === t.itemId), t));
  }
});

test('word search: every placed word reads correctly along its direction and stays on the grid', () => {
  for (const directions of ['easy', 'medium', 'hard']) {
    for (const seed of SEEDS) {
      const p = generateGame('wordsearch', list, { words: 12, directions }, seed);
      assert.equal(p.grid.length, p.size);
      assert.ok(p.grid.every((r) => r.length === p.size && r.every((c) => typeof c === 'string' && c.length >= 1)));
      assert.equal(p.placements.length + p.skipped.length, 12);
      for (const pl of p.placements) {
        const word = gridLetters(byId[pl.itemId].term).join('');
        const read = cellsOf(pl).map(([r, c]) => p.grid[r][c]).join('');
        assert.equal(read, word, `${seed} ${pl.itemId}`);
        if (directions === 'easy') assert.ok((pl.dr === 0 && pl.dc === 1) || (pl.dr === 1 && pl.dc === 0));
        if (directions !== 'hard') assert.ok(pl.dc >= 0 && !(pl.dc === 0 && pl.dr < 0));
        const [er, ec] = cellsOf(pl).at(-1);
        assert.equal(findWord(p, pl.row, pl.col, er, ec), pl.itemId);
        assert.equal(findWord(p, er, ec, pl.row, pl.col), pl.itemId); // marked backwards
      }
      assert.equal(p.clues.length, p.placements.length);
    }
  }
});

test('word search: with an automatic grid every word fits on the sample list', () => {
  for (const seed of SEEDS) assert.deepEqual(generateGame('wordsearch', list, { words: 10 }, seed).skipped, []);
});

test('crossword: every row crosses the hidden column at the right letter, no word used twice', () => {
  for (const hiddenLength of [4, 6, 7, 9]) {
    for (const seed of SEEDS) {
      const p = generateGame('crossword', list, { hiddenLength }, seed);
      assert.equal(p.ok, true, `${hiddenLength} ${seed}: ${p.reason}`);
      assert.equal(p.rows.length, p.hidden.letters.length);
      assert.ok(p.hidden.letters.length >= hiddenLength);
      const ids = new Set([p.hidden.itemId, ...p.rows.map((r) => r.itemId)]);
      assert.equal(ids.size, p.rows.length + 1);
      p.rows.forEach((r, i) => {
        assert.equal(r.letters[r.cross], p.hidden.letters[i]);
        assert.equal(r.offset + r.cross, p.hiddenCol);
        assert.ok(r.offset >= 0 && r.offset + r.letters.length <= p.width);
        assert.ok(r.clue.length > 0);
        assert.ok(rowCorrect(r, r.letters));
      });
    }
  }
});

test('crossword: impossible request fails cleanly', () => {
  const p = generateGame('crossword', { ...list, items: list.items.slice(0, 5) }, { hiddenLength: 12 }, 's');
  assert.equal(p.ok, false);
});

test('hangman: guessing all letters wins, too many misses loses', () => {
  const p = generateGame('hangman', list, { words: 20, parts: 6 }, 'h');
  const round = p.rounds.find((r) => r.itemId === 'w08'); // brother-in-law
  let st = newRound();
  for (const l of 'BROTHEINLAW') st = guess(round, st, l, p.maxMisses);
  assert.equal(status(round, st, p.maxMisses), 'won');
  assert.equal(display(round, st).join(''), 'BROTHER-IN-LAW');
  assert.equal(st.misses, 0);

  let lose = newRound();
  for (const l of 'QXZJKVYU') lose = guess(round, lose, l, p.maxMisses);
  assert.equal(status(round, lose, p.maxMisses), 'lost');
  assert.equal(lose.misses, 6); // guesses after the loss do not count
  assert.ok(round.keyboard.length >= 26);
});

test('gapfill: the text keeps its order, the bank holds every answer plus the extra words', () => {
  for (const seed of SEEDS) {
    for (const extras of [0, 2, 4]) {
      const p = generateGame('gapfill', list, { extras }, seed);
      const gaps = p.segments.filter((x) => x.type === 'gap');
      assert.equal(gaps.length, 11);
      assert.equal(p.bank.length, 11 + extras);
      const answers = Object.values(p.answers).map((a) => a.toLowerCase()).sort();
      assert.deepEqual(p.bank.filter((c) => c.itemId).map((c) => c.text.toLowerCase()).sort(), answers);
      for (const c of p.bank.filter((x) => !x.itemId)) assert.ok(!answers.includes(c.text.toLowerCase()));
      assert.equal(new Set(p.bank.map((c) => c.chipId)).size, p.bank.length);
      // the text reads the same as the source with the markers removed
      const plain = p.segments.map((x) => (x.type === 'text' ? x.text : `{{${x.gapId.slice(1)}}}`)).join('');
      assert.equal(plain, list.cloze.text);
      assert.ok(!JSON.stringify(p.segments).includes('answer')); // answers are not inside the segments
    }
  }
});

test('gapfill: checking at the end', () => {
  const p = generateGame('gapfill', list, {}, 'g');
  const all = { ...p.answers };
  assert.deepEqual(checkAll(p, all), { results: Object.fromEntries(Object.keys(all).map((k) => [k, true])), score: 11, max: 11 });
  const some = { g1: 'RELATIVES', g2: 'brought up' };
  const r = checkAll(p, some);
  assert.equal(r.score, 1);
  assert.equal(r.results.g2, false);
  assert.equal(r.results.g3, false); // empty gap
});

test('gapfill: a broken text (missing gap entry, duplicate marker, too few gaps) fails cleanly', () => {
  const bad = (cloze) => generateGame('gapfill', { ...list, cloze }, {}, 's');
  assert.equal(bad(undefined).ok, false);
  assert.equal(bad({ text: 'A {{1}} B {{2}}', gaps: [{ n: 1, itemId: 'w01', answer: 'x' }] }).ok, false);
  assert.equal(bad({ text: 'A {{1}} B {{1}}', gaps: [{ n: 1, itemId: 'w01', answer: 'x' }] }).ok, false);
  assert.equal(bad({ text: 'A {{1}}', gaps: [{ n: 1, itemId: 'w01', answer: 'x' }, { n: 2, itemId: 'w02', answer: 'y' }] }).ok, false);
  assert.equal(bad({ text: 'A {{1}} {{2}} {{3}}', gaps: [1, 2, 3].map((n) => ({ n, itemId: 'w01', answer: `a${n}` })) }).ok, false);
});

test('drowning: prompts are translations, answers are terms, water rule', () => {
  const p = generateGame('drowning', list, { speed: 'fast' }, 'd');
  assert.equal(p.queue.length, 15);
  for (const e of p.queue) {
    assert.equal(e.prompt, byId[e.itemId].translation);
    assert.ok(drownCorrect(e, byId[e.itemId].term.toUpperCase()));
  }
  assert.equal(waterLevel(p, 0, 0), 0);
  assert.equal(waterLevel(p, p.fillSeconds, 0), 1);
  assert.ok(waterLevel(p, p.fillSeconds, 2) < 1);
  assert.equal(waterLevel(p, 1, 10), 0);
});

test('a non-English target language works in the letter games', () => {
  const hu = {
    targetLang: 'hu', supportLang: 'en',
    items: ['tükör', 'szőlő', 'gyümölcs', 'család', 'nagymama', 'unokaöcs', 'testvér', 'rokon', 'házimunka', 'zsebpénz', 'büszke', 'szigorú']
      .map((term, i) => ({ id: `h${i}`, term, translation: `en-${i}`, definition: `def ${i}` })),
  };
  const ws = generateGame('wordsearch', hu, { words: 12 }, 'x');
  assert.equal(ws.ok, true);
  for (const pl of ws.placements) {
    const read = cellsOf(pl).map(([r, c]) => ws.grid[r][c]).join('');
    assert.equal(read, gridLetters(hu.items.find((it) => it.id === pl.itemId).term, 'hu').join(''));
  }
  const cw = generateGame('crossword', hu, { hiddenLength: 5 }, 'x');
  assert.equal(cw.ok, true, cw.reason);
  const hm = generateGame('hangman', hu, {}, 'x');
  assert.ok(hm.rounds.every((r) => r.keyboard.includes('Ő')));
});

test('word search: lineCells accepts rows, columns and 45° diagonals only', () => {
  assert.deepEqual(lineCells(2, 1, 2, 4), [[2, 1], [2, 2], [2, 3], [2, 4]]);
  assert.deepEqual(lineCells(4, 4, 1, 1), [[4, 4], [3, 3], [2, 2], [1, 1]]);
  assert.deepEqual(lineCells(3, 3, 3, 3), [[3, 3]]);
  assert.equal(lineCells(0, 0, 1, 2), null);
  const p = generateGame('wordsearch', list, { directions: 'hard' }, 'l');
  for (const pl of p.placements) {
    const [er, ec] = cellsOf(pl).at(-1);
    assert.deepEqual(lineCells(pl.row, pl.col, er, ec), cellsOf(pl));
  }
});
