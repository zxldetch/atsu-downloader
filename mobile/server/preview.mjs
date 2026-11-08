#!/usr/bin/env node
/**
 * Preview server for the web build.
 *
 * Two jobs:
 *  1. Serve the exported Expo web bundle (an SPA) from ./dist.
 *  2. Proxy atsu.moe so the browser build can actually talk to the source.
 *     Browsers cannot set `Referer` and atsu.moe sends no CORS headers, so a
 *     same-origin proxy is the only way — native builds skip all of this and
 *     call atsu.moe directly.
 *
 *   GET /proxy/atsu/*  → https://atsu.moe/*
 *   GET /proxy/cdn/*   → https://cdn.atsu.moe/*
 *
 * Usage: node server/preview.mjs   (PORT, default 8080)
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8080);
const HOST = '0.0.0.0';

const UPSTREAM = {
  '/proxy/atsu': 'https://atsu.moe',
  '/proxy/cdn': 'https://cdn.atsu.moe',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function proxy(req, res, prefix, upstream) {
  const suffix = req.url.slice(prefix.length) || '/';
  const target = `${upstream}${suffix.startsWith('/') ? '' : '/'}${suffix}`;

  try {
    const upstreamResponse = await fetch(target, {
      headers: {
        // atsu.moe expects a browser-ish client; the CDN may check Referer.
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36',
        Accept: req.headers.accept || '*/*',
        Referer: 'https://atsu.moe/',
      },
    });

    const contentType = upstreamResponse.headers.get('content-type') ?? 'application/octet-stream';
    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());

    res.writeHead(upstreamResponse.status, {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=300',
    });
    res.end(buffer);
  } catch (error) {
    console.warn(`[proxy] ${target} failed: ${error.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'upstream-unreachable',
        detail: `Could not reach ${upstream} from this server. Turn on Demo mode in Settings to explore the app offline.`,
      }),
    );
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const candidate = normalize(join(DIST, pathname));
  if (!candidate.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const file = existsSync(candidate) && statSync(candidate).isFile()
    ? candidate
    : join(DIST, 'index.html'); // SPA fallback

  if (!existsSync(file)) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Build missing — run `npm run build:web` first.');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=600',
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const prefix = Object.keys(UPSTREAM).find((key) => req.url.startsWith(key));
  if (prefix) {
    void proxy(req, res, prefix, UPSTREAM[prefix]);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`Atsu Mobile preview → http://${HOST}:${PORT}`);
  console.log(`  serving ${DIST}`);
  console.log('  proxying /proxy/atsu → https://atsu.moe, /proxy/cdn → https://cdn.atsu.moe');
});
