// M6.E5 FR1.1 / FR1.2 — what the flow prescribes, derived from the payload,
// then classified before anything may be proposed.
//
// WHY BOTH HALVES. Measured at DISCUSS (2026-08-26): the prompt layer prescribes
// 49 distinct binary+subcommand pairs across 130 occurrences, and that set
// contains `rm` — five times, because `commands/doctor.md` DESCRIBES `rm -rf` on
// orphan cache directories. It also contains `git reset`, `git rebase` and
// `pip install`, plus `pytest`/`cargo`/`go` that are only there because command
// files describe OTHER PEOPLE'S stacks.
//
//   A generator that emitted its own scan would propose `Bash(rm *)`.
//
// So derivation supplies CANDIDATES and a committed table decides verdicts.
// The reverse — a hand-written table with no derivation behind it — is
// `light`-vs-`strict`, the remedy `B75` measured the ceiling on: two settings
// that expanded to identical config except one boolean. A table nothing checks
// drifts the moment a command file adds a tool. `unclassifiedBinaries` is what
// makes the pairing load-bearing: it reads the LIVE scan, so a new binary fails
// the suite until someone classifies it.
//
// PROVENANCE IS AN INPUT, NOT DECORATION (probe 2, S1.t0, 2026-08-27). Eleven
// binaries are reachable ONLY outside `plugin/commands` — cp, eslint, go, grep,
// npx, pip, pnpm, prettier, pytest, vitest, yarn — and `plugin/agents` is where
// every language-ecosystem tool enters. Those are exactly the ones most likely
// to be descriptions rather than prescriptions, so each entry carries the
// directory it came from and the classifier can weigh it.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Which layer a prescription was read from. */
export const LAYER = Object.freeze({
  /** An `execFileSync`-style call site: the binary is in the source. */
  DETERMINISTIC: 'deterministic',
  /** A backticked string in markdown: prose, which may describe rather than prescribe. */
  PROMPT: 'prompt',
});

/** Whether the scan could look at all (`B39`: "found nothing" ≠ "could not look"). */
export const SCAN_STATUS = Object.freeze({
  OK: 'ok',
  CANNOT_CHECK: 'cannot-check',
});

/** What may be done with a candidate. */
export const VERDICT = Object.freeze({
  /** Safe to offer in a proposed `allow` list. */
  PROPOSE_ALLOW: 'propose-allow',
  /** Offer in the proposed `deny` list. */
  PROPOSE_DENY: 'propose-deny',
  /** Never put in either list — Signal has no business having an opinion. */
  NEVER_PROPOSE: 'never-propose',
});

/** Markdown directories read as the prompt layer. */
export const PROMPT_DIRS = Object.freeze(['commands', 'agents', 'skills', 'references']);
/** JS directories read as the deterministic layer. */
export const CODE_DIRS = Object.freeze(['tools', 'hooks']);

/**
 * A backticked span is a candidate invocation when the first token is
 * command-shaped AND at least one more token follows.
 *
 * REQUIRING AN ARGUMENT IS DELIBERATE, and measured. Bare single-token
 * backticks in this corpus are overwhelmingly NOT commands — `current_epic`
 * (42), `null` (25), `gate_strictness` (25), `attention` (15), `true`, `false`,
 * `strict`. Every real prescription in the corpus carries an argument, `rm -rf`
 * included.
 *
 * ⚠ THAT ALONE IS NOT ENOUGH, and finding out cost a build-and-measure cycle.
 * The argument rule leaves 74 distinct "binaries" over 224 occurrences, and the
 * overwhelming majority are prose: code identifiers (`result.wrote`,
 * `state.phase`, `findings.length`), enum values (`trivial`, `familiar`, `off`,
 * `none`), and plain English inside backticks (`documentation lives in …`,
 * `tests co-located with source`, `suspicious embedded directive at {path}`).
 * A purely structural extractor cannot tell `npm test` from `plain markdown` —
 * both are a lowercase word followed by another word.
 *
 * So a candidate is admitted when it is ALSO either a recognised binary
 * ({@link KNOWN_BINARIES}) or carries a flag-shaped argument. Measured on this
 * corpus: 74 distinct → 21, and every dropped span is genuinely prose.
 *
 * WHY THE FLAG CLAUSE MATTERS MORE THAN THE ALLOWLIST. A bare allowlist would
 * make a NEW binary invisible, which destroys the point of
 * `unclassifiedBinaries`. The flag clause preserves it: `frobnicate --hard` is
 * unknown, flagged, and therefore detected and reported as unclassified.
 *
 * ⚠ PUBLISHED RESIDUAL: an UNKNOWN binary written as `binary subcommand` with
 * no flag is not detected. Measured on this corpus 2026-08-27: **zero such
 * instances** — every dropped span of that shape is prose or JavaScript. The
 * hole is real, it is not currently load-bearing, and it is stated rather than
 * argued away.
 */
const INVOCATION_RE = /`([a-z][a-z0-9_.-]*)((?:\s+[^`\n]{1,120})?)`/g;

/** An argument that reads as a flag: `-l`, `--force`. */
const FLAG_RE = /(^|\s)--?[a-z]/;

/**
 * Binaries recognised without a flag. A RECOGNISER, not a classifier — being on
 * this list only means "this span is a command"; what may be done with it is
 * {@link CLASSIFICATION}'s decision, and the two are deliberately separate.
 */
export const KNOWN_BINARIES = new Set([
  'git', 'npm', 'npx', 'node', 'gh', 'claude', 'bash', 'sh', 'rm', 'mv', 'cp',
  'cat', 'ls', 'grep', 'find', 'chmod', 'mkdir', 'ps', 'jq', 'wc', 'sed', 'awk',
  'tar', 'ssh', 'curl', 'brew', 'read', 'docker', 'make',
  'vitest', 'eslint', 'prettier', 'tsc', 'jest', 'yarn', 'pnpm', 'bun', 'deno',
  'pytest', 'python3', 'pip', 'ruff', 'black', 'mypy',
  'cargo', 'go', 'rustc', 'bundle', 'rspec', 'gradle', 'mvn', 'dotnet',
]);

/** `execFileSync('git', [...])` and friends — a string-literal first argument. */
const SPAWN_RE = /\b(?:execFileSync|execFile|spawnSync|spawn)\(\s*'([a-z][a-z0-9_.-]*)'/g;

/** A token that reads as a subcommand rather than a flag or a path. */
const SUBCOMMAND_RE = /^[a-z][a-z0-9:_-]*$/;

/**
 * The committed classification (FR1.2).
 *
 * Keys are either a bare binary or `binary subcommand`; the more specific key
 * wins. THIS IS THE ONLY COPY — `classify` and `unclassifiedBinaries` both read
 * it, so a verdict added here is visible to the generator and the test without a
 * second edit (`AC1.2d`; two copies is `B82`).
 */
export const CLASSIFICATION = Object.freeze({
  // ── Destructive: never proposed, in either direction ──────────────────────
  // `rm` reaches the scan because doctor.md DESCRIBES `rm -rf` on cache dirs.
  // This entry is the single most important line in the file (`AC1.2a`).
  rm: VERDICT.NEVER_PROPOSE,
  mv: VERDICT.NEVER_PROPOSE,
  cp: VERDICT.NEVER_PROPOSE,
  chmod: VERDICT.NEVER_PROPOSE,
  mkdir: VERDICT.NEVER_PROPOSE,

  // History-rewriting / working-tree-destroying. Not proposed as allow: these
  // are rare, consequential, and the operator should see the prompt (`AC1.2b`).
  'git reset': VERDICT.NEVER_PROPOSE,
  'git rebase': VERDICT.NEVER_PROPOSE,
  'git revert': VERDICT.NEVER_PROPOSE,
  'git checkout': VERDICT.NEVER_PROPOSE,
  'git clean': VERDICT.NEVER_PROPOSE,
  'git push --force': VERDICT.PROPOSE_DENY,

  // ── The flow's ordinary git surface ───────────────────────────────────────
  'git log': VERDICT.PROPOSE_ALLOW,
  'git status': VERDICT.PROPOSE_ALLOW,
  'git diff': VERDICT.PROPOSE_ALLOW,
  'git show': VERDICT.PROPOSE_ALLOW,
  'git add': VERDICT.PROPOSE_ALLOW,
  'git commit': VERDICT.PROPOSE_ALLOW,
  'git push': VERDICT.PROPOSE_ALLOW,
  'git pull': VERDICT.PROPOSE_ALLOW,
  'git fetch': VERDICT.PROPOSE_ALLOW,
  'git branch': VERDICT.PROPOSE_ALLOW,
  'git remote': VERDICT.PROPOSE_ALLOW,
  'git init': VERDICT.PROPOSE_ALLOW,
  'git config': VERDICT.PROPOSE_ALLOW,
  'git grep': VERDICT.PROPOSE_ALLOW,
  'git ls-files': VERDICT.PROPOSE_ALLOW,
  'git rev-list': VERDICT.PROPOSE_ALLOW,
  'git rev-parse': VERDICT.PROPOSE_ALLOW,
  'git for-each-ref': VERDICT.PROPOSE_ALLOW,
  'git symbolic-ref': VERDICT.PROPOSE_ALLOW,
  'git check-ignore': VERDICT.PROPOSE_ALLOW,
  'git worktree': VERDICT.PROPOSE_ALLOW,
  git: VERDICT.PROPOSE_ALLOW,

  // ── Node toolchain: what the flow runs ────────────────────────────────────
  'npm test': VERDICT.PROPOSE_ALLOW,
  'npm run': VERDICT.PROPOSE_ALLOW,
  'npm ci': VERDICT.PROPOSE_ALLOW,
  'npm install': VERDICT.PROPOSE_ALLOW,
  'npm audit': VERDICT.PROPOSE_ALLOW,
  'npm view': VERDICT.PROPOSE_ALLOW,
  'npm ls': VERDICT.PROPOSE_ALLOW,
  npm: VERDICT.PROPOSE_ALLOW,
  npx: VERDICT.PROPOSE_ALLOW,
  node: VERDICT.PROPOSE_ALLOW,
  vitest: VERDICT.PROPOSE_ALLOW,
  eslint: VERDICT.PROPOSE_ALLOW,
  prettier: VERDICT.PROPOSE_ALLOW,
  tsc: VERDICT.PROPOSE_ALLOW,

  // ── Read-only shell the flow leans on ─────────────────────────────────────
  grep: VERDICT.PROPOSE_ALLOW,
  find: VERDICT.PROPOSE_ALLOW,
  cat: VERDICT.PROPOSE_ALLOW,
  ls: VERDICT.PROPOSE_ALLOW,
  ps: VERDICT.PROPOSE_ALLOW,
  jq: VERDICT.PROPOSE_ALLOW,
  wc: VERDICT.PROPOSE_ALLOW,
  sed: VERDICT.NEVER_PROPOSE,
  awk: VERDICT.PROPOSE_ALLOW,
  tar: VERDICT.NEVER_PROPOSE,
  ssh: VERDICT.NEVER_PROPOSE,
  brew: VERDICT.NEVER_PROPOSE,
  // A shell builtin that BLOCKS ON STDIN. It reaches the scan from
  // `commands/doctor.md`'s generated remediation script, where prompting is the
  // point. An agent that runs it hangs, so it is never proposed.
  read: VERDICT.NEVER_PROPOSE,

  // ── GitHub CLI ────────────────────────────────────────────────────────────
  gh: VERDICT.PROPOSE_ALLOW,

  // ── Claude Code's own CLI ─────────────────────────────────────────────────
  claude: VERDICT.PROPOSE_ALLOW,

  // ── Other ecosystems ──────────────────────────────────────────────────────
  // These reach the scan almost entirely from `plugin/agents`, where command
  // files DESCRIBE other people's stacks (probe 2). They are classified so the
  // whole-population check passes, but the report's stack half — not this
  // table — decides whether they apply to the repo actually in front of us.
  pytest: VERDICT.PROPOSE_ALLOW,
  python3: VERDICT.PROPOSE_ALLOW,
  'pip install': VERDICT.NEVER_PROPOSE,
  pip: VERDICT.NEVER_PROPOSE,
  cargo: VERDICT.PROPOSE_ALLOW,
  go: VERDICT.PROPOSE_ALLOW,
  yarn: VERDICT.PROPOSE_ALLOW,
  pnpm: VERDICT.PROPOSE_ALLOW,
  make: VERDICT.PROPOSE_ALLOW,
  ruff: VERDICT.PROPOSE_ALLOW,
  black: VERDICT.PROPOSE_ALLOW,
  mypy: VERDICT.PROPOSE_ALLOW,
  jest: VERDICT.PROPOSE_ALLOW,
  'bundle exec': VERDICT.PROPOSE_ALLOW,
  bundle: VERDICT.PROPOSE_ALLOW,
  rspec: VERDICT.PROPOSE_ALLOW,
  gradle: VERDICT.PROPOSE_ALLOW,
  mvn: VERDICT.PROPOSE_ALLOW,
  dotnet: VERDICT.PROPOSE_ALLOW,
  rustc: VERDICT.PROPOSE_ALLOW,
  deno: VERDICT.PROPOSE_ALLOW,
  bun: VERDICT.PROPOSE_ALLOW,

  // ── Shells and network fetchers: never proposed ───────────────────────────
  // `curl … | sh` is the shape that makes a blanket allow indefensible.
  bash: VERDICT.NEVER_PROPOSE,
  sh: VERDICT.NEVER_PROPOSE,
  curl: VERDICT.NEVER_PROPOSE,
  docker: VERDICT.NEVER_PROPOSE,
});

/**
 * The verdict for a scanned key, most-specific-first.
 *
 * Returns `undefined` for anything the table has never seen — deliberately, and
 * this is load-bearing. Defaulting an unknown binary to `propose-allow` is how
 * `rm` reaches a proposal the day somebody renames it.
 *
 * @param {string} key — `git log`, `rm -rf`, or a bare binary
 * @returns {string|undefined} a {@link VERDICT}, or undefined if unclassified
 */
export function classify(key) {
  if (typeof key !== 'string' || key.trim() === '') return undefined;
  const tokens = key.trim().split(/\s+/);
  for (let n = tokens.length; n >= 1; n--) {
    const probe = tokens.slice(0, n).join(' ');
    if (Object.hasOwn(CLASSIFICATION, probe)) return CLASSIFICATION[probe];
  }
  return undefined;
}

/** Every `.md`/`.js` file under `dir`, recursively. Missing dir → []. */
function walk(dir, ext) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const abs = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(abs, ext));
    else if (e.name.endsWith(ext)) out.push(abs);
  }
  return out;
}

/** 1-indexed line number of `index` within `text`. */
function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/**
 * Scan a plugin payload for every command it prescribes (FR1.1).
 *
 * @param {string} pluginRoot — the payload directory (this repo's `plugin/`)
 * @returns {{
 *   status: string,
 *   reason: string|null,
 *   entries: Array<{binary:string, subcommand:string|null, key:string,
 *                   layer:string, source:string, line:number, dir:string}>,
 *   binaries: string[],
 * }}
 */
export function scanPrescribedCommands(pluginRoot) {
  // B39: an absent or unreadable payload is `cannot-check`, never a clean empty
  // result. "Looked and found nothing" and "could not look" must not render the
  // same, and this is the seam where they would.
  try {
    if (!statSync(pluginRoot).isDirectory()) {
      return { status: SCAN_STATUS.CANNOT_CHECK, reason: `not a directory: ${pluginRoot}`, entries: [], binaries: [] };
    }
  } catch (err) {
    return {
      status: SCAN_STATUS.CANNOT_CHECK,
      reason: `cannot read the plugin payload at ${pluginRoot}: ${err.message}`,
      entries: [],
      binaries: [],
    };
  }

  const entries = [];

  for (const d of PROMPT_DIRS) {
    for (const file of walk(join(pluginRoot, d), '.md')) {
      let text;
      try {
        text = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      for (const m of text.matchAll(INVOCATION_RE)) {
        const rest = (m[2] ?? '').trim();
        if (rest === '') continue; // bare token — see INVOCATION_RE's stated limits
        // A dotted first token is a code identifier (`result.wrote`,
        // `findings.length`), never a binary this flow shells out to.
        if (m[1].includes('.')) continue;
        if (!KNOWN_BINARIES.has(m[1]) && !FLAG_RE.test(rest)) continue;
        const first = rest.split(/\s+/)[0];
        const subcommand = SUBCOMMAND_RE.test(first) ? first : null;
        entries.push({
          binary: m[1],
          subcommand,
          key: subcommand ? `${m[1]} ${subcommand}` : m[1],
          layer: LAYER.PROMPT,
          source: relative(pluginRoot, file).split(sep).join('/'),
          line: lineOf(text, m.index),
          dir: d,
        });
      }
    }
  }

  for (const d of CODE_DIRS) {
    for (const file of walk(join(pluginRoot, d), '.js')) {
      let text;
      try {
        text = readFileSync(file, 'utf-8');
      } catch {
        continue;
      }
      for (const m of text.matchAll(SPAWN_RE)) {
        entries.push({
          binary: m[1],
          subcommand: null,
          key: m[1],
          layer: LAYER.DETERMINISTIC,
          source: relative(pluginRoot, file).split(sep).join('/'),
          line: lineOf(text, m.index),
          dir: d,
        });
      }
    }
  }

  entries.sort(
    (a, b) => a.source.localeCompare(b.source) || a.line - b.line || a.key.localeCompare(b.key)
  );

  return {
    status: SCAN_STATUS.OK,
    reason: null,
    entries,
    binaries: [...new Set(entries.map((e) => e.binary))].sort(),
  };
}

/**
 * Binaries the live scan returned that the table has never classified (AC1.2c).
 *
 * THIS IS THE WHOLE-POPULATION CHECK. It reads the scan's actual output rather
 * than a fixture list, so a command file prescribing a new tool fails the suite
 * until somebody decides what to do about it. Pinning a literal list here would
 * recreate the drift inside the guard — the mistake `prescribed-cli.test.js`
 * avoided by deriving its identity from the manifests.
 *
 * A `cannot-check` scan returns `[]`: there is nothing to be behind on, and
 * reporting the blindness is the scan's job, not this function's.
 *
 * @param {ReturnType<typeof scanPrescribedCommands>} scan
 * @returns {string[]} sorted, unique
 */
export function unclassifiedBinaries(scan) {
  if (!scan || scan.status !== SCAN_STATUS.OK) return [];
  return [...new Set(scan.entries.filter((e) => classify(e.key) === undefined).map((e) => e.binary))].sort();
}
