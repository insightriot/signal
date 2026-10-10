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
//     an `'items'` path segment, or (REVIEW pass 2) reaches records through
//     `walkFiles(`, `listRecords(` or `getRecord(` — and
//   - calls a file-write primitive (`writeFile`, `writeSync`, `atomicWrite`,
//     `rename`, `copyFile`, `cpSync`, `appendFile`, `createWriteStream`, their
//     Sync forms, under any name an import or destructuring gives them, or an
//     `open(…, 'w'|'a'|'r+')`).
// Only `work-records.js` may be one, plus the reviewed exemptions below. An
// exemption is not a file pass: it lists every write line it was reviewed for
// (a new one is a violation), may name ONE function whose writes are the
// exempt ones (the migration's build), and may pin a line the review relied on
// (`requires`). Planted violations prove the scan bites.
//
// The residue, stated: a module that builds a record path with no marker above
// (say, a template string assembled from parts) and writes it some way not
// listed (a child process) is invisible here. This catches the plain way to do
// it, which is the way it would be done.

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
  /\bwalkFiles\(/,
  /\blistRecords\(/,
  /\bgetRecord\(/,
];
const PRIMITIVES = ['writeFile', 'writeFileSync', 'writeSync', 'atomicWrite', 'appendFile', 'appendFileSync', 'rename',
  'renameSync', 'copyFile', 'copyFileSync', 'cpSync', 'cp', 'createWriteStream'];
const OPEN_FOR_WRITE = /\bopen(?:Sync)?\(.*(['"`])(?:w|a|r\+)[x+]*\1/;

// The write primitives under every local name `text` gives them: an
// `import { writeFileSync as put }` or a `const { rename: mv } = fs` counts.
function writePrimitive(text) {
  const alias = (re) => [...text.matchAll(re)].filter((m) => PRIMITIVES.includes(m[1])).map((m) => m[2]);
  const names = [...PRIMITIVES, ...alias(/\b(\w+)\s+as\s+(\w+)/g), ...alias(/\b(\w+)\s*:\s*(\w+)\s*[,}]/g)];
  return new RegExp(`\\b(?:${names.join('|')})\\(|${OPEN_FOR_WRITE.source}`);
}

// Reviewed exemptions. `writes`: every write line outside `fn`, one entry per
// line (a substring of it); `fn`: the one function whose writes are exempt
// whole; `requires`: a code line the review relied on, which must still be there.
const EXEMPTIONS = [
  {
    file: 'plugin/tools/lib/work-migrate-v2.js',
    fn: 'buildInto',
    writes: [
      "cpSync(join(baseDir, '.planning'), join(outDir, '.planning')",
      "atomicWrite(join(outDir, 'manifest.json'), text)",
      'atomicWrite(join(baseDir, RELOCATED_V1_MANIFEST_REL), text)',
    ],
    reason: '`buildInto` is the v1 → v2 build: there is no store for work-records.js to write through yet, and each '
      + 'record is born with its full converted event log (AC8.3). Outside it: the aside copy and the manifest only',
  },
  {
    file: 'plugin/tools/lib/advise.js',
    writes: ['atomicWrite(path, content)'],
    reason: 'reads records for the advisory; its one write is `writeArtifact`, the dated advisory file',
  },
  {
    file: 'plugin/tools/lib/backlog.js',
    writes: [
      'atomicWrite(path, backlogSkeleton(date, snapshot))',
      'atomicWrite(path, bumped)',
      "atomicWrite(path, crlf ? bumped.replace(/\\n/g, '\\r\\n') : bumped)",
      'atomicWrite(path, next)',
    ],
    reason: 'reads records for discharge and promote on a store-on project; its writes are the store-off BACKLOG.md '
      + 'and BUGS.md (createBacklogIfMissing, promoteToBacklog, dischargeBacklogRows, promoteToBugs)',
  },
  {
    file: 'plugin/tools/lib/drive.js',
    writes: ['atomicWrite(path, next)'],
    reason: 'reads records for its candidates; its one write is the decision queue (DECISION-QUEUE.md)',
  },
  {
    file: 'plugin/tools/lib/work-ops.js',
    writes: [
      'renameSync(join(baseDir, fromRel), join(baseDir, toRel))',
      'atomicWrite(abs, next, { renameFn: opts.renameFn })',
      'atomicWrite(abs, next, { renameFn: opts.renameFn })',
      'atomicWrite(readmeDest, stringifyFrontmatter(data, readmeBody)',
      'atomicWrite(w.abs, w.text)',
    ],
    requires: ["if (!abs.endsWith('.md') || abs.startsWith(archiveRoot)) continue;"],
    reason: 'the Epic-folder archive: moves the folder\'s files and rewrites links in the live `.md` files walkFiles '
      + 'finds. The `.md` filter is pinned — widened to `.json`, the walk would rewrite records with no event',
  },
  {
    file: 'plugin/tools/lib/work-migrate-lists.js',
    fn: 'buildAside',
    writes: [
      'renameSync(join(baseDir, x.to), join(baseDir, x.from))',
      'renameSync(join(baseDir, x.from), join(baseDir, x.to))',
      'renameSync(join(aside, WORK_MD_REL), join(baseDir, WORK_MD_REL))',
      'renameSync(join(aside, ITEMS_REL), join(baseDir, ITEMS_REL))',
      'renameSync(join(aside, rel), join(baseDir, rel))',
      'atomicWrite(join(baseDir, MANIFEST_REL)',
      'writeFileSync(join(baseDir, INDEX_REL), done.index)',
    ],
    reason: '`/sig:docs-migrate --work-store` (M6.E15 S4) is a migration INTO an empty store: every record is born from a '
      + 'hand-kept list with its full planned event log (created, and triaged or a legacy close), validated by '
      + '`validateRecord`/`checkEvents` before any write — there is no store yet for work-records.js to write through. '
      + '`buildAside` writes records only into a fresh build folder; outside it the project sees renames (lists to the '
      + 'archive, the built store and views in, and the restore that moves an archive copy back), the MANIFEST.json, '
      + 'and the restore that puts INDEX.md\'s own bytes back after a failure (t4.8; INDEX.md is not a record)',
  },
  {
    file: 'plugin/tools/lib/work-views.js',
    writes: ['atomicWrite(abs, views[rel], { generated: true })'],
    reason: 'regenerates the views from the records it reads; it writes views, never a record',
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
  const write = writePrimitive(text);
  const markers = RECORD_MARKERS.filter((re) => lines.some((l) => re.test(l))).map(String);
  const writes = lines.filter((l) => write.test(l)).map((l) => l.trim());
  return markers.length && writes.length ? { markers, writes } : null;
}

// The write lines of `text` outside top-level function `fn` (all of them when
// `fn` is not given or not found), comments skipped.
function writesOutside(text, fn) {
  const lines = text.split('\n');
  const from = fn ? lines.findIndex((l) => new RegExp(`^(export )?(async )?function ${fn}\\(`).test(l)) : -1;
  const to = from === -1 ? -1 : lines.findIndex((l, i) => i > from && l === '}');
  const write = writePrimitive(text);
  return lines.filter((l, i) => (from === -1 || i < from || i > to) && codeLines(l).length && write.test(l)).map((l) => l.trim());
}

/** Why an exempt module's text no longer matches its review, or null. */
function exemptionBroken(e, text) {
  const writes = writesOutside(text, e.fn);
  const extra = writes.filter((w) => !e.writes.some((a) => w.includes(a)));
  if (extra.length > 0 || writes.length !== e.writes.length) return `writes outside its review: ${extra[0] ?? `${writes.length} write lines, reviewed ${e.writes.length}`}`;
  const gone = (e.requires ?? []).find((r) => !text.includes(r));
  return gone ? `no longer has the line its review relied on: ${gone}` : null;
}

/** The record writers in `found` (`{file, hit, text}`) that are neither the owner nor exempt, as messages. */
function violations(found) {
  return found.filter((m) => m.file !== OWNER).flatMap((m) => {
    const e = EXEMPTIONS.find((x) => x.file === m.file);
    const why = e ? exemptionBroken(e, m.text) : `names ${m.hit.markers.join(', ')} and writes: ${m.hit.writes[0]}`;
    return why ? [`${m.file}: ${why}`] : [];
  });
}

function modules() {
  return DIRS.flatMap((d) => readdirSync(join(ROOT, d))
    .filter((n) => n.endsWith('.js') || n.endsWith('.mjs'))
    .map((n) => `${d}/${n}`));
}

describe('no module but work-records.js writes record files (AC2.2, REVIEW I5)', () => {
  const found = modules()
    .map((file) => {
      const text = readFileSync(join(ROOT, file), 'utf-8');
      return { file, text, hit: recordWriter(text) };
    })
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
      const text = readFileSync(join(ROOT, e.file), 'utf-8');
      for (const w of e.writes) expect(writesOutside(text, e.fn).some((l) => l.includes(w)), `${e.file}: ${w}`).toBe(true);
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
    const text = readFileSync(join(ROOT, 'plugin/tools/lib/work-migrate-v2.js'), 'utf-8');
    const hit = recordWriter(text);
    expect(violations([{ file: 'plugin/tools/lib/work-migrate-v2.js', hit, text }])).toEqual([]);
    expect(violations([{ file: 'plugin/tools/lib/sweep.js', hit, text }])).toHaveLength(1);
    expect(violations([{ file: 'plugin/hooks/check-state-write.js', hit, text }])).toHaveLength(1);
  });

  // REVIEW pass 2: the forms the first scan could not see.
  it('a record reached through listRecords/getRecord/walkFiles, then written, is found', () => {
    for (const reach of ['listRecords(base)', 'getRecord(base, id)', 'walkFiles(planning)']) {
      expect(recordWriter(`const r = ${reach};\nawait atomicWrite(p, text);`), reach).not.toBeNull();
    }
  });

  it('a renamed fs import, a destructured alias, writeSync and open(…, "w") are writes', () => {
    const marker = 'const p = recordPath(id);\n';
    for (const w of [
      "import { writeFileSync as put } from 'node:fs';\nput(p, text);",
      'const { rename: mv } = fs;\nmv(tmp, p);',
      "const fd = openSync(p, 'w');\nwriteSync(fd, text);",
      "const h = await open(p, 'w');",
      "const h = await fs.open(p, 'r+');",
    ]) expect(recordWriter(marker + w), w).not.toBeNull();
  });

  it('a write added to the migration outside its build is a violation', () => {
    const real = readFileSync(join(ROOT, 'plugin/tools/lib/work-migrate-v2.js'), 'utf-8');
    const text = `${real}\nexport function quietFix(base, rec) {\n  writeFileSync(join(base, recordPath(rec.id)), serializeRecord(rec));\n}\n`;
    const file = 'plugin/tools/lib/work-migrate-v2.js';
    expect(violations([{ file, text: real, hit: recordWriter(real) }])).toEqual([]);
    expect(violations([{ file, text, hit: recordWriter(text) }])).toHaveLength(1);
  });

  it('work-ops.js: widening its link walk from `.md` to `.json` is a violation', () => {
    const real = readFileSync(join(ROOT, 'plugin/tools/lib/work-ops.js'), 'utf-8');
    const pinned = "if (!abs.endsWith('.md') || abs.startsWith(archiveRoot)) continue;";
    expect(real).toContain(pinned);
    const widened = real.replace(pinned, "if (!/\\.(md|json)$/.test(abs) || abs.startsWith(archiveRoot)) continue;");
    const file = 'plugin/tools/lib/work-ops.js';
    expect(violations([{ file, text: real, hit: recordWriter(real) }])).toEqual([]);
    expect(violations([{ file, text: widened, hit: recordWriter(widened) }])).toEqual([
      expect.stringMatching(/no longer has the line its review relied on/),
    ]);
  });
});
