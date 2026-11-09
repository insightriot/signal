// The two slim-Signal checks around a build (SLIM-SIGNAL.md pieces 2 and 5):
// show-open-items.js (UserPromptSubmit) and check-limits-filed.js (Stop), with open-items.js.

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkFiled, findTarget, limitLines, parseEntries, relevantItems, titleOf } from '../plugin/tools/lib/open-items.js';

const HOOKS = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks');

const BACKLOG = `# Backlog

## Garden planner

### Planner: water reminders · **roadmap** · small
Send a reminder when a bed needs water.

### ~~Planner: plant list per bed · **roadmap** · small~~ · **DONE — 2026-11-01**
Built. Known limits: the list is not remembered across visits.

### Planner review follow-ups · **hygiene** · small
- \`src/beds/Bed.tsx\` is too big.

## Accounts

### Accounts: sign-in with a code · **roadmap** · small
Codes by email.
`;

const BUGS = `# Bugs

## Bed page loses its scroll position
Seen in \`src/beds/Bed.tsx\`.

## Avatar upload fails on large files
In \`src/accounts/avatar.ts\`.
`;

describe('open-items.js', () => {
  it('reads entries with their section and whether they are done', () => {
    const e = parseEntries(BACKLOG);
    const done = e.find((x) => x.title === 'Planner: plant list per bed');
    expect(done).toMatchObject({ done: true, section: 'Garden planner', level: 3 });
    expect(e.find((x) => x.title === 'Accounts: sign-in with a code').section).toBe('Accounts');
    expect(titleOf('#12 — Fix the thing · **hygiene** · small')).toBe('Fix the thing');
  });

  it('finds the entry a prompt names, and never a short heading', () => {
    const e = parseEntries(BACKLOG);
    expect(findTarget('Build this item:\n### Planner: water reminders · **roadmap** · small\nSend…', e)?.title).toBe('Planner: water reminders');
    expect(findTarget('what is the weather like', e)).toBeNull();
    expect(findTarget('fix bugs', parseEntries('## A\n### Bugs\n'))).toBeNull();
  });

  it('shows the rest of the section, open and done, and bugs naming a file the section names', () => {
    const e = parseEntries(BACKLOG);
    const r = relevantItems(findTarget('Planner: water reminders', e), e, parseEntries(BUGS));
    expect(r.open.map((x) => x.title)).toEqual(['Planner review follow-ups']);
    expect(r.done.map((x) => x.title)).toEqual(['Planner: plant list per bed']);
    expect(r.bugs.map((x) => x.title)).toEqual(['Bed page loses its scroll position']);
  });

  it('finds limit lines, including bullets under a limits label, and not ordinary lines', () => {
    const msg = 'Built the reminders.\n\nKnown limits:\n- Only one reminder per bed.\n- Times are UTC.\n\nAll tests pass.\nI haven\'t tried it on a phone.';
    expect(limitLines(msg)).toEqual(['Only one reminder per bed.', 'Times are UTC.', "I haven't tried it on a phone."]);
    expect(limitLines('Built it. All 40 tests pass and lint is clean.')).toEqual([]);
  });

  it('passes when a new open entry is added, or the entry stays open with the limits; flags limits buried in a done entry', () => {
    const msg = 'Known limits:\n- Only one reminder per bed.';
    const filed = BACKLOG + '\n### Planner: water reminders follow-ups · **hygiene** · small\n- Only one reminder per bed.\n';
    expect(checkFiled({ message: msg, before: BACKLOG, after: filed, targetTitle: 'Planner: water reminders' }).ok).toBe(true);
    const keptOpen = BACKLOG.replace('Send a reminder when a bed needs water.', 'Send a reminder.\nKnown limits: only one reminder per bed.');
    expect(checkFiled({ message: msg, before: BACKLOG, after: keptOpen, targetTitle: 'Planner: water reminders' }).ok).toBe(true);
    const buried = BACKLOG.replace(
      '### Planner: water reminders · **roadmap** · small\nSend a reminder when a bed needs water.',
      '### ~~Planner: water reminders · **roadmap** · small~~ · **DONE**\nBuilt. Known limits: only one reminder per bed.',
    );
    expect(checkFiled({ message: msg, before: BACKLOG, after: buried, targetTitle: 'Planner: water reminders' })).toMatchObject({ ok: false, buried: true });
    expect(checkFiled({ message: 'Done, all green.', before: BACKLOG, after: buried, targetTitle: 'Planner: water reminders' }).ok).toBe(true);
  });
});

function project() {
  const dir = mkdtempSync(join(tmpdir(), 'slim-checks-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, '.planning'));
  writeFileSync(join(dir, '.planning', 'BACKLOG.md'), BACKLOG);
  writeFileSync(join(dir, '.planning', 'BUGS.md'), BUGS);
  return dir;
}
const run = (hook, event) => spawnSync('node', [join(HOOKS, hook)], { input: JSON.stringify(event), encoding: 'utf8' });

describe('show-open-items.js and check-limits-filed.js', () => {
  it('prints the section before a build, and sends the agent back once when limits are not filed', () => {
    const dir = project();
    const session = randomUUID();
    const before = run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Build this: Planner: water reminders' });
    expect(before.status).toBe(0);
    expect(before.stdout).toMatch(/Planner review follow-ups/);
    expect(before.stdout).toMatch(/not remembered across visits/);
    expect(before.stdout).toMatch(/Bed page loses its scroll position/);
    expect(before.stdout).not.toMatch(/sign-in with a code/);

    const stop = { hook_event_name: 'Stop', session_id: session, cwd: dir, stop_hook_active: false, last_assistant_message: 'Known limits:\n- Only one reminder per bed.' };
    const first = run('check-limits-filed.js', stop);
    expect(first.status).toBe(2);
    expect(first.stderr).toMatch(/Only one reminder per bed/);
    expect(run('check-limits-filed.js', { ...stop, stop_hook_active: true }).status).toBe(0);
    expect(run('check-limits-filed.js', stop).status).toBe(0); // checked once per build
  });

  it('lets the stop happen once the limit is filed', () => {
    const dir = project();
    const session = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Planner: water reminders' });
    writeFileSync(join(dir, '.planning', 'BACKLOG.md'), BACKLOG + '\n### Reminder follow-ups · **hygiene** · small\n- One per bed.\n');
    const r = run('check-limits-filed.js', { hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'Known limits:\n- One per bed.' });
    expect(r.status).toBe(0);
  });

  it('does nothing for a prompt that names no entry, or a project with no BACKLOG.md', () => {
    const dir = project();
    const session = randomUUID();
    expect(run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'explain this repo' }).stdout).toBe('');
    expect(run('check-limits-filed.js', { hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'Known limits:\n- x' }).status).toBe(0);
    const bare = mkdtempSync(join(tmpdir(), 'slim-bare-'));
    execFileSync('git', ['init', '-q'], { cwd: bare });
    expect(run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: bare, prompt: 'Planner: water reminders' }).stdout).toBe('');
  });
});
