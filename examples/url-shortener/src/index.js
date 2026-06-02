import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { openStorage } from './storage.js';
import { buildServer } from './server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const PORT = Number(process.env.PORT ?? '8080');
const DB_PATH = process.env.DB_PATH ?? './shortener.db';
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

let storage;
try {
  storage = openStorage(DB_PATH);
} catch (err) {
  console.error(`startup failure: cannot open DB at ${DB_PATH}: ${err.message}`);
  process.exit(1);
}

const server = buildServer({ storage, baseUrl: BASE_URL, version: pkg.version });

server.on('error', (err) => {
  console.error(`server error: ${err.message}`);
  process.exit(1);
});

server.listen(PORT, () => {
  const { port } = server.address();
  console.log(`listening on ${port}`);
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`received ${signal}, shutting down`);

  // 10s force-exit timer; .unref() so it does not keep the loop alive.
  const force = setTimeout(() => {
    console.error('forced exit after 10s grace');
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close(() => {
    storage.close();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
