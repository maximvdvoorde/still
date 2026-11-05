// Small static server for testing on this computer or a phone on the same Wi-Fi.
// Usage: npm start

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8000;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
};

const server = createServer(async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');
  const path = normalize(join(ROOT, decodeURIComponent(pathname), pathname.endsWith('/') ? 'index.html' : ''));

  try {
    if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) throw new Error('outside the project');
    const body = await readFile(path);
    response.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`On this computer: http://localhost:${PORT}/`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const { address, family, internal } of addresses) {
      if (family === 'IPv4' && !internal) console.log(`On a phone:       http://${address}:${PORT}/`);
    }
  }
});
