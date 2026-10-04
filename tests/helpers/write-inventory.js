// The checks behind tests/work-records-inventory.test.js (M6.E13.S2.t2.4, AC2.2).
// Kept apart from the test so the test can run them against deliberately bad
// fixtures as well as against work-records.js itself.

import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { recordPath } from '../../plugin/tools/lib/work-records.js';

// ── Static: who takes the lock, and who calls whom ──────────────────────────

// Blank out comments and string/template/regex literal contents (newlines
// kept), so neither a comment nor a message text reads as a call.
function code(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let last = ''; // last non-space code character, for the regex heuristic
  while (i < n) {
    const c = source[i];
    const d = source[i + 1];
    if (c === '/' && d === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '/' && d === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n && source[j] !== c) j += source[j] === '\\' ? 2 : 1;
      out += c + blank(source.slice(i + 1, j)) + c;
      i = j + 1;
      last = c;
    } else if (c === '/' && (last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last))) {
      let j = i + 1;
      let inClass = false;
      while (j < n && source[j] !== '\n') {
        if (source[j] === '\\') j += 2;
        else {
          if (source[j] === '[') inClass = true;
          else if (source[j] === ']') inClass = false;
          else if (source[j] === '/' && !inClass) break;
          j += 1;
        }
      }
      out += `/${blank(source.slice(i + 1, j))}/`;
      i = j + 1;
      last = '/';
    } else {
      out += c;
      if (!/\s/.test(c)) last = c;
      i += 1;
    }
  }
  return out;
}

const DECL_RES = [
  /^(export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/gm,
  /^(export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)/gm,
];
const TOP_LEVEL_RE = /^(?:export\s|async\s|function\s|const\s|let\s|var\s|class\s|import\s)/gm;

/**
 * The lock-taking functions of a module and every Decision 9 violation.
 *
 * A top-level function is lock-taking when it calls `acquireLock(` or
 * references a lock-taking function. Violations:
 * - a lock-taking export that reaches the lock by two or more entry points
 *   (another lock-taking export, or its own take): a nested or repeated take.
 *   Pure delegation to ONE other export is a single take and passes;
 * - an internal function that takes the lock without calling `acquireLock`
 *   itself (internal functions receive a handle; only the lock helper and the
 *   public entry points take it);
 * - `acquireLock` imported under an alias (the scan matches the name).
 *
 * @param {string} source
 * @returns {{lockTaking: string[], violations: string[]}} lockTaking in source order
 */
export function lockNesting(source) {
  const violations = [];
  if (/import\s*\{[^}]*\bacquireLock\s+as\s+/.test(source)) {
    violations.push('acquireLock is imported under an alias — import it by name, so the lock scan can see every take');
  }
  const text = code(source);

  const decls = [];
  for (const re of DECL_RES) {
    for (const m of text.matchAll(re)) decls.push({ name: m[2], exported: Boolean(m[1]), start: m.index, headerEnd: m.index + m[0].length });
  }
  decls.sort((a, b) => a.start - b.start);
  const exportedList = new Set();
  for (const m of text.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name) exportedList.add(name);
    }
  }
  const tops = [...text.matchAll(TOP_LEVEL_RE)].map((m) => m.index);
  for (const d of decls) {
    const next = tops.find((t) => t > d.start) ?? text.length;
    d.body = text.slice(d.headerEnd, next);
    if (exportedList.has(d.name)) d.exported = true;
  }

  const names = decls.map((d) => d.name);
  const ref = (name) => new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\b`);
  const callees = new Map(decls.map((d) => [d.name, names.filter((n) => n !== d.name && ref(n).test(d.body))]));
  const direct = new Set(decls.filter((d) => /(?<![\w$.])acquireLock\s*\(/.test(d.body)).map((d) => d.name));

  const taking = new Set(direct);
  for (let changed = true; changed;) {
    changed = false;
    for (const d of decls) {
      if (!taking.has(d.name) && callees.get(d.name).some((c) => taking.has(c))) {
        taking.add(d.name);
        changed = true;
      }
    }
  }

  // The lock entry points an export reaches: each other lock-taking export it
  // reaches first on a path (not looked through), plus 'its own take' when it
  // reaches `acquireLock` without going through another export. Two or more
  // is two takes — nested or one after the other (the `promoteInStore` double
  // lock, B6). Exactly one is fine, including pure delegation to one export.
  const exported = new Set(decls.filter((d) => d.exported).map((d) => d.name));
  const OWN = 'its own take';
  const entryPoints = (from) => {
    const found = new Set(direct.has(from) ? [OWN] : []);
    const seen = new Set([from]);
    const stack = [...callees.get(from)];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n) || !taking.has(n)) continue;
      seen.add(n);
      if (exported.has(n)) found.add(n);
      else if (direct.has(n)) found.add(OWN);
      else stack.push(...callees.get(n));
    }
    return [...found].sort();
  };
  for (const e of [...exported].filter((n) => taking.has(n))) {
    const points = entryPoints(e);
    if (points.length > 1) {
      violations.push(`${e} reaches the work lock ${points.length} ways (${points.join(', ')}) `
        + '— a nested or repeated take (Decision 9)');
    }
  }
  for (const d of decls) {
    if (!d.exported && taking.has(d.name) && !direct.has(d.name)) {
      violations.push(`${d.name}: an internal function that takes the lock — internal functions receive a handle (Decision 9)`);
    }
  }
  return { lockTaking: names.filter((n) => taking.has(n)), violations };
}

// ── Runtime: classification, and what each export does to the disk ─────────

/**
 * Every exported function must sit in exactly one of READERS, WRITERS, EXEMPT,
 * and every table entry must be an exported function.
 * @returns {string[]} violations: unclassified, then doubly classified, then stale
 */
export function classify(mod, tables) {
  const fns = Object.keys(mod).filter((k) => typeof mod[k] === 'function');
  const where = (name) => Object.keys(tables).filter((t) => name in tables[t]);
  const out = [];
  for (const name of fns) {
    if (where(name).length === 0) {
      out.push(`${name}: exported function not classified — add it to READERS, WRITERS or EXEMPT in tests/work-records-inventory.test.js`);
    }
  }
  for (const name of fns) {
    const w = where(name);
    if (w.length > 1) out.push(`${name}: classified more than once (${w.join(', ')})`);
  }
  for (const [table, entries] of Object.entries(tables)) {
    for (const name of Object.keys(entries)) {
      if (typeof mod[name] !== 'function') out.push(`${name}: listed in ${table} but not an exported function`);
    }
  }
  return out;
}

// Lock files come and go with every locked call; they are not store content.
const IGNORED = /\.lock(\.stale-[^/]*)?$/;

/** Every file under `base` (symlinks by target), rel path → content. */
export function snapshotTree(base) {
  const out = new Map();
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      const rel = relative(base, abs).split(sep).join('/');
      if (IGNORED.test(rel)) continue;
      if (e.isDirectory()) walk(abs);
      else if (lstatSync(abs).isSymbolicLink()) out.set(rel, `-> ${readlinkSync(abs)}`);
      else out.set(rel, readFileSync(abs, 'latin1'));
    }
  };
  walk(base);
  return out;
}

function diff(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((p) => before.get(p) !== after.get(p)).sort();
}

/** Each reader, run on the store, must change no file. */
export async function checkReaders(base, readers) {
  const out = [];
  for (const [name, fn] of Object.entries(readers)) {
    const before = snapshotTree(base);
    try {
      await fn(base);
    } catch (err) {
      out.push(`${name}: threw on the fixture store (${err.message}) — fix its call in READERS`);
    }
    const changed = diff(before, snapshotTree(base));
    if (changed.length > 0) out.push(`${name}: a reader changed ${changed.join(', ')}`);
  }
  return out;
}

const RECORD_RE = /^\.planning\/work\/items\/[^/]+\/[^/]+\.json$/;

/**
 * Run one writer and judge every record file it touched: a changed record
 * gained exactly one event with the old ones an unchanged prefix; no record
 * moved or vanished; a new record sits at its recordPath with `newEvents`
 * events (default 1); and at least one record changed.
 */
export async function checkWriter(base, name, { run, newEvents = 1 }) {
  const before = snapshotTree(base);
  await run(base);
  const after = snapshotTree(base);
  const out = [];
  let touched = 0;
  const parse = (text, rel) => {
    try {
      return JSON.parse(text);
    } catch {
      out.push(`${name}: ${rel} is not valid JSON after the write`);
      return null;
    }
  };
  for (const rel of diff(before, after).filter((p) => RECORD_RE.test(p))) {
    touched += 1;
    if (!after.has(rel)) {
      out.push(`${name}: ${rel} removed or moved — a record never moves (AC1.1)`);
      continue;
    }
    const now = parse(after.get(rel), rel);
    if (now === null) continue;
    if (!before.has(rel)) {
      let expected;
      try {
        expected = recordPath(now.id);
      } catch {
        expected = null;
      }
      if (rel !== expected) out.push(`${name}: new record ${rel} is not at recordPath(${JSON.stringify(now.id)})`);
      const count = Array.isArray(now.events) ? now.events.length : 0;
      if (count !== newEvents) out.push(`${name}: new record ${rel} written with ${count} events (expected ${newEvents})`);
      continue;
    }
    const was = parse(before.get(rel), rel);
    if (was === null) continue;
    const old = was.events ?? [];
    const cur = Array.isArray(now.events) ? now.events : [];
    if (!isDeepStrictEqual(cur.slice(0, old.length), old)) {
      out.push(`${name}: ${rel} — the old events are not a prefix of the new ones (history rewritten)`);
      continue;
    }
    const added = cur.length - old.length;
    if (added !== 1) out.push(`${name}: ${rel} changed with ${added} events appended (exactly 1 required)`);
  }
  if (touched === 0) out.push(`${name}: changed no record — its scenario does not exercise it`);
  return out;
}
