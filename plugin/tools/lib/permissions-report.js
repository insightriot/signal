// M6.E5 FR4.1 / FR5.1 / FR5.2 / FR5.3 — the deliverable: a proposal a person
// installs.
//
// THE ONE GUARANTEE EVERYTHING ELSE RESTS ON: nothing here writes a settings
// file. `D-BR0826-1` settled it — rules are enforced by Claude Code and not by
// the model, plugins are not a settings source, and authority stays where the
// platform put it. Signal supplies legibility. There is no `--force`, no
// `--install`, no path that touches `.claude/` or `~/.claude/`.
//
// WHY THE ARTIFACT IS TRACKED. Verified on this repo 2026-08-26:
// `.claude/settings.local.json` is gitignored, `.claude/settings.json` does not
// exist, and `git ls-files .claude/` returns NOTHING. So the project's
// permission state is not merely unshared — none of it is under version control.
// That is why the recommended install target is the TRACKED project settings
// file, and why the proposal itself lands somewhere a commit can carry.
//
// REACH IS PUBLISHED, NOT IMPLIED (`AC5.3d`). The report runs in ANY repository:
// the flow half needs only the plugin payload, the stack half only the host
// manifests. The tracked artifact reaches Signal projects only, because it
// writes into `.planning/` and this command does not create one.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  scanPrescribedCommands, classify, CLASSIFICATION, VERDICT, LAYER, SCAN_STATUS,
} from './permissions-scan.js';
import { readPermissionScopes, proposalDelta, formatScopeReport, APPROXIMATION_LIMIT } from './permissions-state.js';
import { detectStack, stackRules } from './stack-detect.js';

/** Where the proposal is written, relative to the project root. */
export const ARTIFACT_REL = '.planning/PERMISSIONS.md';

/**
 * The three modes the platform already ships (`AC4.1d`).
 *
 * Named by THEIR names. A fourth, Signal-flavoured dial beside `tier`,
 * `gate_strictness` and `attention` is `B75` — a control documented end to end
 * and enforced nowhere — and `D-M6E5-5` rules it out explicitly.
 */
export const PLATFORM_MODES = Object.freeze(['default', 'allow rule', 'dontAsk']);

/**
 * The hard cap on the deny list.
 *
 * `AC4.1a` says "small enough to read in one screen", which is not falsifiable.
 * Plan validation flagged that as the weakest of the nine quantitative tasks and
 * required EXECUTE to write the number down rather than leave it inferred. This
 * is the number. It is enforced by a test, so the list cannot grow by accretion
 * into the work-stopping shape `AC4.1b` warns about.
 */
export const DENY_CAP = 8;

/**
 * The proposed deny list (FR4.1) — small, conservative, each entry saying why.
 *
 * Measured 2026-08-26: 43 allow rules, ZERO deny, no `defaultMode`. That is not
 * carelessness — "Yes, and don't ask again" only ever writes to `allow`, so the
 * protective half is empty BY CONSTRUCTION and cannot fill itself.
 *
 * ⚠ Deny is ABSOLUTE and cannot carry exceptions: a broad deny beats a narrower
 * allow. So every entry here is a shape with no legitimate use inside this flow,
 * and the list stays short on purpose — a rule that is slightly too wide is a
 * work stoppage with a confusing message rather than a prompt.
 */
export const DENY_PROPOSALS = Object.freeze([
  {
    rule: 'Bash(sudo:*)',
    why: 'Privilege escalation. Nothing in the six phases needs root, and a prompt is the wrong place to decide it.',
  },
  {
    rule: 'Bash(rm -rf:*)',
    why: 'Recursive delete. The flow never needs it; /sig:doctor only ever PROPOSES cleanup for a person to run.',
  },
  {
    rule: 'Bash(git push --force:*)',
    why: 'Destroys published history. This repo pins commit SHAs in its own records, so a force-push invalidates them.',
  },
  {
    rule: 'Bash(curl:*)',
    why: 'Fetch-and-execute is the shape that makes a blanket allow indefensible. Add a narrower allow if a real need appears.',
  },
  {
    rule: 'Read(./.env)',
    why: 'Secrets. ENVIRONMENT.md exists precisely so configuration is described by NAME without values being read.',
  },
]);

/** Flags this command accepts (`NFR3`). */
const VALID_FLAGS = new Set(['--apply', '--help']);

/**
 * Parse argv flags, rejecting anything undocumented by name (`NFR3`).
 *
 * @param {string[]} argv
 * @returns {{ok: boolean, flags: Set<string>, error: string|null}}
 */
export function parseFlags(argv = []) {
  const flags = new Set();
  for (const a of argv) {
    if (!VALID_FLAGS.has(a)) {
      return {
        ok: false,
        flags,
        error: `unrecognised flag ${a}. Valid flags: ${[...VALID_FLAGS].sort().join(', ')}`,
      };
    }
    flags.add(a);
  }
  return { ok: true, flags, error: null };
}

/** A scanned key rendered as a permission pattern. */
function ruleFor(key) {
  return `Bash(${key}:*)`;
}

/**
 * Which ecosystem a binary belongs to, if any.
 *
 * ⚠ FOUND BY RUNNING THE REPORT, NOT BY A TEST (S4.t1, 2026-08-27). The first
 * render against this repo proposed `Bash(cargo build:*)`, `Bash(go test:*)`,
 * `Bash(bundle exec:*)`, `Bash(jest run:*)`, `Bash(yarn test:*)` and
 * `Bash(npx prisma:*)` — for a Node project. Every one arrived from
 * `plugin/agents`, where command files DESCRIBE other people's stacks.
 *
 * This is exactly the over-proposal `D-M6E5-3` and probe 2 warned about, and the
 * plan amendment said provenance would be a classification input. It was not,
 * until this render made it visible.
 *
 * THE RULE: an ecosystem-specific binary is never proposed by the FLOW half. It
 * can only arrive from the STACK half, which is derived from the host's actual
 * manifests. That is what "flow-derived" and "stack-derived" are supposed to
 * mean, and the split now does real work rather than only labelling.
 */
const ECOSYSTEM_OF = Object.freeze({
  npm: 'node', npx: 'node', vitest: 'node', eslint: 'node', prettier: 'node',
  tsc: 'node', jest: 'node', yarn: 'node', pnpm: 'node', bun: 'node', deno: 'node',
  pytest: 'python', python3: 'python', pip: 'python', ruff: 'python',
  black: 'python', mypy: 'python',
  cargo: 'rust', rustc: 'rust',
  go: 'go',
  bundle: 'ruby', rspec: 'ruby',
  gradle: 'java', mvn: 'java',
  dotnet: 'dotnet',
  composer: 'php',
});

/**
 * True when a BARE binary rule would grant subcommands the table refuses.
 *
 * ⚠ ALSO FOUND BY RUNNING IT. The first render proposed `Bash(git:*)` alongside
 * the specific `Bash(git log:*)` etc. — and `Bash(git:*)` grants `git reset`,
 * `git rebase` and `git push --force`, which `AC1.2b` exists to withhold.
 * `classify('git reset')` was correct the whole time; the PROPOSAL threw the
 * answer away by emitting a wider rule beside it.
 *
 * A test asserting classify() would never have caught this. The defect lives
 * between a correct classification and the rule rendered from it.
 */
function bareRuleWouldOverreach(binary) {
  const prefix = `${binary} `;
  return Object.entries(CLASSIFICATION).some(
    ([key, verdict]) => key.startsWith(prefix) && verdict !== VERDICT.PROPOSE_ALLOW
  );
}

/**
 * Compose the whole proposal (S4.t1).
 *
 * @param {{pluginRoot: string, baseDir: string, homeDir: string}} opts
 */
export function buildProposal({ pluginRoot, baseDir, homeDir }) {
  const scan = scanPrescribedCommands(pluginRoot);
  const state = readPermissionScopes({ homeDir, baseDir });
  const stack = detectStack(baseDir);

  // Flow half: every scanned key classified propose-allow, most-specific key
  // first. Sorted so two runs over an unchanged tree are byte-identical (NFR4).
  const flowKeys = new Set();
  if (scan.status === SCAN_STATUS.OK) {
    for (const e of scan.entries) {
      if (classify(e.key) !== VERDICT.PROPOSE_ALLOW) continue;
      // Ecosystem tools belong to the stack half or to nothing. A `cargo build`
      // rule in a Node repo is noise the operator has to read and reject.
      if (ECOSYSTEM_OF[e.binary]) continue;
      // A bare binary rule must not silently re-grant what a subcommand entry
      // refuses.
      if (e.key === e.binary && bareRuleWouldOverreach(e.binary)) continue;
      flowKeys.add(e.key);
    }
  }
  // Drop a bare-binary rule when a narrower rule for the same binary is also
  // proposed. `Bash(claude:*)` beside `Bash(claude plugin:*)` is pure
  // redundancy, and the redundant half is the WIDER grant — so the bare one
  // goes. Narrower is the safe direction to resolve an overlap.
  for (const key of [...flowKeys]) {
    if (key.includes(' ')) continue;
    if ([...flowKeys].some((k) => k.startsWith(`${key} `))) flowKeys.delete(key);
  }

  const flowProposed = [...flowKeys].sort().map(ruleFor);
  // The stack half never repeats what the flow half already proposes — the same
  // rule under two headings reads as two decisions.
  const flowSet = new Set(flowProposed);
  const stackProposed = stackRules(stack).filter((r) => !flowSet.has(r));

  const flowDelta = proposalDelta(flowProposed, state);
  const stackDelta = proposalDelta(stackProposed, state);
  const denyDelta = proposalDelta(
    DENY_PROPOSALS.map((d) => d.rule),
    state
  );

  // NAMING IS DELIBERATE: `stackInfo` is what was DETECTED, `stack` is the rules
  // PROPOSED from it. The first draft called both `stack` and the tests caught
  // it immediately — two meanings on one key is how a caller reads the wrong
  // one and nothing complains.
  return {
    scanStatus: scan.status,
    scanReason: scan.reason,
    deterministicCount: scan.entries.filter((e) => e.layer === LAYER.DETERMINISTIC).length,
    promptCount: scan.entries.filter((e) => e.layer === LAYER.PROMPT).length,
    state,
    stackInfo: stack,
    flow: flowDelta.fresh,
    stack: stackDelta.fresh,
    deny: DENY_PROPOSALS.filter((d) => denyDelta.fresh.includes(d.rule)),
    suppressedCount: flowDelta.suppressedCount + stackDelta.suppressedCount + denyDelta.suppressedCount,
  };
}

/**
 * Render the human-facing report (S4.t1).
 *
 * @param {ReturnType<typeof buildProposal>} p
 * @returns {string}
 */
export function formatReport(p) {
  const stack = p.stack ?? [];
  const out = [];

  out.push('/sig:permissions — proposed permission rules (dry run; nothing was written)');
  out.push('');

  if (p.scanStatus === SCAN_STATUS.CANNOT_CHECK) {
    out.push(`⚠ cannot-check: the plugin payload could not be read — ${p.scanReason}`);
    out.push('  The flow-derived half of this proposal is missing, not empty.');
    out.push('');
  } else {
    out.push(
      `Scanned the payload: ${p.promptCount} prescriptions in prose, ` +
        `${p.deterministicCount} in code.`
    );
    out.push('');
  }

  out.push(formatScopeReport(p.state));
  out.push('');

  if (p.stackInfo?.detected) {
    out.push(`Host stack: ${p.stackInfo.ecosystems.join(', ')} (${p.stackInfo.manifests.join(', ')}).`);
    if (p.stackInfo.unreadable.length) {
      out.push(`  ⚠ cannot-check: ${p.stackInfo.unreadable.join(', ')} could not be parsed.`);
    }
  } else {
    out.push(`Host stack: none detected — ${p.stackInfo?.reason ?? 'no manifest'}. No stack rules proposed.`);
  }
  out.push('');

  const flow = p.flow ?? [];
  if (flow.length === 0 && stack.length === 0 && (p.deny ?? []).length === 0) {
    out.push('Nothing new to propose — every rule this flow needs is already granted.');
    out.push('');
  } else {
    out.push('Proposed allow — from Signal\'s own flow:');
    out.push(flow.length ? flow.map((r) => `  ${r}`).join('\n') : '  (none — all already granted)');
    out.push('');
    out.push('Proposed allow — from THIS project\'s stack:');
    out.push(stack.length ? stack.map((r) => `  ${r}`).join('\n') : '  (none)');
    out.push('');
    out.push('Proposed deny:');
    out.push(
      '  ⚠ Deny is ABSOLUTE and cannot carry allowlist exceptions — a broad deny beats a narrower'
    );
    out.push('    allow. A rule slightly too wide is a work stoppage, not a prompt. Read each one.');
    for (const d of p.deny ?? []) {
      out.push(`  ${d.rule}`);
      out.push(`      ${d.why}`);
    }
    out.push('');
  }

  if (p.suppressedCount > 0) {
    out.push(`${p.suppressedCount} rule(s) already granted and therefore not re-proposed.`);
    out.push('');
  }

  out.push(`Consent is the platform's, and it already has names: ${PLATFORM_MODES.join(' · ')}.`);
  out.push('Signal proposes no fourth setting beside them.');
  out.push('');
  out.push('To install: review the block in the artifact, then merge it into `.claude/settings.json`');
  out.push('yourself — or ask for the `update-config` skill. This command never writes a settings file.');
  out.push('');
  out.push('Reach: this report runs in any repository. The tracked artifact is written only where a');
  out.push('`.planning/` directory already exists; this command does not create one.');

  return out.join('\n');
}

/**
 * Render the tracked artifact (`AC5.2a`).
 *
 * @param {ReturnType<typeof buildProposal>} p
 * @returns {string}
 */
export function renderArtifact(p) {
  const stack = p.stack ?? [];
  const json = JSON.stringify(
    { permissions: { allow: [...(p.flow ?? []), ...stack].sort(), deny: (p.deny ?? []).map((d) => d.rule) } },
    null,
    2
  );

  return [
    '# Proposed permissions',
    '',
    'Generated by `/sig:permissions`. **This is a proposal, not a setting.** Signal cannot install',
    'it — permission rules are enforced by Claude Code and not by the model, and plugins are not a',
    'settings source. Installing it is your act.',
    '',
    '## Where to install it',
    '',
    'Merge the block below into **`.claude/settings.json`** — the *tracked* project scope.',
    '',
    '⚠ **Not `.claude/settings.local.json`.** That file is gitignored, so a rule installed there',
    'cannot be shared, committed, or carried to another machine — every repo on every machine starts',
    'empty and re-accumulates its own. It is also where *"Yes, and don\'t ask again"* writes by',
    'default, which is why permission state tends not to be under version control at all.',
    '',
    '## The proposal',
    '',
    '```json',
    json,
    '```',
    '',
    '## What this could not establish',
    '',
    `⚠ ${APPROXIMATION_LIMIT}`,
    '',
    ...(p.scanStatus === SCAN_STATUS.CANNOT_CHECK
      ? [`⚠ The plugin payload could not be read (${p.scanReason}), so the flow half is missing, not empty.`, '']
      : []),
    '⚠ Deny is absolute and carries no exceptions. A rule slightly too wide stops work you wanted.',
    '',
  ].join('\n');
}

/**
 * Write the artifact, idempotently (`AC5.2c`), and only where `.planning/`
 * already exists (`AC5.3b`, `AC5.3c`).
 *
 * @param {string} baseDir
 * @param {string} content
 * @returns {{status: 'written'|'unchanged'|'skipped', path: string, reason: string|null}}
 */
export function writeArtifact(baseDir, content) {
  const dir = join(baseDir, '.planning');
  const path = join(baseDir, ARTIFACT_REL);

  if (!existsSync(dir)) {
    // AC5.3b/AC5.3c — skipped WITH its reason, and no directory is created.
    // Quietly scaffolding a project from a permissions report is a side effect
    // nobody asked for; /sig:new-project and /sig:init own that.
    return {
      status: 'skipped',
      path,
      reason: 'no .planning/ directory here, so there is nowhere tracked to put the proposal (the report above is complete)',
    };
  }

  try {
    if (existsSync(path) && readFileSync(path, 'utf-8') === content) {
      return { status: 'unchanged', path, reason: null };
    }
  } catch {
    // Unreadable existing file: fall through and rewrite it.
  }

  writeFileSync(path, content, 'utf-8');
  return { status: 'written', path, reason: null };
}
