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
