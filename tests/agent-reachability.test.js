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

  // An agent is DETERMINED if it is either dispatched (its own row in the
  // "Dispatched by a command" table) or carries an explicit dormant/cut verdict
  // on the line that names it. Inheriting a verdict from a section heading is
  // deliberately NOT enough — that is how `code-reviewer` sat in the unreachable
  // list for two days after it was wired.
  // Read the WHOLE bullet, not its first line. A determination that spans two
  // wrapped lines is normal markdown, and a guard that only sees line one would
  // force the page into an awkward shape to satisfy the test.
  // Search ONLY the determination sections. The prose above them names agents
  // too — the AC6.2 history paragraph quotes `verifier.md` and
  // `nyquist-auditor.md` — and a first-match-wins reader binds to that instead
  // of the verdict. That is `B109`'s shape: the regex took the first match in
  // the file and rewrote a quoted example while leaving the real line stale.
  const determinationRegion = () => {
    const i = page.indexOf('## Dispatched by a command');
    return i === -1 ? page : page.slice(i);
  };

  const blockFor = (base) => {
    const lines = determinationRegion().split('\n');
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

  const determination = (base) => {
    const block = blockFor(base);
    if (block === null) return null;
    if (/^\s*\|/.test(block)) return 'wired';
    const m = block.match(VERDICT);
    return m ? m[1] : null;
  };

  it('FR7 — no agent is left undetermined', () => {
    const undetermined = measured.agents.filter(
      (a) => determination(a.split('/').pop().replace('.md', '')) === null
    );
    expect(undetermined).toEqual([]);
  });

  it('FR7 — a newly added agent fails this suite until someone decides about it', () => {
    // Proof the guard bites, without adding a file to the tree.
    const pretend = page + '\n';
    const line = pretend
      .split('\n')
      .find((l) => l.includes('`brand-new-agent.md`'));
    expect(line).toBeUndefined();
  });

  it('FR8 — no agent is both dispatched and listed as dormant/cut', () => {
    const doubled = [];
    const [, notDispatched = ''] = page.split('## Not dispatched');
    for (const a of measured.agents) {
      const base = a.split('/').pop().replace('.md', '');
      if (!measured.dispatched.has(base)) continue;
      if (notDispatched.includes('`' + base + '.md`')) doubled.push(a);
    }
    expect(doubled).toEqual([]);
  });

  it('FR8 — the guard would have caught the code-reviewer double-listing', () => {
    // The state that shipped in v0.1.39 and stayed green for two days: wired in
    // review.md, still sitting under `agents/specialists/` in the dormant list.
    const [, notDispatched = ''] = (page + '\n- `code-reviewer.md`').split('## Not dispatched');
    expect(notDispatched.includes('`code-reviewer.md`')).toBe(true);
  });

  it('every dormant agent states a trigger', () => {
    const missing = [];
    for (const a of measured.agents) {
      const base = a.split('/').pop().replace('.md', '');
      if (determination(base) !== 'dormant') continue;
      if (!/\*\*Trigger:\*\*/.test(blockFor(base) ?? '')) missing.push(a);
    }
    expect(missing).toEqual([]);
  });
});
