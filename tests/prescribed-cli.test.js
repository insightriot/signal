/**
 * tests/prescribed-cli.test.js — a command file may not prescribe a CLI string
 * the CLI would reject (`B85`).
 *
 * `commands/update.md` told users to run `claude plugin update sig` for FOUR
 * releases. The CLI rejects it — `Failed to update plugin "sig": Plugin "sig"
 * not found` — because an installed plugin is identified as
 * `{plugin}@{marketplace}`. The command's ONE mutating step had therefore never
 * succeeded as written, and a user following it got a correct report followed by
 * a copy-paste line that errors.
 *
 * WHY IT SURVIVED: nothing in the suite ever executed, or even inspected, a CLI
 * string a command file prescribes. The whole class was unguarded.
 *
 * WHY THIS TEST DOES NOT SHELL OUT: it does not need to. The correct identity is
 * DERIVABLE from two committed manifests — `.claude-plugin/plugin.json` (`sig`)
 * and `.claude-plugin/marketplace.json` (`signal`). Deriving it beats running the
 * CLI on three counts: it works in CI where no plugin is installed, it cannot be
 * flaky or network-dependent, and it keeps working when the names change. A test
 * that shelled out would also mutate the developer's actual plugin install, which
 * is not a thing a unit test may do.
 *
 * This is the same shape as the repo's other durable guards: a document checked
 * against the manifest it describes, rather than against someone's memory.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = join(ROOT, 'commands');

const plugin = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf-8'));
const marketplace = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf-8')
);

/** The identity the CLI actually accepts, derived — never hardcoded. */
const QUALIFIED = `${plugin.name}@${marketplace.name}`;

/**
 * Every `claude plugin <verb> <target>` occurrence across the command corpus.
 * Verbs that take a plugin target must use the qualified form; verbs that take
 * no target (`list`, `marketplace update`) are exempt because there is nothing
 * to qualify — both are verified to work as written.
 */
const TARGETLESS = new Set(['list', 'marketplace']);
const INVOCATION = /`claude plugin ([a-z-]+)(?:\s+([^`\s]+))?[^`]*`/g;

function invocations() {
  const out = [];
  for (const f of readdirSync(COMMANDS).filter((n) => n.endsWith('.md'))) {
    const text = readFileSync(join(COMMANDS, f), 'utf-8');
    for (const m of text.matchAll(INVOCATION)) {
      out.push({ file: f, verb: m[1], target: m[2] ?? null, raw: m[0] });
    }
  }
  return out;
}

describe('B85 — no command file prescribes a CLI string the CLI would reject', () => {
  it('the corpus actually contains invocations to check', () => {
    // Guard the guard. If the regex stops matching, every assertion below
    // passes vacuously and this file becomes a test that proves nothing —
    // which is how the bug it exists to catch survived in the first place.
    expect(invocations().length).toBeGreaterThan(0);
  });

  it('every plugin-targeting invocation uses the marketplace-qualified name', () => {
    const offenders = invocations()
      .filter((i) => !TARGETLESS.has(i.verb) && i.target !== null)
      .filter((i) => i.target !== QUALIFIED)
      .map((i) => `${i.file}: ${i.raw} — expected target ${QUALIFIED}`);
    expect(offenders).toEqual([]);
  });

  it('the qualified name is derived from the manifests, not assumed', () => {
    // If either manifest is renamed, QUALIFIED follows and the assertion above
    // keeps meaning what it says. Pinning the literal here would recreate the
    // bug in the test.
    expect(plugin.name).toBeTruthy();
    expect(marketplace.name).toBeTruthy();
    expect(QUALIFIED).toBe(`${plugin.name}@${marketplace.name}`);
    expect(QUALIFIED).not.toBe(plugin.name);
  });

  it('update.md prescribes the update, and prescribes it qualified', () => {
    // Belt and braces on the specific line B85 was about, so a refactor that
    // drops the invocation entirely is also caught — an absent instruction
    // passes a "no bad instructions" test trivially.
    const update = readFileSync(join(COMMANDS, 'update.md'), 'utf-8');
    expect(update).toMatch(new RegExp(`claude plugin update ${QUALIFIED.replace('@', '@')}`));
    expect(update).not.toMatch(/`claude plugin update sig`/);
  });
});
