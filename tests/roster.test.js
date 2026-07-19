// Tests for tools/lib/roster.js — the single filesystem-glob roster authority
// (M5.E3.S2.t1 / FR3+FR4). Anchors counts/lists of the plugin's commands,
// agents, and skills to disk so validate-plugin.js and the FR4 hygiene guard
// share ONE source of truth. Glob is anchored at the specific top-level dirs
// (`commands/`, `agents/`, `skills/`) — NEVER a repo-wide recursive walk — so
// the duplicate plugin tree under `.claude/worktrees/dogfood-status/` (its own
// `plugin.json` + `commands/` + `agents/`) is never double-counted.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { listCommands, listAgents, listSkills, roster, ROOT } from '../tools/lib/roster.js';

describe('roster — canonical filesystem-glob counts (Signal repo)', () => {
  it('returns 16 commands from commands/*.md', () => {
    expect(listCommands(ROOT).length).toBe(16);
  });

  it('returns 26 agents from agents/**/*.md', () => {
    expect(listAgents(ROOT).length).toBe(26);
  });

  it('returns 21 skills from skills/**/SKILL.md', () => {
    expect(listSkills(ROOT).length).toBe(21);
  });

  it('roster() aggregates the counts + lists', () => {
    const r = roster(ROOT);
    expect(r.counts).toEqual({ commands: 16, agents: 26, skills: 21 });
    expect(r.commands.length).toBe(16);
    expect(r.agents.length).toBe(26);
    expect(r.skills.length).toBe(21);
  });

  it('lists are sorted, POSIX-relative, and shaped as expected', () => {
    const cmds = listCommands(ROOT);
    expect(cmds).toContain('commands/calibrate.md');
    expect([...cmds].sort()).toEqual(cmds); // already sorted
    expect(listAgents(ROOT)).toContain('agents/scanners/stack-scanner.md');
    expect(listSkills(ROOT).every((p) => p.endsWith('/SKILL.md'))).toBe(true);
  });
});

describe('roster — anchored, does NOT recurse into unrelated trees', () => {
  let tmp;
  afterEach(async () => {
    if (tmp) {
      await rm(tmp, { recursive: true, force: true });
      tmp = undefined;
    }
  });

  it('counts only the anchored top-level dirs (a nested .claude/ plugin tree is ignored)', async () => {
    tmp = await mkdtemp(join(tmpdir(), 'roster-'));
    // Real roster: 1 command, 1 agent, 1 skill.
    await mkdir(join(tmp, 'commands'), { recursive: true });
    await writeFile(join(tmp, 'commands', 'only.md'), '# only\n', 'utf-8');
    await mkdir(join(tmp, 'agents', 'scanners'), { recursive: true });
    await writeFile(join(tmp, 'agents', 'scanners', 'a.md'), '# a\n', 'utf-8');
    await mkdir(join(tmp, 'skills', 'define', 's'), { recursive: true });
    await writeFile(join(tmp, 'skills', 'define', 's', 'SKILL.md'), '# s\n', 'utf-8');
    // A duplicate plugin tree nested elsewhere — must NOT be counted.
    await mkdir(join(tmp, '.claude', 'worktrees', 'dup', 'commands'), { recursive: true });
    await writeFile(join(tmp, '.claude', 'worktrees', 'dup', 'commands', 'ghost.md'), '# ghost\n', 'utf-8');
    await mkdir(join(tmp, '.claude', 'worktrees', 'dup', 'agents'), { recursive: true });
    await writeFile(join(tmp, '.claude', 'worktrees', 'dup', 'agents', 'ghost.md'), '# ghost\n', 'utf-8');

    const r = roster(tmp);
    expect(r.counts).toEqual({ commands: 1, agents: 1, skills: 1 });
  });
});
