// The two slim-Signal checks around a build (SLIM-SIGNAL.md pieces 2 and 5):
// show-open-items.js (UserPromptSubmit) and check-limits-filed.js (Stop), with open-items.js.

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkFiled, codeTokens, findTarget, governingDocs, limitLines, parseEntries, relevantItems, renderBeforeBuild, ruleSentences, shownItems, titleOf, unaddressedItems } from '../plugin/tools/lib/open-items.js';

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

const ANSWERED = [
  '- `src/beds/Bed.tsx` is too big: left, because splitting it is a separate job that needs its own tests.',
  '- Bed page loses its scroll position: left, because the reminders never render on that page.',
  '- The list is not remembered across visits: left, because remembering it needs accounts first.',
].join('\n');

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

  it('keeps the before-build text short: bullet leads with their code names, done items as their limits only', () => {
    const e = parseEntries(BACKLOG);
    const t = findTarget('Planner: water reminders', e);
    const text = renderBeforeBuild(t, relevantItems(t, e, parseEntries(BUGS)));
    expect(text).toMatch(/- `?src\/beds\/Bed\.tsx`? is too big\.? \[src\/beds\/Bed\.tsx\]  \(line 12\)/);
    expect(text).toMatch(/- Built\. Known limits: the list is not remembered across visits\./);
    const long = BACKLOG.replace('- `src/beds/Bed.tsx` is too big.', Array.from({ length: 400 }, (_, i) => `- **Item ${i}.** ${'words '.repeat(30)}`).join('\n'));
    const le = parseEntries(long);
    const lt = findTarget('Planner: water reminders', le);
    const big = renderBeforeBuild(lt, relevantItems(lt, le, []));
    expect(big.length).toBeLessThan(10000);
    expect(big).toMatch(/without its own line sends you back once\.\n.*Not as sentences inside the entry you mark done\.$/s);
  });

  it('wants each shown item on its own line with a reason; a shared line or a bare name counts for none', () => {
    expect(codeTokens('`GET /runs/latest-call` from `madeUpInCall`, `settings.values`, `facts`, `src/a.ts`')).toEqual(['/runs/latest-call', 'madeUpInCall', 'settings.values', 'src/a.ts']);
    const e = parseEntries(BACKLOG);
    const items = shownItems(relevantItems(findTarget('Planner: water reminders', e), e, parseEntries(BUGS)));
    // An item with no code name is kept: the done entry's limit.
    expect(items.map((i) => i.lead)).toEqual(['src/beds/Bed.tsx is too big.', 'the list is not remembered across visits.', 'Bed page loses its scroll position']);
    const base = { items, files: ['src/beds/Bed.tsx'], diff: '+ x', after: BACKLOG + BUGS };
    const leads = (message, extra = {}) => unaddressedItems({ ...base, ...extra, message }).map((m) => m.lead);
    // Items whose code the change touched come first.
    expect(unaddressedItems({ ...base, message: 'Built the reminders. Left the rest as they are.' }).map((m) => [m.lead, m.token])).toEqual([
      ['src/beds/Bed.tsx is too big.', 'src/beds/Bed.tsx'],
      ['Bed page loses its scroll position', 'src/beds/Bed.tsx'],
      ['the list is not remembered across visits.', undefined],
    ]);
    expect(leads(ANSWERED)).toEqual([]);
    // One line naming two items counts for neither.
    expect(leads('- Left `src/beds/Bed.tsx` and the bed page scroll position: both need a design pass first.\n- The list is not remembered across visits: left, because it needs accounts first.')).toEqual([
      'src/beds/Bed.tsx is too big.',
      'Bed page loses its scroll position',
    ]);
    // A bare name, or a status with no reason, does not count.
    for (const line of ['`src/beds/Bed.tsx`: left.', '`src/beds/Bed.tsx`: still true.', '`src/beds/Bed.tsx`: carried into the new entry.', '`src/beds/Bed.tsx`: left, it matters more now.'])
      expect(leads(line)).toContain('src/beds/Bed.tsx is too big.');
    // Restating a shown item is not a new limit to file.
    expect(checkFiled({ message: ANSWERED, before: BACKLOG, after: BACKLOG, targetTitle: 'Planner: water reminders' }).ok).toBe(false);
    expect(checkFiled({ message: ANSWERED, before: BACKLOG, after: BACKLOG, targetTitle: 'Planner: water reminders', items }).ok).toBe(true);
    // A new limit in a shown item's file is still a new limit: the file name alone does not make it that item.
    const fresh = 'Known limits: drag reorder in `src/beds/Bed.tsx` is not handled yet.';
    expect(checkFiled({ message: `${ANSWERED}\n${fresh}`, before: BACKLOG, after: BACKLOG, targetTitle: 'Planner: water reminders', items })).toMatchObject({ ok: false, limits: [fresh] });
    // Fixed or rewritten in the records: dealt with.
    expect(leads('Done.', { after: '' })).toEqual([]);
    // A long message does not match a lead by chance: the words must sit on one line.
    expect(leads('The page loads.\nIts scroll is fine.\nPosition kept.\nNothing loses.')).toHaveLength(3);
  });

  it('never shows an item the end check could not see answered', () => {
    const md = `# Backlog

## Garden planner

### Planner: water reminders · small
Send a reminder when a bed needs water.

### Dark mode · small

### Tidy settings page · small
Tidy.

### Fix UI · small
Fix UI.

### ~~Planner: seed list · small~~ · **DONE — 2026-11-01**
Built. Known limits: none yet.
`;
    const e = parseEntries(md);
    const items = shownItems(relevantItems(findTarget('Planner: water reminders', e), e, []));
    // An empty body or a one-word lead falls back to the entry title; a title of short words and a "none" limit are left out.
    expect(items.map((i) => i.lead)).toEqual(['Dark mode', 'Tidy settings page']);
    const left = (message) => unaddressedItems({ items, files: [], diff: '', message, after: md }).map((m) => m.lead);
    expect(left('Done.')).toEqual(['Dark mode', 'Tidy settings page']);
    expect(left('- Dark mode: left, because the theme work has not started anywhere yet.\n- Tidy settings page: left, because water reminders never appear on the settings screen.')).toEqual([]);
    // An empty-bodied item is dealt with once its heading leaves the records.
    expect(unaddressedItems({ items, files: [], diff: '', message: 'Done.', after: '' })).toEqual([]);
  });

  it('finds rule sentences in a doc, and the instruction files that govern the changed files', () => {
    const md = '# Lib\n\n- **`call`:** the whole call. Its values are typed in the form; the agent is never sent them. Each turn writes a phase.\n- Plain line.\n```\nnever in a fence\n```\nAlways Node runtime.\n';
    expect(ruleSentences(md)).toEqual([
      { line: 3, text: 'Its values are typed in the form; the agent is never sent them.' },
      { line: 8, text: 'Always Node runtime.' },
    ]);
    const docs = ['AGENTS.md', 'src/AGENTS.md', 'src/lib/AGENTS.md', 'src/app/CLAUDE.md', 'src/lib/notes.md', 'docs/AGENTS.md'];
    // The top level is left out: every session reads it already.
    expect(governingDocs(['src/lib/rehearsal/engine.ts'], docs)).toEqual(['src/AGENTS.md', 'src/lib/AGENTS.md']);
    expect(governingDocs(['README.ts'], docs)).toEqual([]);
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

  it('sends the agent back once when a shown item has no line of its own, and lets it go once each has one', () => {
    const dir = project();
    mkdirSync(join(dir, 'src', 'beds'), { recursive: true });
    writeFileSync(join(dir, 'src', 'beds', 'Bed.tsx'), 'export const Bed = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: dir });
    const session = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Planner: water reminders' });
    writeFileSync(join(dir, 'src', 'beds', 'Bed.tsx'), 'export const Bed = 2;\n');
    const stop = { hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'Built the reminders. All tests pass.' };
    const r = run('check-limits-filed.js', stop);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/3 items shown before the build have no line of their own in your final message/);
    expect(r.stderr).toMatch(/- "Bed page loses its scroll position" \(Bed page loses its scroll position; your change touches `src\/beds\/Bed\.tsx`\)/);
    expect(r.stderr).toMatch(/- "the list is not remembered across visits\." \(Planner: plant list per bed\)\n/);
    expect(r.stderr).toMatch(/A line naming several items counts for none of them/);
    expect(run('check-limits-filed.js', { ...stop, stop_hook_active: true }).status).toBe(0);

    const s2 = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: s2, cwd: dir, prompt: 'Planner: water reminders' });
    const named = run('check-limits-filed.js', { ...stop, session_id: s2, last_assistant_message: `Built it.\n${ANSWERED}` });
    expect(named.status).toBe(0);
  });

  it('shows the rules of the folders the build changed, once, and not a rule the agent rewrote', () => {
    const dir = project();
    mkdirSync(join(dir, 'src', 'lib'), { recursive: true });
    writeFileSync(join(dir, 'AGENTS.md'), 'Never push to main.\n');
    writeFileSync(join(dir, 'src', 'lib', 'AGENTS.md'), '- Typed answers go to the person; the agent is never sent them.\n- Always Node runtime.\n');
    writeFileSync(join(dir, 'src', 'lib', 'tools.ts'), 'export const answer = () => null;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: dir });
    const session = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Planner: water reminders' });
    writeFileSync(join(dir, 'src', 'lib', 'tools.ts'), 'export const answer = (typed) => typed;\n');
    const stop = { hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'Built the reminders. All tests pass.' };
    const r = run('check-limits-filed.js', stop);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/the agent is never sent them\. \(src\/lib\/AGENTS\.md, line 1\)/);
    expect(r.stderr).toMatch(/Always Node runtime/);
    expect(r.stderr).not.toMatch(/Never push to main/);
    expect(run('check-limits-filed.js', { ...stop, stop_hook_active: true }).status).toBe(0);

    // The agent rewrote one rule and the other stays: only the one left is shown.
    const s2 = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: s2, cwd: dir, prompt: 'Planner: water reminders' });
    writeFileSync(join(dir, 'src', 'lib', 'AGENTS.md'), '- Typed answers go to the person, and to the agent through a lookup.\n- Always Node runtime.\n');
    const second = run('check-limits-filed.js', { ...stop, session_id: s2 });
    expect(second.status).toBe(2);
    expect(second.stderr).not.toMatch(/never sent them/);
    expect(second.stderr).toMatch(/Always Node runtime/);

    // A change outside any folder with an instruction file shows no rules.
    const s3 = randomUUID();
    execFileSync('git', ['checkout', '-q', '--', 'src'], { cwd: dir });
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: s3, cwd: dir, prompt: 'Planner: water reminders' });
    writeFileSync(join(dir, 'top.ts'), 'export {};\n');
    expect(run('check-limits-filed.js', { ...stop, session_id: s3, last_assistant_message: ANSWERED }).status).toBe(0);
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
