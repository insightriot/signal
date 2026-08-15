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
