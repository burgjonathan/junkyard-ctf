import { createServer } from 'http';
import { readFile, stat } from 'fs/promises';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { RoomManager } from './rooms.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const PORT = Number(process.env.PORT) || 3001;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

async function serveStatic(reqPath: string): Promise<{ status: number; body: Buffer | string; type: string }> {
  // Normalize + strip query
  const clean = reqPath.split('?')[0].split('#')[0] || '/';
  const rel = clean === '/' ? '/index.html' : clean;
  const full = path.normalize(path.join(DIST_DIR, rel));
  // Prevent traversal outside dist/
  if (!full.startsWith(DIST_DIR)) {
    return { status: 403, body: 'Forbidden', type: 'text/plain' };
  }
  try {
    const s = await stat(full);
    if (s.isDirectory()) {
      const idx = path.join(full, 'index.html');
      const body = await readFile(idx);
      return { status: 200, body, type: 'text/html; charset=utf-8' };
    }
    const body = await readFile(full);
    const ext = path.extname(full).toLowerCase();
    return { status: 200, body, type: MIME[ext] ?? 'application/octet-stream' };
  } catch {
    // Fall through to SPA fallback: serve index.html for unknown routes
    try {
      const body = await readFile(path.join(DIST_DIR, 'index.html'));
      return { status: 200, body, type: 'text/html; charset=utf-8' };
    } catch {
      return { status: 404, body: 'Not found', type: 'text/plain' };
    }
  }
}

const server = createServer(async (req, res) => {
  const url = req.url ?? '/';
  if (url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  const { status, body, type } = await serveStatic(url);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': status === 200 ? 'public, max-age=60' : 'no-cache' });
  res.end(body);
});

const wss = new WebSocketServer({ server });
const manager = new RoomManager();

wss.on('connection', (ws) => {
  manager.attach(ws);
});

server.listen(PORT, () => {
  console.log(`[ctf-server] http + ws listening on :${PORT}`);
});
