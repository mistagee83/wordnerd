# WordNerd – DEVLOG

## F0 – Repo (2026-11-21)

**Decisions (András, 2026-11-21)**
- Name stays WordNerd. Address `wordnerd.mrandrewshub.com`; entitlement key and price-key prefix `wordnerd`;
  Firestore prefix `wn`.
- First-version games: Memory, Matching, Word search, Crossword, Hangman, Gapfill, Drowning. Teacher difficulty
  settings as in SPEC 6.
- Brand: the old logo as it is, the old colours as they were, dashboard modelled on the old one; the character is
  optional.
- No Netlify: test locally and on the live (unlisted, noindex) address.
- Docs and code in English; tests with `node:test`, no dependencies.
- GitHub: private repo `mistagee83/wordnerd`, branch `dev`.

**Built**
- Repo skeleton: `package.json` (no dependencies), `firebase.json` (codebase `wordnerd`, emulators, deny-deploy
  hooks for Firestore/Storage rules), `.firebaserc` (`mrashub`), `.gitignore`.
- Scripts: `serve.mjs` (dependency-free dev server), `build-web.mjs` (`public/` + `engines/` → `dist/`),
  `sync-hub.mjs` (Hub `entitlements.js`, `credits.js`, `sso.js` copied in), `sync-engines.mjs`, `deny-deploy.mjs`.
- `engines/prng.js`: seeded PRNG (FNV-1a hash + mulberry32) with `int`, `pick`, `shuffle`; tests in
  `tests/prng.test.mjs`.
- Brand: logo PNGs in `public/img/brand/`, vector sources (`.ai`, `.eps`) in `design/brand-source/`, old screens in
  `reference/screens/`; colour tokens from the old CSS in `public/css/tokens.css`, roles in `base.css`.
- Placeholder page `public/index.html` (logo, one line, noindex), `public/js/config.js` (Firebase web config from
  the Hub, `PUBLIC_BASE_URL`), `public/_headers` (Cloudflare Pages).
- `functions/` stub without dependencies (added in F2).
- Emulator copies of the Hub's `firestore.rules` and `storage.rules` (no WordNerd block yet).

**Not done / next**
- Hosting not set up (Cloudflare Pages or Firebase Hosting: SPEC 13). The Hub's `APP_ORIGINS` and Auth authorized
  domains do not include WordNerd yet (F3).
- Logo SVG export from the `.ai`/`.eps` sources.
- F1 (game engines) waits for approval.

## F1 – Game engines (2026-11-21)

**Built**
- `engines/lang.js`: per-language letter helper (graphemes via `Intl.Segmenter`, locale upper case, grid letters,
  hangman slots and keyboards, filler alphabets for en/hu/de/es/fr/it, answer normalising).
- `engines/games/`: Memory, Matching, Word search, Crossword (hidden word, the 2012 design), Hangman, Gapfill,
  Drowning, plus `common.js` and the registry `index.js` (`GAMES`, `generateGame`, `gameSeed`). Teacher settings
  per game as in SPEC 6, clamped to limits. Pure helpers for checking answers (`isPair`, `findWord`, `rowCorrect`,
  hangman `guess`/`status`, `isCorrect`, `waterLevel`) so the F4 student UI and the tests share the rules.
- `engines/fixtures/sample-family-b1.js`: 20 hand-written items in the analysis shape (phrasal verbs, a hyphenated
  and a two-word term).
- Schema detail fixed: `example` is `{ text, answer }` with exactly one `___`; distractors in the answer's form.
- `public/dev/preview.html`: developer preview, every game playable with editable settings and seed, puzzle JSON.

**Verified**
- `npm test`: 30 tests pass (PRNG, language helper incl. Hungarian, German ß, Turkish i, combining accents; every
  game with 300 seeds × default/min/max settings never fails or throws; word search reads every placed word back
  along its direction; crossword rows cross the hidden column at the right letter with no word used twice;
  hangman win/lose; gapfill options; drowning water rule; a Hungarian target-language list in the letter games).
- Browser (local server, built-in browser): all seven games played through by script (memory 8 pairs, matching with
  a deliberate mistake, word search all words, crossword solved and hidden word shown, a hangman round, gapfill
  9/10, three drowning answers); no console errors; at 375 px wide no game overflows (word search cells now scale
  with the grid size; a 16×16 grid overflowed before the fix).

**Deviations / notes**
- Word search with a fixed grid size leaves out words longer than the grid (found by the extreme-settings test).
- The preview is a developer tool, not the student UI; it ships under `/dev/` (noindex) and can be removed at launch.

**Next**
- F2 (analysis: schema, prompt, `analyzeText`, credits) waits for approval.
