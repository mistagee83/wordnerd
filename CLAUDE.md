# WordNerd

A web app for language teachers: upload a text, AI extracts the vocabulary once, and the app builds vocabulary
games from it deterministically, shared with students through a code. One app under Mr. Andrew's EdTech Hub.

## Read first

- `SPEC.md` is the single source of truth. If code and spec disagree, stop and ask.
- `DEVLOG.md` records every phase, decision and deviation. Keep it current.
- `reference/screens/` holds screenshots of the 2013–2014 WordNerd UI: the model for the dashboard. The full old
  material (concept documents, old PHP site, task texts) is at `D:\Dokumentumok\Tanári segédanyagok\WordNerd`;
  read it for game rules, never port its code. Its config files contain old credentials: never copy them anywhere.
- **First step of every session:** `git fetch` and `git status -sb`. If `dev` is behind `origin/dev`, `git pull`
  first; ask if there are local changes. Work happens on more than one machine.

## How we work

- Talk to András in Hungarian. Code, comments, commit messages, docs and all product text are in English.
- Work in phases F0 to F6 (SPEC section 12). After each phase: write the DEVLOG entry, show what was built and how
  it was verified, then STOP and wait for approval. Never start the next phase on your own.
- Ask before any step that has more than one reasonable outcome. Do not guess. Open questions (SPEC section 13) are
  András's to answer.
- Report honestly: say what was tested, what was not, and what failed.

## Branches and deploys

- All work happens on the `dev` branch. `main` is production (Cloudflare Pages, once set up): every push to `main`
  goes live. Never commit to, push to, or merge into `main` without András's explicit approval.
- No Netlify (decided 2026-11-21). Testing happens locally and on the live address, which is unlisted and noindex
  until the Hub lists WordNerd.

## Rules that must not be broken

1. **The model never decides structure.** Grid placement, crossword layout, game order: code. The model only fills
   data fields, validated against a JSON schema.
2. **Games are deterministic.** Generators use only `engines/prng.js`; never `Math.random()` in `engines/`. Same
   list + settings + seed gives the same puzzle everywhere.
3. **Nothing English-specific in engines.** `targetLang` and `supportLang` are data; letters go through the
   per-language helper.
4. **No model API key in the client.** All model calls go through Cloud Functions, which spend credits first and
   refund on failure.
5. **Students have no accounts.** Join by session code and nickname only (anonymous Auth).
6. **Students never see other students' data** and never talk to the model.

## Stack

- Front end: vanilla JS (ES modules), HTML, CSS. No framework, no bundler. `public/` is the site;
  `scripts/build-web.mjs` copies `public/` + `engines/` into `dist/` for hosting.
- Firebase project `mrashub` (shared with the Hub and the other apps; never create a new one).
  - Auth: teachers with Google or e-mail (Hub accounts), students anonymous.
  - Firestore: only `wn`-prefixed collections. `users/{uid}` and `creditLedger` belong to the Hub: read only, except
    the credit spend/refund the Hub's credit pattern prescribes (copy of the Hub's `shared/credits.js`).
  - Cloud Functions: codebase `wordnerd`, Node 22, 2nd gen, europe-west1. Secrets in Secret Manager.
- Firebase config: `public/js/config.js`, values from the Hub's `D:\dev\Edtechhub\shared\firebase-config.js`.
  Never invent or leave out a field.
- Model: `gemini-3.8-flash` (set by András for every Hub project). Use this exact name. If it is unavailable, stop
  and tell András; do not pick a substitute. Every model call returns JSON validated against a schema; prompts are
  versioned files in the repo.
- Deploy only this app's parts: `firebase deploy --only functions:wordnerd`. Never deploy Firestore or Storage
  rules from this repo; a predeploy hook blocks it.
- Do not add dependencies without asking. Front end and engines stay dependency-free; tests use `node:test`.

## Connection to the EdTech Hub

- Shared rules have a single source: the Hub repo at `D:\dev\Edtechhub` (branch `dev`). Read its `CLAUDE.md` and
  `docs/spec-v1.md` ("Firestore adatmodell", "Kreditek", "Közös Auth és app-integráció", "Security Rules", in
  Hungarian) when work touches accounts, credits, entitlements or rules.
- Sister apps with the same setup, useful as working examples (read only, never change them from here): Hubbaloo
  `D:\dev\Hubbaloo` (anonymous students with room code + nickname, credits, sync-hub, deny-deploy), Quiz of the
  Damned `D:\dev\QotD` (Gemini calls in `functions/gemini.js`), Writing Review `D:\dev\writing-review`.
- Access: AI actions need credits only; History needs `entitlements.wordnerd` or `entitlements.all` (SPEC 7).
- Firestore rules: the WordNerd block goes into the Hub's `firestore.rules` between `// ---- WordNerd` and
  `// ---- end WordNerd`. The copies here (`firestore.rules`, `storage.rules`) are for the emulators only. Changing
  them means a commit in the Hub repo and a deploy from there; ask András before doing either.
- Work that touches both repos: commit each repo separately on its own `dev` branch.

## Brand

- The logo in `public/img/brand/` is final (vector sources in `design/brand-source/`). Never redraw or recolour it.
- Colours: raw tokens only in `public/css/tokens.css`, role variables (`--c-*`) only in `public/css/base.css`.
- Dashboard layout follows the old WordNerd (SPEC 10), translated to a phone-first layout.

## Commands

- Static dev server: `npm run serve` (http://localhost:5174; serves `public/` and `/engines/`)
- Unit tests: `npm test` (`node:test`, no dependencies)
- Hub shared modules: `npm run sync:hub` copies the Hub's `shared/entitlements.js`, `credits.js` into
  `engines/hub/` and `sso.js` into `public/js/hub/` (`--check` only reports); never edit the copies.
- Copy engines into functions/: `npm run sync:engines` (automatic before a functions deploy)
- Static build (what hosting runs): `npm run build:web` → `dist/`
- Deploy (only with András's approval): `firebase deploy --only functions:wordnerd`
