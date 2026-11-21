// Builds the static site into dist/: public/ as the root, engines/ at /engines/ (the browser imports
// the same game generators the functions use). No bundling, no transforms: the files are copied as
// they are. Cloudflare Pages runs this (build command `node scripts/build-web.mjs`, output `dist`).
import { cpSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
cpSync(join(root, 'public'), dist, { recursive: true });
cpSync(join(root, 'engines'), join(dist, 'engines'), { recursive: true });
console.log('dist/ built from public/ + engines/');
