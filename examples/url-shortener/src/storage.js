import { readFileSync, writeFileSync, existsSync } from 'node:fs';

// Zero-dependency persistence: the whole store is a JSON object
// { code: longUrl } loaded into memory on open and written back on each
// mutation. Plenty for a single-process demo, and `npm install` never
// compiles a native module (no better-sqlite3, no node:sqlite).
export function openStorage(dbPath) {
  let data = {};
  if (existsSync(dbPath)) {
    // readFileSync throws (EISDIR) if dbPath is a directory; index.js turns
    // that into a non-zero startup exit (test N3c).
    const raw = readFileSync(dbPath, 'utf8');
    data = raw.trim() === '' ? {} : JSON.parse(raw);
  } else {
    // Create the file up front so an unwritable/dir path fails fast on open.
    writeFileSync(dbPath, '{}');
  }

  function persist() {
    writeFileSync(dbPath, JSON.stringify(data));
  }

  return {
    put(code, longUrl) {
      // INSERT-OR-IGNORE semantics: never overwrite an existing code.
      if (Object.prototype.hasOwnProperty.call(data, code)) {
        return { inserted: false };
      }
      data[code] = longUrl;
      persist();
      return { inserted: true };
    },
    get(code) {
      return Object.prototype.hasOwnProperty.call(data, code)
        ? { longUrl: data[code] }
        : null;
    },
    close() {
      persist();
    },
  };
}
