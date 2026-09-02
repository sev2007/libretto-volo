import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT || process.argv[2] || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.md': 'text/markdown; charset=utf-8'
};

function safePath(urlPath) {
  const pathname = decodeURIComponent(String(urlPath || '/').split('?')[0]);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const full = resolve(ROOT, relative);
  if (full !== ROOT && !full.startsWith(`${ROOT}${sep}`)) return null;
  return full;
}

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }
  let filePath = safePath(request.url);
  if (!filePath) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = resolve(filePath, 'index.html');
    const body = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': MIME[extension] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': extension === '.html' || extension === '.js' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') response.end();
    else response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('File non trovato.');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Libretto Volo disponibile su http://${HOST}:${PORT}`);
  console.log('Premi Ctrl+C per chiudere.');
});
