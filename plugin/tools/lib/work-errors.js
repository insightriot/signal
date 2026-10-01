// The work store's one error class (M6.E11). A leaf module — no imports — so
// `atomic-write.js` can throw it without an import cycle: `state.js` imports
// `atomic-write.js`, and `work-item.js` imports `state.js`, so the class
// cannot live only in `work-item.js` (which re-exports it from here).

export const WORK_STORE_ERROR_CODES = Object.freeze([
  'CONFIG',
  'SCHEMA',
  'NOT_FOUND',
  'CONFLICT',
  'GENERATED',
  'OPEN_ITEMS',
  'LOCKED', // another store mutation holds the `work` lock — retry
  'IO', // git or the filesystem failed; the message says which, and what stood
]);

/**
 * `err` as a WorkStoreError: returned as is when it already is one, otherwise
 * wrapped with `code`, the same message (plus `prefix`), and `cause`.
 * @param {unknown} err
 * @param {string} code
 * @param {string} [prefix]
 * @returns {WorkStoreError}
 */
export function asWorkStoreError(err, code, prefix = '') {
  if (err instanceof WorkStoreError) return err;
  const wrapped = new WorkStoreError(code, `${prefix}${err?.message ?? String(err)}`);
  wrapped.cause = err;
  return wrapped;
}

/**
 * A failure to take the `work` lock as a WorkStoreError: `IO` when the
 * filesystem or Node failed (an errno code such as EACCES, or a Node
 * `ERR_*` code), `LOCKED` otherwise — `acquireLock` throws a plain Error,
 * with no code, when another holder has the lock. The split matters: a caller
 * that retries on LOCKED would retry an EACCES forever (REVIEW P2-I6).
 * @param {unknown} err
 * @returns {WorkStoreError}
 */
export function lockFailure(err) {
  const io = typeof err?.code === 'string' && /^E[A-Z_]+$/.test(err.code);
  return asWorkStoreError(err, io ? 'IO' : 'LOCKED');
}

/**
 * The one error class every store module throws. Callers dispatch on `code`,
 * never on message text.
 */
export class WorkStoreError extends Error {
  constructor(code, message) {
    if (!WORK_STORE_ERROR_CODES.includes(code)) {
      throw new Error(`WorkStoreError: unknown code ${JSON.stringify(code)}`);
    }
    super(message);
    this.name = 'WorkStoreError';
    this.code = code;
  }
}
