#!/usr/bin/env node

// tools/work-diff-v2.mjs — the differential read of the v1 → v2 work-store
// migration (M6.E13 t7.1b, AC8.1). Maintainer tooling, repo-root, not shipped.
//
// READ-ONLY on the repository. It builds three throwaway projects under a temp
// directory, each a copy of this repository's `.git` checked out at HEAD (so
// git-dependent reader paths see the same history, branches and origin refs in
// all three), and runs the same readers over each:
//
//   off  the copy with `.planning/work/WORK.md` removed: the store-off code
//        path, which parses the generated v1 views (BACKLOG.md, BUGS.md, …) —
//        what the lists said before the store existed, and what the v0.1.47
//        readers read from the generated views
//   v1   the copy as it is: the branch's store-on readers over the v1 item
//        files, through the converter (PLAN Decision 1)
//   v2   the copy with its `.planning/` replaced by the v2 project that
//        `migrateWorkStoreV2` builds aside (dry run: the 6 close requests are
//        still *closing*, as they are before `confirmCloses` runs at apply)
//
// Two comparisons: off → v2 (what a reader says now vs after the cutover) and
// v1 → v2 (the converter's read of the v1 files vs the migrated records — any
// difference there not explained by a rule below is a migration error).
// Every difference is classified by the first rule that matches it; a
// difference no rule explains is a MIGRATION ERROR, and any migration error
// makes the run exit 1.
//
//   node tools/work-diff-v2.mjs [--report FILE] [--keep]
//
// `--report` rewrites the generated part of FILE (between the diff markers),
// leaving the hand-written parts as they are. Default: print to stdout only.

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(REPO_ROOT, 'plugin', 'tools', 'lib');
const lib = (m) => import(pathToFileURL(path.join(LIB, m)).href);

export const CLASSES = Object.freeze({
  CORRECTION: 'expected correction',
  CONTRADICTION: 'known contradiction',
  ERROR: 'migration error',
});

// ── Building the three projects ─────────────────────────────────────────────

export async function buildProjects(repoRoot, workDir) {
  const { migrateWorkStoreV2 } = await lib('work-migrate-v2.js');
  const at = (n) => path.join(workDir, n);
  // A copy of `.git` checked out at HEAD: the same history, branches and
  // origin refs as the repository, and nothing written to the repository.
  cpSync(path.join(repoRoot, '.git'), path.join(at('v1'), '.git'), { recursive: true });
  execFileSync('git', ['reset', '-q', '--hard', 'HEAD'], { cwd: at('v1'), stdio: 'ignore' });
  cpSync(at('v1'), at('off'), { recursive: true });
  rmSync(path.join(at('off'), '.planning', 'work', 'WORK.md'));
  cpSync(at('v1'), at('v2'), { recursive: true });
  const { manifest } = await migrateWorkStoreV2(at('v2'), { outDir: at('built') });
  rmSync(path.join(at('v2'), '.planning'), { recursive: true });
  renameSync(path.join(at('built'), '.planning'), path.join(at('v2'), '.planning'));
  return { off: at('off'), v1: at('v1'), v2: at('v2'), manifest };
}

// ── Running the readers ─────────────────────────────────────────────────────

export async function runReaders(base) {
  const { readCorpus } = await lib('advise-corpus.js');
  const { gatherBigPicture } = await lib('advise-digest.js');
  const { prepareAdvise } = await lib('advise.js');
  const { proposeEpicCandidates, collectPreflight, resolveFloors } = await lib('drive.js');
  const { readOpenQuestions } = await lib('status.js');
  const sweep = await lib('sweep.js');
  const { checkDanglingReferences } = await lib('doc-hygiene.js');
  const facts = await lib('published-facts.js');
  const { runDriftChecks } = await lib('state-drift.js');
  const { backlogDischargeStatus } = await lib('backlog.js');
  const { listRecords, storeVersion } = await lib('work-records.js');
  const run = {
    corpus: () => readCorpus(base),
    digest: () => gatherBigPicture(base),
    prepare: () => prepareAdvise(base),
    candidates: () => proposeEpicCandidates(base),
    floors: () => resolveFloors('PLAN', base),
    preflight: () => collectPreflight(base, { epic: 'M6.E13' }),
    questions: () => readOpenQuestions(base),
    discharge: () => sweep.checkBacklogDischarge(base),
    staleInbox: () => sweep.checkStaleInbox(base),
    dangling: () => checkDanglingReferences(base),
    checkStore: () => sweep.checkWorkStore(base),
    tally: () => runDriftChecks(base, [facts.checkPublishedBugTally]),
    bugVsChangelog: () => runDriftChecks(base, [facts.checkBugStatusVsChangelog]),
    dischargeStatus: () => backlogDischargeStatus(base),
    records: () => (storeVersion(base) === null ? null : listRecords(base, { bodies: true })),
    views: () => readViews(base),
  };
  const out = {};
  for (const [k, f] of Object.entries(run)) {
    try {
      out[k] = await f();
    } catch (err) {
      out[k] = { threw: `${err.code ?? ''} ${err.message}`.trim() };
    }
  }
  return out;
}

const VIEW_FILES = {
  'BUGS.md': '.planning/BUGS.md',
  'BACKLOG.md': '.planning/BACKLOG.md',
  'ISSUES-INBOX.md': '.planning/ISSUES-INBOX.md',
  'OPEN-QUESTIONS.md': '.planning/OPEN-QUESTIONS.md',
  'EPICS.md': '.planning/work/EPICS.md',
};

function readViews(base) {
  const out = {};
  for (const [name, rel] of Object.entries(VIEW_FILES)) {
    const p = path.join(base, rel);
    out[name] = existsSync(p) ? readFileSync(p, 'utf-8') : null;
  }
  return out;
}

// ── IDs: B{n} (the v1 BUGS.md view's numbering) → SIG-n ─────────────────────

/**
 * A normaliser that rewrites every `B{n}` naming a record into its `SIG-n`:
 * a record's `legacy_id` of the form `B{n}`, and `B{n}` for a BUG record's own
 * number (`D-M6E11-20`, the v1 view's numbering). A `B{n}` naming no record is
 * left as it is.
 */
export function idNormalizer(records) {
  const map = new Map();
  for (const r of records) if (/^B\d+$/.test(r.record.legacy_id ?? '')) map.set(r.record.legacy_id, r.id);
  for (const r of records) {
    if (r.record.type !== 'BUG') continue;
    const own = `B${r.id.slice(r.id.lastIndexOf('-') + 1)}`;
    if (!map.has(own)) map.set(own, r.id);
  }
  const norm = (s) => String(s).replace(/\bB\d+\b/g, (b) => map.get(b) ?? b);
  norm.aliasesOf = (id) => [...map].filter(([, to]) => to === id).map(([b]) => b);
  return norm;
}

const SUFFIX_ID_RE = / · (SIG-\d+)\s*$/;
const firstId = (s) => /\b(SIG-\d+|B\d+)\b/.exec(s)?.[1] ?? null;

// ── Extractors: reader output → Map(key → value), comparable across projects ─
//
// Each returns entries for one reader. `ctx.norm` is `idNormalizer`.

function rowId(row) {
  return row.id ?? SUFFIX_ID_RE.exec(row.text ?? row.title ?? '')?.[1] ?? row.leadingId ?? null;
}
const rowTitle = (row) => row.text.replace(SUFFIX_ID_RE, '');

export const EXTRACTORS = {
  'advise corpus · backlog rows': (o) => {
    const rows = o.corpus?.sources?.backlog?.rows ?? [];
    return rows.map((r) => [rowId(r) ?? `title:${rowTitle(r)}`, `${rowTitle(r)} | discharged=${Boolean(r.discharged)}`]);
  },
  'advise corpus · bugs': (o, { norm }) =>
    (o.corpus?.sources?.bugs?.entries ?? []).map((b) => [norm(b.id), b.status]),
  'advise corpus · inbox count': (o) => {
    const work = o.corpus?.work;
    if (work) return [['inbox', String(work.inbox)]];
    const line = o.digest?.entries?.inbox?.[0]?.text ?? '';
    return [['inbox', /^(\d+)/.exec(line)?.[1] ?? line]];
  },
  'advise classify': (o) => {
    const c = o.prepare?.classified;
    if (!c) return [['threw', JSON.stringify(o.prepare)]];
    return [
      ...c.live.map((s) => [rowId(s.row) ?? rowTitle(s.row), 'live']),
      ...c.dropped.map((s) => [rowId(s.row) ?? rowTitle(s.row), `dropped: ${s.reason ?? s.why ?? ''}`]),
      ['(sources consulted)', c.consulted.join(', ')],
    ];
  },
  'advise digest': (o, { norm }) => {
    const e = o.digest?.entries;
    if (!e) return [['threw', JSON.stringify(o.digest)]];
    const out = [];
    for (const [section, list] of Object.entries(e)) {
      for (const it of list) {
        if (section === 'bugs') out.push([`bugs · ${norm(it.id ?? firstId(it.text))}`, it.priority ?? '']);
        else if (section === 'backlog') out.push([`backlog · ${it.id ?? SUFFIX_ID_RE.exec(it.text)?.[1] ?? it.text}`, 'listed']);
        else if (section === 'inbox') out.push(['inbox count', /^(\d+)/.exec(it.text)?.[1] ?? it.text]);
        else out.push([`${section} · ${it.text}`, 'listed']);
      }
    }
    for (const n of o.digest.notes ?? []) out.push([`note · ${n}`, 'present']);
    for (const c of o.digest.cannotCheck ?? []) out.push([`cannotCheck · ${JSON.stringify(c)}`, 'present']);
    return out;
  },
  'drive candidates': (o) => {
    const c = o.candidates?.candidates;
    if (!c) return [['threw', JSON.stringify(o.candidates)]];
    const key = (x) => (x.source?.startsWith('STATE.md') ? x.id : SUFFIX_ID_RE.exec(x.title ?? '')?.[1] ?? rowId(x));
    return [
      ...c.map((x) => [key(x), `rank ${x.rank ?? '-'}`]),
      ['(order, first 8)', c.slice(0, 8).map(key).join(', ')],
      ...(o.candidates.cannotCheck ?? []).map((x) => [`cannotCheck · ${JSON.stringify(x)}`, 'present']),
    ];
  },
  'drive PLAN floors': (o) => [
    ...(o.floors?.live ?? []).map((f) => [f.id, 'live']),
    ...(o.floors?.dormant ?? []).map((f) => [f.id, 'dormant']),
    ...(o.floors?.cannotCheck ?? []).map((f) => [`cannotCheck · ${JSON.stringify(f)}`, 'present']),
  ],
  'drive preflight': (o) => [
    ...(o.preflight?.blocking ?? []).map((b) => [`blocking · ${b.detail ?? JSON.stringify(b)}`, 'present']),
    ...(o.preflight?.cannotCheck ?? []).map((b) => [`cannotCheck · ${JSON.stringify(b)}`, 'present']),
    ...(o.preflight?.checked ?? []).map((c, i) => [`checked #${i + 1}`, c]),
  ],
  'status open questions': (o) => [
    ['count', String(o.questions?.count)],
    ...(o.questions?.top ?? []).map((t, i) => [`top #${i + 1}`, t]),
  ],
  'sweep findings': (o, { norm }) => {
    const out = [];
    for (const k of ['discharge', 'staleInbox', 'dangling', 'checkStore']) {
      const list = Array.isArray(o[k]) ? o[k] : [{ check: k, message: JSON.stringify(o[k]) }];
      for (const f of list) {
        const cited = /^(\S+) is cited/.exec(f.message)?.[1];
        const n = /(\d+) undrained/.exec(f.message)?.[1];
        const what = cited ? norm(cited) : n ? 'count' : firstId(f.message) ? norm(firstId(f.message)) : f.message;
        out.push([`${f.check} · ${what}`, n ?? f.severity ?? 'present']);
      }
    }
    return out;
  },
  'published facts': (o, { norm }) => {
    const out = [];
    for (const k of ['tally', 'bugVsChangelog']) {
      for (const r of o[k]?.results ?? [{ id: k, status: JSON.stringify(o[k]) }]) {
        out.push([`${r.id} · status`, r.status]);
        for (const f of r.findings ?? []) out.push([`${r.id} · ${norm(firstId(f.message) ?? f.message)}`, 'flagged']);
      }
    }
    return out;
  },
  'backlog discharge status': (o) => {
    const d = o.dischargeStatus ?? {};
    return [
      ['outcome', String(d.outcome)],
      ['rows', String(d.rows)],
      ['liveRows', String(d.liveRows)],
      ['resolvable', String(d.resolvable)],
      ...(d.stale ?? []).map((s) => [`stale · ${s.id ?? JSON.stringify(s)}`, 'present']),
      ...(d.blind ?? []).map((s) => [`blind · ${JSON.stringify(s)}`, 'present']),
    ];
  },
};

// Key order inside an event is the serialiser's job (Decision 8), not data.
const sortedKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// The store itself, record by record (v1 → v2 only: off has no records).
export function recordEntries(o) {
  const l = o.records;
  if (!l || l.threw) return [['(store)', JSON.stringify(l)]];
  const out = l.broken.map((b) => [`broken · ${b.id ?? b.path}`, b.error]);
  for (const r of l.records) {
    const { events, ...fields } = r.record;
    out.push([`${r.id} · fields`, JSON.stringify(fields)]);
    out.push([`${r.id} · status`, `${r.status}${r.epic ? ` in ${r.epic}` : ''}`]);
    out.push([`${r.id} · events`, JSON.stringify(events.map(sortedKeys))]);
    out.push([`${r.id} · body`, r.body ?? '']);
  }
  return out;
}

// The five views, item by item: where each item is listed and in what state.
export function viewEntries(o, { norm }) {
  const out = [];
  const v = o.views ?? {};
  for (const [name, text] of Object.entries(v)) {
    if (text === null) continue;
    for (const [id, state] of parseView(name, text)) out.push([`${name} · ${norm(id)}`, norm(state)]);
  }
  return out;
}

// Each view's items as [id, state]. Tool-side reading of generated Markdown,
// for this comparison only; no Signal reader uses it.
export function parseView(name, text) {
  const lines = text.split('\n');
  const out = [];
  if (name === 'BUGS.md') {
    for (const l of lines) {
      const m = /^\| (B\d+|SIG-\d+) \| (`[a-z-]+`)[^|]*\| ([^|]*) \| (.*?)\s*\|?$/.exec(l);
      if (m) {
        out.push([`${m[1]} · status`, `${m[2]} ${m[3].trim()}`]);
        out.push([`${m[1]} · summary`, m[4]]);
      }
    }
    return out;
  }
  if (name === 'EPICS.md') {
    for (const l of lines) {
      const m = /^- (SIG-\d+)(?:-([A-Z]+)-([A-Z]+)| · ([A-Z]+) · ([A-Za-z]+))/.exec(l);
      if (m) out.push([m[1], `${m[2] ?? m[4]} ${m[3] ?? m[5]}`]);
    }
    return out;
  }
  // Heading-per-item views: the item's ID is on the heading (` · SIG-n`), on an
  // `**Item:** SIG-n` line, or on the inbox status line (`· SIG-n`).
  const level = name === 'BACKLOG.md' ? '### ' : '## ';
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith(level)) continue;
    const heading = lines[i].slice(level.length);
    let id = /· (SIG-\d+)(?: ·|$)/.exec(heading)?.[1] ?? null;
    for (let j = i + 1; id === null && j < Math.min(lines.length, i + 4); j++) {
      id = /^\*\*Item:\*\* (SIG-\d+)/.exec(lines[j])?.[1] ?? /^\*\*Status:\*\*.*· (SIG-\d+)\s*$/.exec(lines[j])?.[1] ?? null;
    }
    if (id === null) continue; // the inbox's standing watchlist heading
    const state = / · (closing|closed \([a-z]+\))\s*$/.exec(heading)?.[1] ?? 'open';
    out.push([id, state]);
  }
  return out;
}

// ── Diffing and classifying ─────────────────────────────────────────────────

/**
 * The differences between two entry lists, by key: `only-left`, `only-right`,
 * `changed`. A key repeated in one list keeps its last value.
 */
export function diffEntries(left, right) {
  const a = new Map(left.map(([k, v]) => [String(k), String(v)]));
  const b = new Map(right.map(([k, v]) => [String(k), String(v)]));
  const out = [];
  for (const [k, v] of a) {
    if (!b.has(k)) out.push({ key: k, kind: 'only-left', left: v, right: null });
    else if (b.get(k) !== v) out.push({ key: k, kind: 'changed', left: v, right: b.get(k) });
  }
  for (const [k, v] of b) if (!a.has(k)) out.push({ key: k, kind: 'only-right', left: null, right: v });
  return out;
}

/**
 * Classify each difference by the first rule whose `when` holds. A rule is
 * `{comparison?, reader, when(d, ctx), class, reason}`; `comparison` is
 * `off` or `v1` (both when absent). A difference no rule explains is a
 * migration error.
 */
export function classify(diffs, rules, ctx) {
  return diffs.map((d) => {
    const rule = rules.find((r) => r.reader === d.reader && (!r.comparison || r.comparison === d.comparison) && r.when(d, ctx));
    return rule
      ? { ...d, class: rule.class, reason: rule.reason, rule: rule.name }
      : { ...d, class: CLASSES.ERROR, reason: 'no rule explains this difference', rule: null };
  });
}

// ── The rules ───────────────────────────────────────────────────────────────

const C = CLASSES;
const idOf = (d) => /\b(SIG-\d+)\b/.exec(d.key)?.[1] ?? null;
const rec = (ctx, d) => ctx.v2ById.get(idOf(d));
const recStatus = (ctx, d) => rec(ctx, d)?.status;
const isRecentClose = (ctx, d) => ['C', 'closing'].includes(recStatus(ctx, d));
const CLOSING = (ctx) => new Set(ctx.manifest.closes.requested);

export const RULES = [
  // ── advise ──
  { name: 'corpus-closed-bug', reader: 'advise corpus · bugs', comparison: 'off',
    when: (d, ctx) => d.kind === 'only-left' && ['C', 'closing'].includes(recStatus(ctx, d)),
    class: C.CORRECTION, reason: 'store-on, the corpus reads only open bug records; a closed bug was read and dropped before, never an advise input' },
  { name: 'inbox-count-heading', reader: 'advise corpus · inbox count', comparison: 'off',
    when: (d) => d.kind === 'changed' && Number(d.left) === Number(d.right) + 1,
    class: C.CORRECTION, reason: 'the store-off digest counts every ISSUES-INBOX.md heading, the standing watchlist included (SIG-271, filed); records count the 6 N items' },
  { name: 'digest-inbox-count-heading', reader: 'advise digest', comparison: 'off',
    when: (d) => d.key === 'inbox count' && Number(d.left) === Number(d.right) + 1,
    class: C.CORRECTION, reason: 'as above: the digest\'s inbox line counted the watchlist heading (SIG-271)' },
  { name: 'classify-consulted', reader: 'advise classify', comparison: 'off',
    when: (d) => d.key === '(sources consulted)',
    class: C.CORRECTION, reason: 'store-on, discharge reads the records, not BUGS.md or STATE/closure (t4.2a): the list names what was read' },
  // ── drive ──
  { name: 'rank-constant-id-bonus', reader: 'drive candidates', comparison: 'off',
    when: (d) => d.kind === 'changed',
    class: C.CONTRADICTION, reason: 'rankBacklogRow\'s +5 "explicit unit id" bonus now applies to EVERY record (t4.3: leadingId is the record ID), and the view\'s " · SIG-n" suffix no longer adds +2; rows titled by an Epic (M5.E20/E12/E14) fall from #2-4 — see recommendation R5' },
  { name: 'preflight-label', reader: 'drive preflight', comparison: 'off',
    when: (d) => d.kind === 'changed' && d.left === 'OPEN-QUESTIONS.md' && d.right === 'open questions (work store)',
    class: C.CORRECTION, reason: 'store-on, the label names what was read: the records, not OPEN-QUESTIONS.md (t4.3)' },
  // ── sweep ──
  { name: 'dangling-item-ids', reader: 'sweep findings', comparison: 'off',
    when: (d) => d.kind === 'only-right' && /^dangling-reference · SIG-(300|412|1000)$/.test(d.key),
    class: C.CONTRADICTION, reason: 'illustrative IDs in DECISIONS.md (quoted again in M6.E13-PROGRESS.md), visible because store-on item IDs are checked (t4.4) — carry item 3' },
  { name: 'dangling-in-view-body', reader: 'sweep findings',
    when: (d, ctx) => d.kind === 'only-right' && ctx.viewOnlyCites.has(d.key.replace(/^dangling-reference · /, '')),
    class: C.CONTRADICTION, reason: 'a dangling citation inside a closed item\'s body: the v2 BACKLOG.md prints recent closes (AC6.2) and the v1 view did not, so the sweep now reads it; the citation predates the migration' },
  { name: 'discharge-no-unit-id-advisory', reader: 'sweep findings', comparison: 'off',
    when: (d) => d.kind === 'only-left' && /^backlog-discharge · no backlog row leads with a unit or bug id/.test(d.key),
    class: C.CORRECTION, reason: 'store-off, a row links to a closure only through an ID in its title; store-on every item\'s Epic comes from its events, so no row is unlinkable' },
  // ── published facts ──
  { name: 'changelog-names-sig-id', reader: 'published facts', comparison: 'off',
    when: (d, ctx) => d.key.startsWith('bug-status-vs-changelog · ')
      && (d.kind === 'only-right' ? ctx.changelogSigOnly.has(idOf(d)) : d.left === 'clean' && d.right === 'findings' && ctx.changelogSigOnly.size > 0),
    class: C.CORRECTION, reason: 'a released CHANGELOG headline names the bug as SIG-n only: the record reading matches it, the BUGS.md reading matched only the view\'s B{n}' },
  // ── backlog discharge status ──
  { name: 'discharge-outcome-linkable', reader: 'backlog discharge status', comparison: 'off',
    when: (d) => d.key === 'outcome' && d.left === 'cannot-evaluate' && d.right === 'clean',
    class: C.CORRECTION, reason: 'store-off, no row led with an ID, so nothing could be linked to a closure; store-on every item\'s Epic is read from its events' },
  { name: 'discharge-rows-all-live', reader: 'backlog discharge status', comparison: 'off',
    when: (d) => ['rows', 'liveRows'].includes(d.key) && d.kind === 'changed',
    class: C.CORRECTION, reason: 'store-on, discharge status is over every live record (T/Q/P, bugs and questions included), not the BACKLOG.md view\'s rows (t4.5a, one discharge definition)' },
  { name: 'discharge-resolvable', reader: 'backlog discharge status', comparison: 'off',
    when: (d) => d.key === 'resolvable' && d.kind === 'changed',
    class: C.CORRECTION, reason: 'store-on, an item\'s Epic is its events\' (epicOf), never an ID read out of a title; no live record is queued in an Epic today' },
  // ── records (v1 converter → v2) ──
  { name: 'created-from-first-commit', reader: 'records', comparison: 'v1',
    when: (d) => d.kind === 'changed' && / · events$/.test(d.key) && onlySynthesizedAtDiffers(d.left, d.right),
    class: C.CORRECTION, reason: 'no v1 created record: the migration dates created by the file\'s first commit (2026-09-29, t1.5) when that is earliest; the v1 read path asks git only when no date at all is known, so it took the close date' },
  // ── views ──
  { name: 'view-recent-close', reader: 'views',
    when: (d, ctx) => d.kind === 'only-right' && /^(BACKLOG|OPEN-QUESTIONS)\.md · /.test(d.key) && isRecentClose(ctx, d),
    class: C.CORRECTION, reason: 'v2 lists closes from the 30 days before the newest event, and closing items (AC6.2); the v1 list showed open items only' },
  { name: 'view-close-reason', reader: 'views',
    when: (d) => / · status$/.test(d.key) && /^`dismissed`/.test(d.left) && /^`(rejected|dup|wontdo|stale)`/.test(d.right),
    class: C.CORRECTION, reason: 'the v2 BUGS.md status cell prints the close reason; the v1 view printed every non-fixed close as `dismissed`' },
  { name: 'view-closing-dry-run', reader: 'views',
    when: (d, ctx) => / · status$/.test(d.key) && /^`fixed`/.test(d.left) && /^`closing`/.test(d.right) && CLOSING(ctx).has(idOf(d)),
    class: C.CORRECTION, reason: 'one of the 6 close requests (Decision 11): closing until confirmCloses runs at apply, then fixed again — the probe confirms all 6' },
  { name: 'view-pipe-escaped', reader: 'views',
    when: (d) => / · summary$/.test(d.key) && unescapePipes(d.left) === unescapePipes(d.right),
    class: C.CORRECTION, reason: 'v2 escapes "|" inside a table cell; the v1 view printed it raw, which splits the row when rendered' },
  { name: 'view-summary-title-only', reader: 'views',
    when: (d) => / · summary$/.test(d.key) && d.kind === 'changed' && /…\*\*$/.test(d.right) && d.left.length > d.right.length,
    class: C.CONTRADICTION, reason: 'carry item 1: the body has more than one paragraph, so v2 shows the (truncated) bold title where the v1 view showed the whole migrated row — see R1' },
  { name: 'view-summary-body-paragraph', reader: 'views',
    when: (d) => / · summary$/.test(d.key) && d.kind === 'changed' && /^\*\*[^*]+\*\*$/.test(d.left) && !d.right.startsWith('**'),
    class: C.CONTRADICTION, reason: 'carry item 1, the other direction: a one-paragraph body is the v2 summary, where the v1 view showed the bold title — see R1' },
];

const unescapePipes = (s) => String(s).replace(/\\\|/g, '|');

// Two event lists that differ only in the `at` of events the migration
// synthesized (`by: migration (v2)`) — a created date and the triage/queue
// events that take the previous event's date.
function onlySynthesizedAtDiffers(left, right) {
  const a = JSON.parse(left);
  const b = JSON.parse(right);
  if (a.length !== b.length) return false;
  return a.every((e, i) => {
    if (JSON.stringify(e) === JSON.stringify(b[i])) return true;
    if (e.by !== 'migration (v2)' || b[i].by !== 'migration (v2)') return false;
    return JSON.stringify({ ...e, at: null }) === JSON.stringify({ ...b[i], at: null });
  });
}

// ── Running it ──────────────────────────────────────────────────────────────

export function compare(outputs, ctx) {
  const diffs = [];
  for (const comparison of ['off', 'v1']) {
    const left = outputs[comparison];
    const right = outputs.v2;
    const push = (reader, l, r) => {
      for (const d of diffEntries(l, r)) diffs.push({ comparison, reader, ...d });
    };
    for (const [reader, ex] of Object.entries(EXTRACTORS)) push(reader, ex(left, ctx), ex(right, ctx));
    if (comparison === 'v1') push('records', recordEntries(left), recordEntries(right));
    push('views', viewEntries(left, ctx), viewEntries(right, ctx));
  }
  return classify(diffs, ctx.rules ?? RULES, ctx);
}

export function summarize(classified) {
  const by = {};
  for (const d of classified) {
    by[d.comparison] ??= { [C.CORRECTION]: 0, [C.CONTRADICTION]: 0, [C.ERROR]: 0 };
    by[d.comparison][d.class] += 1;
  }
  return by;
}

// The item a difference is about: its SIG-n when the key names one, else the key's last part.
const itemOf = (d) => /\b(SIG-\d+)\b/.exec(d.key)?.[1] ?? d.key.split(' · ').at(-1);
const cell = (s) => (s === null || s === undefined ? '—' : String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 90));

export function renderTables(classified, { manifest }) {
  const s = summarize(classified);
  const lines = [];
  lines.push('| Comparison | Expected correction | Known contradiction | Migration error |', '|---|---|---|---|');
  for (const [cmp, label] of [['off', 'store-off (views) → v2'], ['v1', 'v1 (converter) → v2']]) {
    const x = s[cmp] ?? { [C.CORRECTION]: 0, [C.CONTRADICTION]: 0, [C.ERROR]: 0 };
    lines.push(`| ${label} | ${x[C.CORRECTION]} | ${x[C.CONTRADICTION]} | **${x[C.ERROR]}** |`);
  }
  lines.push('');
  // Group identical (comparison, reader, rule) rows, so a rule that explains 40
  // items is one row with a count and its keys, not 40 rows.
  const groups = new Map();
  for (const d of classified) {
    const k = `${d.comparison}\u0000${d.reader}\u0000${d.rule ?? `error:${d.key}`}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(d);
  }
  lines.push('| # | Comparison | Reader | Class | Count | Items (first 12) | Example (left → right) | Reason |', '|---|---|---|---|---|---|---|---|');
  let n = 0;
  for (const list of groups.values()) {
    const d = list[0];
    const keys = list.map(itemOf).slice(0, 12).join(', ') + (list.length > 12 ? ', …' : '');
    lines.push(`| ${++n} | ${d.comparison} → v2 | ${d.reader} | ${d.class} | ${list.length} | ${cell(keys)} | ${cell(d.left)} → ${cell(d.right)} | ${cell(d.reason)} |`);
  }
  lines.push('', `Manifest: ${manifest.summary.v1Files} v1 files → ${manifest.summary.records} records, `
    + `${manifest.verification.errors.length} verification errors; close requests ${manifest.closes.requested.join(', ')}.`);
  return lines.join('\n');
}

const BEGIN = '<!-- diff:begin (generated by tools/work-diff-v2.mjs — edit outside the markers) -->';
const END = '<!-- diff:end -->';

export function spliceReport(existing, generated) {
  const block = `${BEGIN}\n${generated}\n${END}`;
  if (existing === null) return `${block}\n`;
  const a = existing.indexOf(BEGIN);
  const b = existing.indexOf(END);
  if (a === -1 || b === -1) return `${existing.trimEnd()}\n\n${block}\n`;
  return `${existing.slice(0, a)}${block}${existing.slice(b + END.length)}`;
}

export async function differentialRead(repoRoot = REPO_ROOT, { workDir, rules } = {}) {
  const dir = workDir ?? mkdtempSync(path.join(os.tmpdir(), 'signal-work-diff-'));
  const projects = await buildProjects(repoRoot, dir);
  const outputs = {};
  for (const p of ['off', 'v1', 'v2']) outputs[p] = await runReaders(projects[p]);
  const v2Records = outputs.v2.records?.records ?? [];
  const norm = idNormalizer(v2Records);
  const v1Cites = new Set([...(outputs.v1.views['BACKLOG.md'] ?? '').matchAll(/\b[A-Z][\w.-]*-\d+\b/g)].map((m) => m[0]));
  const v2Cites = new Set([...(outputs.v2.views['BACKLOG.md'] ?? '').matchAll(/\b[A-Z][\w.-]*-\d+\b/g)].map((m) => m[0]));
  const changelog = existsSync(path.join(repoRoot, 'CHANGELOG.md')) ? readFileSync(path.join(repoRoot, 'CHANGELOG.md'), 'utf-8') : '';
  // Bugs a CHANGELOG names as SIG-n and never as their B{n} alias.
  const changelogSigOnly = new Set(v2Records
    .filter((r) => new RegExp(`\\b${r.id}\\b`).test(changelog)
      && !norm.aliasesOf(r.id).some((b) => new RegExp(`\\b${b}\\b`).test(changelog)))
    .map((r) => r.id));
  const ctx = {
    norm,
    changelogSigOnly,
    manifest: projects.manifest,
    v2ById: new Map(v2Records.map((r) => [r.id, r])),
    viewOnlyCites: new Set([...v2Cites].filter((c) => !v1Cites.has(c))),
    rules,
  };
  const classified = compare(outputs, ctx);
  return { dir, projects, outputs, ctx, classified, summary: summarize(classified) };
}

async function main() {
  const args = process.argv.slice(2);
  let report = null;
  let keep = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report') report = args[++i];
    else if (args[i] === '--keep') keep = true;
    else {
      console.error('usage: node tools/work-diff-v2.mjs [--report FILE] [--keep]');
      process.exit(2);
    }
  }
  const res = await differentialRead();
  const tables = renderTables(res.classified, res.ctx);
  if (report) {
    const p = path.resolve(report);
    writeFileSync(p, spliceReport(existsSync(p) ? readFileSync(p, 'utf-8') : null, tables));
  }
  console.log(tables);
  for (const d of res.classified.filter((x) => x.class === CLASSES.ERROR)) {
    console.log(`✗ ${d.comparison} → v2 · ${d.reader} · ${d.key}: ${cell(d.left)} → ${cell(d.right)}`);
  }
  if (keep) console.log(`projects kept in ${res.dir}`);
  else rmSync(res.dir, { recursive: true, force: true });
  process.exit(res.classified.some((d) => d.class === CLASSES.ERROR) ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
