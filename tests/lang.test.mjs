import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answersMatch, fillerAlphabet, graphemes, gridLetters, keyboard, slots, upperGrapheme } from '../engines/lang.js';

test('grid letters drop spaces, hyphens and apostrophes, upper case', () => {
  assert.deepEqual(gridLetters('look after').join(''), 'LOOKAFTER');
  assert.deepEqual(gridLetters('brother-in-law').join(''), 'BROTHERINLAW');
  assert.deepEqual(gridLetters("mother's day").join(''), 'MOTHERSDAY');
});

test('accented letters are one letter each and keep their accent', () => {
  assert.deepEqual(gridLetters('tükörfúrógép', 'hu'), ['T', 'Ü', 'K', 'Ö', 'R', 'F', 'Ú', 'R', 'Ó', 'G', 'É', 'P']);
  assert.deepEqual(gridLetters('ő', 'hu'), ['Ő']);
  // combining accent (e + U+0301) is normalised to one letter
  assert.equal(graphemes('café').length, 4);
});

test('a letter whose upper case is longer stays as it is (German ß)', () => {
  assert.equal(upperGrapheme('ß', 'de'), 'ß');
  assert.equal(gridLetters('Straße', 'de').length, 6);
});

test('Turkish dotted i uses the locale', () => {
  assert.equal(upperGrapheme('i', 'tr'), 'İ');
  assert.equal(upperGrapheme('i', 'en'), 'I');
});

test('hangman slots hide letters only', () => {
  const s = slots('brother-in-law');
  assert.equal(s.filter((x) => x.hidden).length, 12);
  assert.deepEqual(s.filter((x) => !x.hidden).map((x) => x.char), ['-', '-']);
});

test('keyboard adds letters missing from the alphabet', () => {
  assert.equal(keyboard('en').length, 26);
  assert.ok(keyboard('en', ['é']).includes('É'));
  assert.equal(keyboard('hu').length, 35);
});

test('filler alphabet for an unknown language includes the list letters', () => {
  const f = fillerAlphabet('xx', [['Ø', 'L']]);
  assert.ok(f.includes('Ø') && f.includes('A'));
});

test('typed answers: case, spaces and typographic apostrophes do not matter, accents do', () => {
  assert.ok(answersMatch('  Look   After ', 'look after'));
  assert.ok(answersMatch('mother’s', "mother's"));
  assert.ok(!answersMatch('kor', 'kór', 'hu'));
});
