import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, hashSeed } from '../engines/prng.js';

test('same seed gives the same sequence', () => {
  const a = createRng('session-1:0');
  const b = createRng('session-1:0');
  for (let i = 0; i < 1000; i++) assert.equal(a.next(), b.next());
});

test('different seeds give different sequences', () => {
  const a = createRng('session-1:0');
  const b = createRng('session-1:1');
  const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean).length;
  assert.ok(same < 20);
});

test('values stay in range', () => {
  const r = createRng(42);
  for (let i = 0; i < 10000; i++) {
    const x = r.next();
    assert.ok(x >= 0 && x < 1);
    const n = r.int(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
  }
});

test('shuffle keeps every element and does not change the input', () => {
  const input = Array.from({ length: 50 }, (_, i) => i);
  const out = createRng('x').shuffle(input);
  assert.deepEqual([...out].sort((p, q) => p - q), input);
  assert.deepEqual(input, Array.from({ length: 50 }, (_, i) => i));
});

test('hashSeed is stable (guards against accidental changes that would alter every puzzle)', () => {
  assert.equal(hashSeed(''), 0x811c9dc5);
  assert.equal(hashSeed('wordnerd'), hashSeed('wordnerd'));
  assert.equal(createRng('wordnerd').int(0, 1_000_000), createRng('wordnerd').int(0, 1_000_000));
});
