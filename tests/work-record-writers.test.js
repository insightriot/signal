// M6.E13 REVIEW I5 — the write-path inventory beyond one module (AC2.2).
// See .planning/M6.E13-VALIDATION.md row AC2.2.
//
// `tests/work-records-inventory.test.js` proves every writer IN
// `work-records.js` appends exactly one event. It says nothing about another
// module: one that serialized a record and wrote it itself could rewrite a
// field with no event, and both that inventory and the live `checkRecords`
// would pass (a well-formed record with a quiet field change is valid).
//
// So this is a STATIC check over every module under `plugin/tools/lib/` and
// `plugin/hooks/`: a module is a record writer when its code (comments
// skipped) both
//   - names a record — `serializeRecord`, `recordPath(`, a `work/items` path,
//     or an `'items'` path segment — and
//   - calls a file-write primitive (`writeFile`, `atomicWrite`, `rename`,
//     `copyFile`, `cpSync`, `appendFile`, `createWriteStream`, their Sync forms).
// Only `work-records.js` may be one, plus the reviewed exemptions below, each
// with its reason. A planted violation proves the scan bites.
//
// The residue, stated: a module that builds a record path with no marker above
// (say, a template string assembled from parts) and writes it with a primitive
// not listed (an `open(…, 'w')` handle, a child process) is invisible here.
// This catches the plain way to do it, which is the way it would be done.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIRS = ['plugin/tools/lib', 'plugin/hooks'];

const OWNER = 'plugin/tools/lib/work-records.js';

const RECORD_MARKERS = [
  /\bserializeRecord\b/,
  /\brecordPath\(/,
  /work\/items/,
  /(['"`])items\1/,
];
const WRITE_PRIMITIVE = /\b(writeFile|writeFileSync|atomicWrite|appendFile|appendFileSync|rename|renameSync|copyFile|copyFileSync|cpSync|cp|createWriteStream)\(/;

// Reviewed exemptions: the file, and why it writes records outside the owner.
const EXEMPTIONS = [
  {
    file: 'plugin/tools/lib/work-migrate-v2.js',
    reason: 'the v1 → v2 migration builds the store before it exists: there is no store for work-records.js to '
      + 'write through yet, and each record is born with its full converted event log (AC8.3), not appended to',
  },
];

/** The module's code lines, comment lines skipped (a path quoted in a comment writes nothing). */
const codeLines = (text) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

/**
 * Does this module write record files? `{markers, writes}` when it both names a
 * record and calls a write primitive, else null.
 */
function recordWriter(text) {
  const lines = codeLines(text);
  const markers = RECORD_MARKERS.filter((re) => lines.some((l) => re.test(l))).map(String);
  const writes = lines.filter((l) => WRITE_PRIMITIVE.test(l)).map((l) => l.trim());
  return markers.length && writes.length ? { markers, writes } : null;
}

/** The record writers in `found` that are neither the owner nor exempt, as messages. */
function violations(found) {
  const exempt = new Set(EXEMPTIONS.map((e) => e.file));
  return found.filter((m) => m.file !== OWNER && !exempt.has(m.file))
    .map((m) => `${m.file}: names ${m.hit.markers.join(', ')} and writes: ${m.hit.writes[0]}`);
}

function modules() {
  return DIRS.flatMap((d) => readdirSync(join(ROOT, d))
    .filter((n) => n.endsWith('.js') || n.endsWith('.mjs'))
    .map((n) => `${d}/${n}`));
}

describe('no module but work-records.js writes record files (AC2.2, REVIEW I5)', () => {
  const found = modules()
    .map((file) => ({ file, hit: recordWriter(readFileSync(join(ROOT, file), 'utf-8')) }))
    .filter((m) => m.hit);

  it('scans both directories, the owner among them', () => {
    expect(modules()).toContain(OWNER);
    expect(modules().some((f) => f.startsWith('plugin/hooks/'))).toBe(true);
  });

  it('the owner is found as a writer (the scan sees the real thing)', () => {
    expect(found.map((m) => m.file)).toContain(OWNER);
  });

  it('every other record writer is a reviewed exemption', () => {
    expect(violations(found)).toEqual([]);
  });

  it('every exemption still exists, is still a writer, and carries a reason', () => {
    for (const e of EXEMPTIONS) {
      expect(existsSync(join(ROOT, e.file)), e.file).toBe(true);
      expect(found.map((m) => m.file), `${e.file} is stale`).toContain(e.file);
      expect(e.reason.length).toBeGreaterThan(40);
    }
  });
});

describe('the record-writer scan bites (self-test)', () => {
  it('a module that serializes a record and writes it is found', () => {
    const planted = [
      "import { serializeRecord } from './work-record.js';",
      'export async function quietFix(base, rec) {',
      "  rec.title = 'changed';",
      '  writeFileSync(join(base, recordPath(rec.id)), serializeRecord(rec));',
      '}',
    ].join('\n');
    expect(recordWriter(planted)).toMatchObject({ writes: [expect.stringContaining('writeFileSync(')] });
  });

  it('a module that writes under work/items by path segments is found', () => {
    const planted = "await atomicWrite(join(base, '.planning', 'work', 'items', '00', 'SIG-1.json'), text);";
    expect(recordWriter(planted)).not.toBeNull();
  });

  it('a module that writes under work/items by a path string is found', () => {
    expect(recordWriter("await rename(tmp, `.planning/work/items/00/${id}.json`);")).not.toBeNull();
  });

  it('naming a record without writing is a reader, not a writer', () => {
    expect(recordWriter('const p = recordPath(id);\nreturn readFileSync(p, "utf-8");')).toBeNull();
  });

  it('a record path quoted in a comment is not a marker', () => {
    expect(recordWriter("// writes .planning/work/items/NN/KEY-n.json\nwriteFileSync(other, 'x');")).toBeNull();
  });

  it('an exemption does not travel: the same text in another file is a violation', () => {
    const text = 'writeFileSync(join(base, recordPath(id)), serializeRecord(rec));';
    const hit = recordWriter(text);
    expect(violations([{ file: 'plugin/tools/lib/work-migrate-v2.js', hit }])).toEqual([]);
    expect(violations([{ file: 'plugin/tools/lib/sweep.js', hit }])).toHaveLength(1);
    expect(violations([{ file: 'plugin/hooks/check-state-write.js', hit }])).toHaveLength(1);
  });
});
