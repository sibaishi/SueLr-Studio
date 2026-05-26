#!/usr/bin/env node
import { createServer } from 'node:http';
import http from 'node:http';
import https from 'node:https';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const host = process.env.ADMIN_HOST || '0.0.0.0';
const port = Number(process.env.ADMIN_PORT || 3002);
const rootDir = resolve(process.env.ADMIN_FRONTEND_DIST || resolve(process.cwd(), 'dist'));
const apiTarget = process.env.ADMIN_API_TARGET || `http://${process.env.APP_HOST || '127.0.0.1'}:${process.env.APP_PORT || '3001'}`;

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
]);

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

function buildProxyHeaders(headers) {
  const next = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value == null) continue;
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection' || lower === 'content-length' || lower === 'transfer-encoding') {
      continue;
    }
    next[key] = Array.isArray(value) ? value.map((item) => String(item)).join(', ') : String(value);
  }
  return next;
}

async function proxyApiRequest(req, res, targetBase) {
  const targetUrl = new URL(req.url || '/', targetBase);
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readRequestBody(req);
  const transport = targetUrl.protocol === 'https:' ? https : http;

  await new Promise((resolvePromise, rejectPromise) => {
    const upstreamReq = transport.request(targetUrl, {
      method: req.method,
      headers: {
        ...buildProxyHeaders(req.headers),
        ...(body ? { 'content-length': String(body.length) } : {}),
      },
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers);
      upstreamRes.on('data', (chunk) => res.write(chunk));
      upstreamRes.on('end', () => {
        res.end();
        resolvePromise();
      });
    });

    upstreamReq.on('error', rejectPromise);
    if (body) upstreamReq.write(body);
    upstreamReq.end();
  });
}

function resolveFilePath(urlPath = '/') {
  const requestPath = urlPath.split('?')[0] || '/';
  const normalizedPath = requestPath === '/' ? '/admin.html' : requestPath;
  const candidatePath = resolve(rootDir, `.${normalizedPath}`);
  if (existsSync(candidatePath)) return candidatePath;
  return resolve(rootDir, 'admin.html');
}

const server = createServer(async (req, res) => {
  try {
    if ((req.url || '').startsWith('/api/')) {
      await proxyApiRequest(req, res, apiTarget);
      return;
    }

    const filePath = resolveFilePath(req.url || '/');
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

server.listen(port, host, () => {
  console.log(`[admin] http://${host}:${port}`);
});
