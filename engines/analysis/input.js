// Checks what the teacher sends to the analysis, before any credit is spent. Pure, no I/O; the same
// rules run in the browser (F3, to show errors early) and in the function (the one that counts).
import { LEVELS, SUPPORT_LANGS, TARGET_LANGS } from './languages.js';

export const INPUT_LIMITS = Object.freeze({
  minWords: 40,
  maxWords: 2500, // a reading or a lesson, not a book (SPEC 4)
  maxChars: 20000,
  maxFileBytes: 4 * 1024 * 1024, // per file
  maxFiles: 4, // e.g. a few screenshots of the pages of one lesson (2026-11-25)
  maxTotalFileBytes: 6 * 1024 * 1024, // all files together: a callable request carries at most ~10 MB; base64 adds a third
  // a number, or 'auto': the model decides how many words are really useful, up to autoMax (decided 2026-11-21)
  count: { min: 10, max: 30, def: 'auto', autoMax: 40 },
  focusChars: 120,
  titleChars: 80,
});

export const FILE_TYPES = Object.freeze({
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
});

const countWords = (s) => (String(s).trim().match(/\S+/g) ?? []).length;
const base64Bytes = (b64) => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/** data -> { ok: true, input } | { ok: false, reason } (reason is a short code the UI translates). */
export function checkInput(data = {}) {
  const targetLang = data.targetLang ?? 'en';
  if (!TARGET_LANGS[targetLang]) return { ok: false, reason: 'target-language' };
  if (!SUPPORT_LANGS[data.supportLang]) return { ok: false, reason: 'support-language' };
  if (!LEVELS.includes(data.level)) return { ok: false, reason: 'level' };
  const raw = data.count ?? INPUT_LIMITS.count.def;
  const c = raw === 'auto' ? 'auto' : Number(raw);
  if (c !== 'auto' && (!Number.isInteger(c) || c < INPUT_LIMITS.count.min || c > INPUT_LIMITS.count.max)) return { ok: false, reason: 'count' };
  const focus = typeof data.focus === 'string' ? data.focus.trim().slice(0, INPUT_LIMITS.focusChars) : '';
  const title = typeof data.title === 'string' ? data.title.trim().slice(0, INPUT_LIMITS.titleChars) : '';
  const base = { targetLang, supportLang: data.supportLang, level: data.level, count: c, focus, title };

  if (data.kind === 'text') {
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (text.length > INPUT_LIMITS.maxChars) return { ok: false, reason: 'text-too-long' };
    const n = countWords(text);
    if (n < INPUT_LIMITS.minWords) return { ok: false, reason: 'text-too-short' };
    if (n > INPUT_LIMITS.maxWords) return { ok: false, reason: 'text-too-long' };
    return { ok: true, input: { ...base, kind: 'text', text, source: { kind: 'text', wordCount: n, title: title || null } } };
  }
  if (data.kind === 'file') {
    // `files`: up to maxFiles, in reading order; a single `file` (the earlier request shape) still works
    const list = Array.isArray(data.files) ? data.files : data.file ? [data.file] : [];
    if (!list.length) return { ok: false, reason: 'file-type' };
    if (list.length > INPUT_LIMITS.maxFiles) return { ok: false, reason: 'too-many-files' };
    const files = [];
    let total = 0;
    for (const f of list) {
      const mimeType = f?.mimeType;
      const b64 = typeof f?.data === 'string' ? f.data : '';
      if (!FILE_TYPES[mimeType]) return { ok: false, reason: 'file-type' };
      if (!b64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, reason: 'file-data' };
      const bytes = base64Bytes(b64);
      if (bytes > INPUT_LIMITS.maxFileBytes) return { ok: false, reason: 'file-too-large' };
      total += bytes;
      files.push({ mimeType, data: b64 });
    }
    if (total > INPUT_LIMITS.maxTotalFileBytes) return { ok: false, reason: 'files-too-large' };
    const name = typeof list[0]?.name === 'string' ? list[0].name.slice(0, 120) : null;
    const kind = files.some((f) => FILE_TYPES[f.mimeType] === 'pdf') ? 'pdf' : 'image';
    const source = { kind, bytes: total, title: title || name };
    if (files.length > 1) source.files = files.length;
    return { ok: true, input: { ...base, kind: 'file', files, source } };
  }
  return { ok: false, reason: 'kind' };
}
