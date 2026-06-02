import { createServer } from 'node:http';
import { generateCode } from './codegen.js';
import { mintCode, ValidationError } from './service.js';
import { readJsonBody, BodyTooLargeError, BodyParseError } from './http/parse-body.js';
import { json, redirect, notFound, error } from './http/respond.js';

const CODE_PATH_RE = /^\/[0-9A-Za-z]{7}$/;

export function buildServer({ storage, baseUrl, version, log = defaultLog }) {
  const server = createServer(async (req, res) => {
    const start = Date.now();
    res.on('finish', () => {
      log(`${req.method} ${req.url} ${res.statusCode} ${Date.now() - start}ms`);
    });

    try {
      await dispatch(req, res, { storage, baseUrl, version });
    } catch (err) {
      log(`unhandled error: ${err.message}`);
      if (!res.headersSent) error(res, 500, 'internal error');
    }
  });

  server.requestTimeout = 10_000;
  server.headersTimeout = 5_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;

  return server;
}

async function dispatch(req, res, { storage, baseUrl, version }) {
  const path = req.url.split('?')[0];

  if (req.method === 'POST' && path === '/shorten') {
    return handleShorten(req, res, { storage, baseUrl });
  }

  if (req.method === 'GET' && path === '/healthz') {
    return json(res, 200, { status: 'ok', version });
  }

  if (req.method === 'GET' && CODE_PATH_RE.test(path)) {
    const code = path.slice(1);
    const row = storage.get(code);
    if (!row) return notFound(res, 'code not found');
    return redirect(res, row.longUrl);
  }

  return notFound(res);
}

async function handleShorten(req, res, { storage, baseUrl }) {
  const ct = req.headers['content-type'] || '';
  if (!ct.toLowerCase().startsWith('application/json')) {
    return error(res, 400, 'content-type must be application/json');
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    if (err instanceof BodyTooLargeError) return error(res, 413, 'body too large');
    if (err instanceof BodyParseError) return error(res, 400, err.reason);
    return error(res, 400, 'invalid request body');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return error(res, 400, 'body must be a JSON object');
  }
  if (!('url' in body)) {
    return error(res, 400, 'url field is required');
  }

  try {
    const result = mintCode(body.url, { storage, generateCode });
    return json(res, 201, {
      code: result.code,
      shortUrl: `${baseUrl}/${result.code}`,
    });
  } catch (err) {
    if (err instanceof ValidationError) return error(res, 400, err.reason);
    return error(res, 500, 'internal error');
  }
}

function defaultLog(line) {
  console.log(line);
}
