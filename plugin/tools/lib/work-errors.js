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
]);

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
