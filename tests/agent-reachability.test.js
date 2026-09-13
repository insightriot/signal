/**
 * tests/agent-reachability.test.js — AC6.2 (M5.E10 S6.t1).
 *
 * An agent no command can invoke, left undocumented, is the never-called-guard
 * class — `B39`, `B54`, and the whole of `M5.E13`. `AC6.2` accepts either
 * "reachable" or "documented as unreachable"; `D-M5E10-1` put dispatch
 * machinery out of scope, so this Epic takes the second option and makes the
 * documentation checked rather than asserted.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PAGE = join(ROOT, 'plugin', 'references', 'agent-reachability.md');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.md')) out.push(p);
  }
  return out;
}

function measure() {
  const agentsDir = join(ROOT, 'plugin', 'agents');
  const agents = walk(agentsDir).map((p) => p.replace(agentsDir + '/', ''));
  const dispatched = new Set();
  for (const f of readdirSync(join(ROOT, 'plugin', 'commands')).filter((f) => f.endsWith('.md'))) {
    const content = readFileSync(join(ROOT, 'plugin', 'commands', f), 'utf8');
    if (!/subagent_type/.test(content)) continue;
    for (const a of agents) {
      const base = a.split('/').pop().replace('.md', '');
      const re = new RegExp('`' + base + '`');
      if (content.split('\n').some((l) => re.test(l) && /^\s*\|/.test(l))) dispatched.add(base);
    }
  }
  return { agents, dispatched };
}

let page;
let measured;

beforeAll(() => {
  page = readFileSync(PAGE, 'utf8');
  measured = measure();
});

describe('AC6.2 — the roster is documented, and the documentation is derived', () => {
  it('the page states the counts the tree yields', () => {
    const reachable = measured.agents.filter((a) =>
      measured.dispatched.has(a.split('/').pop().replace('.md', ''))
    ).length;
    const unreachable = measured.agents.length - reachable;
    expect(page).toContain(
      `**${measured.agents.length} agents. ${reachable} are dispatched by a command. ${unreachable} are not.**`
    );
  });

  it('every unreachable agent is named on the page', () => {
    const missing = measured.agents
      .filter((a) => !measured.dispatched.has(a.split('/').pop().replace('.md', '')))
      .filter((a) => !page.includes('`' + a.split('/').pop() + '`'));
    expect(missing).toEqual([]);
  });

  it('every unreachable agent says so in its own file', () => {
    // The page is the record; a marker in the file is what a person opening
    // `agents/verifiers/verifier.md` directly actually sees. Both, because
    // either alone leaves one of the two readers uninformed.
    const undocumented = [];
    for (const a of measured.agents) {
      const base = a.split('/').pop().replace('.md', '');
      if (measured.dispatched.has(base)) continue;
      const content = readFileSync(join(ROOT, 'plugin', 'agents', a), 'utf8');
      if (!/NOT DISPATCHED BY ANY COMMAND/.test(content)) undocumented.push(a);
    }
    expect(undocumented).toEqual([]);
  });

  it('a reachable agent carries no unreachable marker', () => {
    // The other direction: wiring an agent up must not leave a stale banner
    // telling readers it is dead.
    const stale = [];
    for (const a of measured.agents) {
      const base = a.split('/').pop().replace('.md', '');
      if (!measured.dispatched.has(base)) continue;
      const content = readFileSync(join(ROOT, 'plugin', 'agents', a), 'utf8');
      if (/NOT DISPATCHED BY ANY COMMAND/.test(content)) stale.push(a);
    }
    expect(stale).toEqual([]);
  });
});

describe('the requirement that was written from memory', () => {
  it('the page records that AC6.2 said two, and what the tree says', () => {
    // Kept because it is the clearest instance of this Epic's own defect class
    // appearing in this Epic's own requirements.
    expect(page).toMatch(/as \*"the two/);
    expect(page).toMatch(/written from the shape of the/);
  });

  it('records the plan.md instruction that names agents which do not exist', () => {
    expect(page).toMatch(/three of the four it names do not exist/);
  });
});

// M6.E9 — FR7 and FR8. The two assertions that outlive the Epic: the roster may
// not grow an undecided agent, and an agent may not be filed under two verdicts.
describe('M6.E9 — every agent carries a determination', () => {
  const VERDICT = /\*\*(dormant|cut)\.\*\*/;

  // ⚠ EVERY HELPER TAKES THE PAGE TEXT. It is not a style choice — it is the
  // fix for a defect the fresh-context test-engineer found on the first draft.
  // When these closed over the module-level `page`, a proof test had no way to
  // run the predicate against a synthetic page without reassigning shared
  // state, so both "proofs" fell back to string tricks and neither exercised
  // the guard it was named for. One of them was green on the defect it named
  // and RED on the correct fix. Parameterised, a proof mutates a copy of the
  // page and asserts the predicate flips.

  // Search ONLY the determination sections. The prose above them names agents
  // too — the AC6.2 history paragraph quotes `verifier.md` and
  // `nyquist-auditor.md` — and a first-match-wins reader binds to that instead
  // of the verdict. `B109`'s shape.
  // FAILS CLOSED: a missing heading throws rather than silently widening the
  // search to the whole page, where historical prose would answer for a verdict.
  const determinationRegion = (pageText) => {
    const i = pageText.indexOf('## Dispatched by a command');
    if (i === -1) throw new Error('agent-reachability.md has no "## Dispatched by a command" heading');
    return pageText.slice(i);
  };

  // Read the WHOLE bullet, not its first line — a determination that wraps is
  // normal markdown, and a line-only reader would force the page into an
  // awkward shape to satisfy the test.
  const blockFor = (pageText, base) => {
    const lines = determinationRegion(pageText).split('\n');
    const i = lines.findIndex(
      (l) => l.includes('`' + base + '.md`') || l.includes('/' + base + '.md`')
    );
    if (i === -1) return null;
    if (/^\s*\|/.test(lines[i])) return lines[i];
    const out = [lines[i]];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*(-|#|\||$)/.test(lines[j])) break;
      out.push(lines[j]);
    }
    return out.join(' ');
  };

  // `wired` is only a determination when the TREE agrees. A table row is a
  // claim; `dispatched` is the measurement. Without this gate a fabricated row
  // — `debugger` dispatched by `execute.md § 9`, a command with no
  // subagent_type and no § 9 — reads as a verdict and the suite endorses it.
  const determination = (pageText, base, dispatched) => {
    const block = blockFor(pageText, base);
    if (block === null) return null;
    if (/^\s*\|/.test(block)) return dispatched.has(base) ? 'wired' : 'false-claim';
    const m = block.match(VERDICT);
    return m ? m[1] : null;
  };

  // FR8 over EVERY agent, not only the genuinely-dispatched ones. FR6 says an
  // agent may not appear in both lists, unqualified — and the narrower version
  // let a fabricated table row plus a dormant bullet pass.
  // FAILS CLOSED, and BOUNDED. Two separate defects the fresh-context reviewer
  // found in the first draft:
  //   (a) `[, x = ''] = split(...)` turns a renamed heading into an empty
  //       haystack, so the guard goes green over nothing.
  //   (b) slicing to end-of-file swept in the "worse than unreachable"
  //       narrative, which names `codebase-researcher.md` and `verifier.md` in
  //       prose — so the guard would fire falsely the moment either is wired,
  //       which the page's own trigger anticipates.
  const dormantRegion = (pageText) => {
    const region = determinationRegion(pageText);
    const i = region.indexOf('## Not dispatched');
    if (i === -1) throw new Error('agent-reachability.md has no "## Not dispatched" heading');
    const rest = region.slice(i);
    const end = rest.indexOf('\n## ', 1);
    return end === -1 ? rest : rest.slice(0, end);
  };

  const doubleListed = (pageText, agents) => {
    const dormant = dormantRegion(pageText);
    const [table] = determinationRegion(pageText).split('## Not dispatched');
    return agents.filter((a) => {
      const f = a.split('/').pop();
      return table.includes(f) && dormant.includes('`' + f + '`');
    });
  };

  it('FR7 — no agent is left undetermined, and no page entry claims a dispatch the tree denies', () => {
    const bad = measured.agents.filter((a) => {
      const d = determination(page, a.split('/').pop().replace('.md', ''), measured.dispatched);
      return d === null || d === 'false-claim';
    });
    expect(bad).toEqual([]);
  });

  it('FR7 PROOF — an agent with no page entry is reported undetermined', () => {
    // Runs the real predicate against a synthetic page, rather than asserting a
    // string is absent from the real one.
    expect(determination(page, 'no-such-agent', measured.dispatched)).toBeNull();
    const base = 'debugger';
    const stripped = page.replace('- `debugger.md` — **dormant.**', '- `debugger.md` —');
    expect(stripped).not.toBe(page); // the mutation must have applied
    expect(determination(stripped, base, measured.dispatched)).toBeNull();
    expect(determination(page, base, measured.dispatched)).toBe('dormant');
  });

  it('FR7 PROOF — a table row for an agent the tree does not dispatch is a false claim', () => {
    const forged =
      page.replace(
        '## Not dispatched',
        '| `agents/support/debugger.md` | `commands/execute.md` § 9 | EXECUTE | invented |\n\n## Not dispatched'
      );
    expect(forged).not.toBe(page);
    expect(determination(forged, 'debugger', measured.dispatched)).toBe('false-claim');
  });

  it('FR8 — no agent is both dispatched and listed as dormant/cut', () => {
    expect(doubleListed(page, measured.agents)).toEqual([]);
  });

  it('FR8 PROOF — the v0.1.39 code-reviewer double-listing is reported', () => {
    // The real state: wired in review.md § 4.5, still sitting under
    // `agents/specialists/` in the dormant list. Green for two days.
    const doubled = page.replace(
      '### `agents/support/` (3)',
      '- `code-reviewer.md` — **dormant.** **Trigger:** none.\n\n### `agents/support/` (3)'
    );
    expect(doubled).not.toBe(page);
    expect(doubleListed(doubled, measured.agents).map((a) => a.split('/').pop())).toContain(
      'code-reviewer.md'
    );
  });

  it('every dormant agent states a trigger with actual text, not just the marker', () => {
    // `**Trigger:** same.` is a marker with no trigger — the same
    // inherit-from-context weakness this file rejects for verdicts.
    const missing = [];
    for (const a of measured.agents) {
      const base = a.split('/').pop().replace('.md', '');
      if (determination(page, base, measured.dispatched) !== 'dormant') continue;
      const m = (blockFor(page, base) ?? '').match(/\*\*Trigger:\*\*\s*(.+)/);
      const text = (m?.[1] ?? '').replace(/[*_`]/g, '').trim();
      if (text.length < 12 || /^same\.?$/i.test(text)) missing.push(a);
    }
    expect(missing).toEqual([]);
  });

  it('every dormant agent states a reason as well as a trigger (FR4)', () => {
    const missing = [];
    for (const a of measured.agents) {
      const base = a.split('/').pop().replace('.md', '');
      if (determination(page, base, measured.dispatched) !== 'dormant') continue;
      const block = blockFor(page, base) ?? '';
      // The reason is whatever the bullet says BEFORE the trigger marker,
      // beyond the agent name and the verdict token.
      const before = block.split('**Trigger:**')[0].replace(VERDICT, '');
      const prose = before.replace(/`[^`]*`/g, '').replace(/[-—*_.]/g, ' ').trim();
      if (prose.length < 20) missing.push(a);
    }
    expect(missing).toEqual([]);
  });
});
