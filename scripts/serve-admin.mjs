#!/usr/bin/env node
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const host = process.env.ADMIN_HOST || '0.0.0.0';
const port = Number(process.env.ADMIN_PORT || 3002);
const rootDir = resolve(process.env.ADMIN_FRONTEND_DIST || resolve(process.cwd(), 'dist'));

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

function resolveFilePath(urlPath = '/') {
  const requestPath = urlPath.split('?')[0] || '/';
  const normalizedPath = requestPath === '/' ? '/admin.html' : requestPath;
  const candidatePath = resolve(rootDir, `.${normalizedPath}`);
  if (existsSync(candidatePath)) return candidatePath;
  return resolve(rootDir, 'admin.html');
}

const server = createServer(async (req, res) => {
  try {
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
