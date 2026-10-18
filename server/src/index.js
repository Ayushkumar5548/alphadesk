'use strict';
// AlphaDesk server: JSON API under /api/*, static client build from
// ../client/dist (SPA fallback), graceful shutdown. Zero npm dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const api = require('./api');
const engine = require('./engine');

const PORT = Number.parseInt(process.env.PORT, 10) || 8787;
const DIST = path.resolve(__dirname, '..', '..', 'client', 'dist');
const INDEX_FILE = path.join(DIST, 'index.html');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
};

function serveFile(res, filePath, method) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (e) {
    return false;
  }
  if (!stat.isFile()) return false;
  const ext = path.extname(filePath).toLowerCase();
  const type = CONTENT_TYPES[ext] || 'application/octet-stream';
  const isHtml = ext === '.html';
  const headers = {
    'Content-Type': type,
    'Content-Length': stat.size,
    'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=600',
    'X-Content-Type-Options': 'nosniff',
  };
  res.writeHead(200, headers);
  if (method === 'HEAD') {
    res.end();
    return true;
  }
  const stream = fs.createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) res.writeHead(500);
    res.end('Internal server error');
  });
  stream.pipe(res);
  return true;
}

function notFoundJson(res, message) {
  const body = JSON.stringify({ error: { code: 'NOT_FOUND', message } });
  res.writeHead(404, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function handleStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const body = JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: `${req.method} is not allowed for static routes` } });
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), Allow: 'GET,HEAD' });
    res.end(body);
    return;
  }

  if (pathname.includes('\0')) {
    notFoundJson(res, 'Bad path');
    return;
  }

  let rel = pathname === '/' ? '/index.html' : pathname;
  // Resolve + traversal guard: never escape DIST.
  const resolved = path.normalize(path.join(DIST, rel));
  if (resolved !== DIST && !resolved.startsWith(DIST + path.sep)) {
    notFoundJson(res, 'Bad path');
    return;
  }

  if (serveFile(res, resolved, req.method)) return;

  // SPA fallback: any unknown non-/api route renders the client app.
  if (fs.existsSync(INDEX_FILE)) {
    serveFile(res, INDEX_FILE, req.method);
    return;
  }
  notFoundJson(res, 'Client build not found (expected client/dist/index.html)');
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    const body = JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Malformed request URL' } });
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
    return;
  }

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    Promise.resolve(api.handle(req, res)).catch((err) => {
      console.error('[server] API failure:', err);
      if (!res.headersSent) {
        const body = JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
        res.end(body);
      } else {
        res.end();
      }
    });
    return;
  }

  try {
    handleStatic(req, res, pathname);
  } catch (err) {
    console.error('[server] static failure:', err);
    if (!res.headersSent) {
      const body = JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
    } else {
      res.end();
    }
  }
});

function shutdown() {
  server.close(() => process.exit(0));
  // Force-exit if lingering sockets keep the server open.
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (err) => {
  console.error('[server] uncaught exception:', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[server] unhandled rejection:', err);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use — set PORT to a free port.`);
    process.exit(1);
  }
  console.error('[server] error:', err);
  process.exit(1);
});

// Bind to all interfaces so phones/other PCs on the same network can reach it.
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`AlphaDesk server listening at http://localhost:${PORT}`);
  console.log(`[net] also reachable on your network at http://<this-machine-IP>:${PORT}`);

  // Warm the engine only AFTER the port is bound. Platform health checks
  // (Render / Fly / Docker) then get an instant 200 from /api/health instead of
  // waiting on the engine, which matters on 0.1-CPU free instances.
  setImmediate(() => {
    try {
      engine.warmup();
    } catch (err) {
      console.error('[server] engine warmup failed:', err);
      process.exit(1);
    }

    // Kick off the live market-data overlay. Non-blocking: the simulated
    // baseline serves immediately and the UI flips to live as data lands.
    if (process.env.ALPHADESK_LIVE === '0') {
      console.log('[market] live data disabled (ALPHADESK_LIVE=0) — serving simulated baseline');
      return;
    }
    engine.startMarket()
      .then((s) => {
        console.log(`[market] ${s.online ? 'online' : 'offline'} — ${s.quotes.done}/${s.quotes.total} quotes via ${s.source}`);
        if (!s.online && s.lastError) console.log(`[market] note: ${s.lastError}`);
      })
      .catch((err) => console.error('[market] start failed:', (err && err.message) || err));
  });
});
