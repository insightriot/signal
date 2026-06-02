const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};

export function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...SECURITY_HEADERS,
  });
  res.end(payload);
}

export function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

export function notFound(res, message = 'not found') {
  json(res, 404, { error: message });
}

export function error(res, status, message) {
  // Do not echo arbitrary input — emit only a static, safe message string.
  json(res, status, { error: message });
}
