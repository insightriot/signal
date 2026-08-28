// M6.E5 FR3.1 / FR3.2 — the host project's own toolchain, detected from its
// manifests.
//
// WHY THIS EXISTS. `D-M6E5-3` overruled the DISCUSS recommendation. Flow-only
// was recommended on a measurement: `pytest`, `cargo build` and `go test` appear
// in Signal's corpus only because command files DESCRIBE other people's stacks,
// so treating them as signal would propose a Python rule in a Node repo. It was
// overruled because the whole decision rests on `O(repos × machines)` — a
// generator that leaves a Python developer prompting for their own test runner
// has not solved the problem it was built for.
//
// ⚠ THIS IS A NEW DETECTOR, NOT A REUSE, and saying so precisely matters.
// `/sig:init`'s four scanners (`agents/scanners/*.md`) are AGENT PROSE holding
// `Bash` — there is no deterministic stack-detection function anywhere in
// `plugin/tools/lib/` to call. Claiming reuse would be false.
//
// It is also NOT `B82`'s duplicate-implementation shape, and the distinction is
// not a technicality: `B82` was two implementations of ONE rule that could
// disagree. Here there is one implementation, because the scanners have no
// implementation — they have instructions to a model.
//
// ⚠ RECORDED HAZARD: if `/sig:init` ever wants deterministic stack detection,
// EXTEND this module. Writing a second one is how `B82` starts.
//
// DELIBERATELY SHALLOW. Presence plus a shallow parse — `JSON.parse` for JSON,
// nothing at all for TOML/Ruby/Go manifests beyond the filename. No TOML parser,
// no new dependency (`NFR4` and the Epic's zero-dependency constraint). What a
// manifest's *contents* say beyond `package.json`'s `scripts` is not needed:
// the ecosystem is what selects the rule set.

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { classify, VERDICT } from './permissions-scan.js';

/**
 * The manifests recognised, and the ecosystem each implies (`AC3.1a`).
 *
 * ONE LIST, read by both the detector and its test — a second copy is how the
 * criterion and the code drift apart.
 */
export const MANIFESTS = Object.freeze([
  { file: 'package.json', ecosystem: 'node' },
  { file: 'pyproject.toml', ecosystem: 'python' },
  { file: 'setup.py', ecosystem: 'python' },
  { file: 'Cargo.toml', ecosystem: 'rust' },
  { file: 'go.mod', ecosystem: 'go' },
  { file: 'Gemfile', ecosystem: 'ruby' },
  { file: 'composer.json', ecosystem: 'php' },
]);

/** Rules proposed per ecosystem, beyond anything read from a manifest's contents. */
const ECOSYSTEM_RULES = Object.freeze({
  // ⚠ `Bash(node:*)` and `Bash(python3:*)` were here and are GONE. `node -e` and
  // `python3 -c` are unrestricted shell execution, so proposing them from the
  // stack half was a blanket grant that walked straight around the flow half's
  // classification — the Epic's own thesis, unenforced on this side of the
  // split. Every rule below now also passes through `classify()`. (PR #211
  // review.)
  node: ['Bash(npm test:*)', 'Bash(npx vitest:*)'],
  python: ['Bash(pytest:*)'],
  rust: ['Bash(cargo check:*)', 'Bash(cargo test:*)', 'Bash(cargo build:*)'],
  go: ['Bash(go test:*)', 'Bash(go build:*)', 'Bash(go vet:*)'],
  ruby: ['Bash(bundle exec:*)', 'Bash(rspec:*)'],
  php: ['Bash(composer:*)'],
});

/** `Bash(x y:*)` / `Bash(x:*)` → the `x y` / `x` key `classify` understands. */
function keyOfRule(rule) {
  const m = /^Bash\((.+?):\*\)$/.exec(rule);
  return m ? m[1] : null;
}

function exists(p) {
  try {
    statSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the host project's ecosystems and its real npm scripts (FR3.1).
 *
 * @param {string} baseDir — the repository root to inspect
 * @returns {{
 *   detected: boolean,
 *   ecosystems: string[],
 *   manifests: string[],
 *   npmScripts: string[],
 *   unreadable: string[],
 *   origin: 'stack',
 *   reason: string|null,
 * }}
 */
export function detectStack(baseDir) {
  const none = (reason) => ({
    detected: false,
    ecosystems: [],
    manifests: [],
    npmScripts: [],
    unreadable: [],
    origin: 'stack',
    reason,
  });

  try {
    if (!statSync(baseDir).isDirectory()) return none(`not a directory: ${baseDir}`);
  } catch (err) {
    return none(`cannot read ${baseDir}: ${err.message}`);
  }

  const found = MANIFESTS.filter((m) => exists(join(baseDir, m.file)));
  if (found.length === 0) {
    // AC3.1c — no fallback to a default stack. Proposing Node rules for a repo
    // that is not Node is the over-proposal this whole split exists to prevent.
    return none('no recognised package manifest found — no stack rules proposed');
  }

  const unreadable = [];
  let npmScripts = [];

  if (found.some((m) => m.file === 'package.json')) {
    try {
      const pkg = JSON.parse(readFileSync(join(baseDir, 'package.json'), 'utf-8'));
      // AC3.1b — the scripts that EXIST, never a guessed set.
      npmScripts = Object.keys(pkg?.scripts ?? {}).sort();
    } catch {
      // The manifest is there, so the ecosystem stands; we just cannot read its
      // scripts. Reported, not silently treated as "no scripts".
      unreadable.push('package.json');
    }
  }

  return {
    detected: true,
    ecosystems: [...new Set(found.map((m) => m.ecosystem))].sort(),
    manifests: found.map((m) => m.file).sort(),
    npmScripts,
    unreadable,
    origin: 'stack',
    reason: null,
  };
}

/**
 * The permission rules a detected stack implies (`AC3.1d` — these stay labelled
 * `stack` so the report can present them separately and the user can install one
 * half and refuse the other).
 *
 * @param {ReturnType<typeof detectStack>} stack
 * @returns {string[]} sorted, unique
 */
export function stackRules(stack) {
  if (!stack?.detected) return [];
  const out = new Set();
  for (const eco of stack.ecosystems) for (const r of ECOSYSTEM_RULES[eco] ?? []) out.add(r);
  // A host `npm run <script>` rule names the SCRIPT, not what it executes —
  // `scripts.test` can be any command at all. It is proposed because the user's
  // own manifest declares it, and the report says so; it is not derived the way
  // the flow half is.
  for (const s of stack.npmScripts) out.add(`Bash(npm run ${s}:*)`);

  // ⚠ THE SAME GATE THE FLOW HALF USES. Without this, `ECOSYSTEM_RULES` strings
  // went straight into the proposal with no classification at all — so the
  // Epic's central claim ("derivation alone is not a design") held on one side
  // of the split and not the other. `npm run …` is exempt because its key is the
  // user's script name, which no table can know. (PR #211 review.)
  return [...out]
    .filter((r) => {
      if (r.startsWith('Bash(npm run ')) return true;
      const key = keyOfRule(r);
      return key === null || classify(key) === VERDICT.PROPOSE_ALLOW;
    })
    .sort();
}
