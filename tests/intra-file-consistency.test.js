/**
 * tests/intra-file-consistency.test.js — a command file may not permit what the
 * same file forbids (`B89`).
 *
 * `commands/plan.md:66` said the inbox drain was "advisory and fully skippable".
 * `commands/plan.md:210`, the Anti-Rationalization table in the SAME FILE,
 * answered "The plan's decided — skip the FUTURE-IDEAS drain" with "No. … Skip
 * it and captures rot in a write-only file." Both were live for months. An agent
 * that skipped was simultaneously obeying Step 1b and committing the exact
 * rationalization the table names as forbidden.
 *
 * WHY IT SURVIVED: M5.E17 was an entire Epic about instructions contradicting
 * instructions, and it shipped CROSS-DOCUMENT tests — one file compared against
 * another. Nothing compared a file against ITSELF. An anti-rationalization table
 * is, by construction, a list of things the file says you may not do; the file's
 * own steps are a list of things it says you may. Those two lists were never
 * checked against each other, in any command.
 *
 * WHAT THIS TEST IS AND IS NOT. It cannot decide semantic contradiction in
 * general — that needs judgment. It pins the specific, mechanically-checkable
 * shape that actually occurred: a step granting permission to skip an action
 * that the same file's anti-rationalization table refuses. The check is narrow
 * on purpose. A test that claimed to find "all contradictions" would be making
 * the completeness claim CLAIM-INTEGRITY-ANALYSIS.md exists to warn about.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMANDS = join(REPO, 'plugin', 'commands');

const commandFiles = readdirSync(COMMANDS).filter((f) => f.endsWith('.md'));

/** The anti-rationalization table, if the file has one. */
function antiRationalizationBlock(src) {
  const m = src.match(/##+\s*Anti-Rationalization[^\n]*\n([\s\S]*?)(?=\n##\s|\n###\s|$)/i);
  return m ? m[1] : null;
}

/**
 * The file minus text explicitly marked as no longer in force.
 *
 * A command file that changes a rule should quote the rule it retired — that
 * quotation is how someone greps their way to the reason. But a verbatim quote
 * is indistinguishable from a live instruction to any check that reads lines,
 * which is the repo's standing lesson: `grep -rn` prints ONE line, so a
 * correction three lines below leaves the original reading as current. The
 * corollary recorded in BACKLOG.md is that a retracted claim must carry its
 * retraction INLINE, and this is the same rule applied to a retired instruction.
 *
 * NOT implemented as "strip blockquotes", which was the first idea and is wrong:
 * measured across `commands/`, blockquotes carry LIVE directives — `add.md`'s
 * "Do not introduce a destination-confirm step" and `migrate-memory.md`'s
 * "Do NOT call these from the command flow" are both `>` blocks. Skipping them
 * would blind this check to real instructions to buy a convenience.
 */
function liveText(src) {
  return src
    .split('\n')
    .filter((line) => !/\[RETIRED\b/i.test(line) && !/\[RETRACTED\b/i.test(line))
    .join('\n');
}

describe('B89 — no command file both permits and forbids the same skip', () => {
  it('plan.md requires the drain, and does not also call it skippable', () => {
    const src = readFileSync(join(COMMANDS, 'plan.md'), 'utf8');
    const live = liveText(src);

    // The permission that contradicted the table. Gone from the live text.
    expect(live).not.toMatch(/advisory and fully skippable/i);
    expect(live).not.toMatch(/skip the whole step and planning proceeds unchanged/i);

    // The requirement, and the bounded escape it depends on.
    expect(live).toMatch(/###\s*1b\..*\(required/i);
    expect(live).toMatch(/This step is required\./);
    expect(live).toContain('defer all remaining');
  });

  it('the retired permission survives as a quotation, and is marked retired', () => {
    // Deleting the old wording outright would pass every check above and lose
    // the only in-file record of why the rule changed. Keeping it unmarked is
    // what makes it indistinguishable from a live instruction. It must be both
    // present and marked — this test fails if either half is dropped.
    const src = readFileSync(join(COMMANDS, 'plan.md'), 'utf8');
    const quoted = src
      .split('\n')
      .filter((l) => /advisory and fully skippable/i.test(l));
    expect(quoted.length, 'the retired wording should be quoted exactly once').toBe(1);
    expect(quoted[0]).toMatch(/\[RETIRED\b/i);
    expect(quoted[0]).toMatch(/no longer in force/i);
  });

  it('the bounded escape is offered unconditionally, not above some size threshold', () => {
    const src = liveText(readFileSync(join(COMMANDS, 'plan.md'), 'utf8'));
    // A required step whose only escape appears "on a large first run" is a
    // step with no escape on a small one.
    expect(src).not.toMatch(/On a large first run, offer \*\*"defer all remaining"\*\*/);
    expect(src).toMatch(/Always offer "defer all remaining"/i);
  });

  it('the anti-rationalization row still refuses the skip, and now names the legitimate move', () => {
    const table = antiRationalizationBlock(readFileSync(join(COMMANDS, 'plan.md'), 'utf8'));
    expect(table).toBeTruthy();
    const row = table.split('\n').find((l) => /skip the inbox drain/i.test(l));
    expect(row, 'the drain row must survive — removing it was the other resolution').toBeTruthy();
    expect(row).toMatch(/\bNo\b/);
    expect(row).toContain('defer all remaining');
  });

  it('no command file grants a skip its own anti-rationalization table refuses', () => {
    // The general form, applied across the corpus. For each table row phrased as
    // "skip the X" and answered "No", the file must not elsewhere describe that
    // same step as skippable.
    const offenders = [];
    for (const file of commandFiles) {
      const src = liveText(readFileSync(join(COMMANDS, file), 'utf8'));
      const table = antiRationalizationBlock(src);
      if (!table) continue;
      const body = src.replace(table, '');

      for (const line of table.split('\n')) {
        const refusal = line.match(/skip (?:the )?([a-z0-9 -]{3,40})/i);
        if (!refusal || !/\|\s*(No\b|\*\*No)/i.test(line)) continue;
        const subject = refusal[1].trim().replace(/\s+/g, '\\s+');
        const permits = new RegExp(
          `(fully skippable|skippable)[^.\\n]{0,80}${subject}|${subject}[^.\\n]{0,80}(is (?:advisory and )?fully skippable)`,
          'i'
        );
        if (permits.test(body)) offenders.push(`${file}: "${refusal[0]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
