// Dependency-free local server. Serves public/ as the site root and engines/ at /engines/
// (the browser imports the same game generators the functions use).
// Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 5174);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function resolvePath(urlPath) {
  const base = urlPath.startsWith('/engines/') ? root : join(root, 'public');
  const full = normalize(join(base, decodeURIComponent(urlPath)));
  if (!full.startsWith(base + sep) && full !== base) return null; // no path traversal
  return full;
}

createServer(async (req, res) => {
  const urlPath = new URL(req.url, 'http://localhost').pathname;
  let file = resolvePath(urlPath);
  try {
    if (!file) throw new Error('forbidden');
    // like Cloudflare Pages: /play serves play.html
    if (!extname(file)) { try { await stat(`${file}.html`); file = `${file}.html`; } catch { /* a folder or a missing page */ } }
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, () => console.log(`WordNerd dev server: http://localhost:${port}`));
