// Copies engines/ (pure game generators, seeded PRNG, Hub copies) into functions/engines/,
// so the Cloud Functions use exactly the code the browser uses. Runs before every functions deploy
// (firebase.json predeploy). functions/engines/ is gitignored: never edit it.
import { cpSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'functions', 'engines');
rmSync(target, { recursive: true, force: true });
cpSync(join(root, 'engines'), target, { recursive: true });
console.log('functions/engines/ refreshed from engines/');
