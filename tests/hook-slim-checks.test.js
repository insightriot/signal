// The two slim-Signal checks around a build (SLIM-SIGNAL.md pieces 2 and 5):
// show-open-items.js (UserPromptSubmit) and check-limits-filed.js (Stop), with open-items.js.

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkFiled, codeTokens, findTarget, governingDocs, limitLines, namesFile, outsideFiles, parseEntries, relevantItems, renderBeforeBuild, ruleSentences, shapeOf, shownItems, titleOf, untestedChecks } from '../plugin/tools/lib/open-items.js';

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
    expect(big).toMatch(/a name with no reason does not count\.\n.*Not as sentences inside the entry you mark done\.$/s);
  });

  it('lists each shown item with its lead, and does not take a restated item for a new limit', () => {
    expect(codeTokens('`GET /runs/latest-call` from `madeUpInCall`, `settings.values`, `facts`, `src/a.ts`')).toEqual(['/runs/latest-call', 'madeUpInCall', 'settings.values', 'src/a.ts']);
    const e = parseEntries(BACKLOG);
    const items = shownItems(relevantItems(findTarget('Planner: water reminders', e), e, parseEntries(BUGS)));
    // An item with no code name is kept: the done entry's limit.
    expect(items.map((i) => i.lead)).toEqual(['src/beds/Bed.tsx is too big.', 'the list is not remembered across visits.', 'Bed page loses its scroll position']);
    // Restating a shown item is not a new limit to file.
    expect(checkFiled({ message: ANSWERED, before: BACKLOG, after: BACKLOG, targetTitle: 'Planner: water reminders' }).ok).toBe(false);
    expect(checkFiled({ message: ANSWERED, before: BACKLOG, after: BACKLOG, targetTitle: 'Planner: water reminders', items }).ok).toBe(true);
    // A new limit in a shown item's file is still a new limit: the file name alone does not make it that item.
    const fresh = 'Known limits: drag reorder in `src/beds/Bed.tsx` is not handled yet.';
    expect(checkFiled({ message: `${ANSWERED}\n${fresh}`, before: BACKLOG, after: BACKLOG, targetTitle: 'Planner: water reminders', items })).toMatchObject({ ok: false, limits: [fresh] });
  });

  it('names an item with a short lead by its entry title', () => {
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
    // An empty body or a one-word lead falls back to the entry title; a "none" limit is left out.
    expect(items.map((i) => i.lead)).toEqual(['Dark mode', 'Tidy settings page', 'Fix UI']);
  });

  it('reads an item\'s shape, and asks for one before the build when it has none', () => {
    expect(shapeOf('Intro.\n**Files:** `src/a.ts`, `./src/b/`\nChecks:\n- one\n  - detail of one\n- two\nAfter.')).toEqual({ files: ['src/a.ts', 'src/b/'], checks: ['one', 'two'], drafted: false, picked: null });
    expect(shapeOf('Files: `src/a.ts`')).toEqual({ files: ['src/a.ts'], checks: [], drafted: false, picked: null });
    // A check that opens with its own label is still a check (run 11: every check was read as none).
    expect(shapeOf('Files: `src/a.ts`\nChecks:\n- Tools: one per intervention.\n- Results: found when inputs match.\nAdded while building: `src/b.ts`.').checks).toEqual(['Tools: one per intervention.', 'Results: found when inputs match.']);
    const e = parseEntries(BACKLOG);
    const t = findTarget('Planner: water reminders', e);
    const before = renderBeforeBuild(t, relevantItems(t, e, []));
    expect(before).toMatch(/^Signal: "Planner: water reminders" is not shaped yet\. Before you edit any code/);
    expect(before).toMatch(/tests everything that leaves: every message, route and tool result, not one field/);
    // Runs 9-11: a build that narrowed a rule fixed its line only after the end check pointed at it.
    expect(before).toMatch(/Each check names in backticks the test file that will hold it, or says "not testable by code" and why\. A never, always or only check is always testable: plant a marker value and check every way out, logs and error reports included\./);
    expect(before).toMatch(/If not, making it checkable is the first job in every size\./);
    // Runs 12-14: a sentence asking for a mid-build rule change to be rewritten in the next commit had no effect; the end check catches it.
    expect(before).not.toMatch(/during the build to change a rule/);
    expect(before).toMatch(/rewrite the line of any rule it changes in that same commit, before any code\./);
    const shaped = parseEntries(BACKLOG.replace('Send a reminder when a bed needs water.', 'Send a reminder when a bed needs water.\nFiles: `src/beds/`, `src/remind.ts`\nChecks:\n- a dry bed gets one reminder a day'));
    const st = findTarget('Planner: water reminders', shaped);
    expect(renderBeforeBuild(st, relevantItems(st, shaped, []))).not.toMatch(/during the build to change a rule/);
    expect(renderBeforeBuild(st, relevantItems(st, shaped, []))).toMatch(/^Signal: "Planner: water reminders" is shaped\. It expects to touch `src\/beds\/`, `src\/remind\.ts`, and lists 1 check\./);
  });

  it('finds the changed files outside the item\'s list, and whether the final message names them', () => {
    const listed = ['src/remind.ts', 'src/beds/'];
    expect(outsideFiles(listed, ['src/remind.ts', 'src/remind.test.ts', 'src/__tests__/remind.test.ts', 'src/beds/Bed.tsx', 'app/src/remind.ts', 'src/water.ts', 'package.json'])).toEqual(['src/water.ts', 'package.json']);
    expect(namesFile('- `water.ts`: a helper both pages need.', 'src/water.ts')).toBe(true);
    expect(namesFile('Changed sweetwater.ts.', 'src/water.ts')).toBe(false);
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

describe('sizes', () => {
  const SIZES = 'Send a reminder when a bed needs water.\nSizes:\n- as asked: one reminder.\n  Files: `src/remind.ts`\n  Checks:\n  - one a day (`src/remind.test.ts`)\n- deeper (recommended): snooze too.\n  Files: `src/remind.ts`, `src/snooze.ts`\n  Checks:\n  - one a day (`src/remind.test.ts`)\n  - snooze holds (`src/snooze.test.ts`)';
  it('reads drafted sizes as no shape yet, and only the picked size once one is picked', () => {
    // Three sizes each with Files: and Checks: must not read as one shape with their union.
    expect(shapeOf(SIZES)).toEqual({ files: [], checks: [], drafted: true, picked: null });
    expect(shapeOf(SIZES + '\n**Picked:** deeper\nFiles: `src/remind.ts`, `src/snooze.ts`\nChecks:\n- snooze holds (`src/snooze.test.ts`)')).toEqual({
      files: ['src/remind.ts', 'src/snooze.ts'],
      checks: ['snooze holds (`src/snooze.test.ts`)'],
      drafted: false,
      picked: 'deeper',
    });
    expect(shapeOf('Files: `a.ts`\nChecks:\n- one')).toEqual({ files: ['a.ts'], checks: ['one'], drafted: false, picked: null });
  });

  it('asks for sizes and a pick before code, and says when sizes wait on a pick', () => {
    const e = parseEntries(BACKLOG);
    const t = findTarget('Planner: water reminders', e);
    const before = renderBeforeBuild(t, relevantItems(t, e, []));
    expect(before).toMatch(/Under a `Sizes:` line, draft up to three sizes/);
    expect(before).toMatch(/\*As asked\*.*\*Deeper\*.*\*Higher\*.*Mark one recommended, and say why\./s);
    expect(before).toMatch(/Commit, ask the person to pick, and end your turn with no code\. If no person is available, pick the recommended size yourself/);
    expect(before).toMatch(/a new idea is filed as an open item, not built/);
    const d = parseEntries(BACKLOG.replace('Send a reminder when a bed needs water.', SIZES));
    const dt = findTarget('Planner: water reminders', d);
    expect(renderBeforeBuild(dt, relevantItems(dt, d, []))).toMatch(/^Signal: "Planner: water reminders" has sizes drafted and none picked\./);
    const p = parseEntries(BACKLOG.replace('Send a reminder when a bed needs water.', SIZES + '\nPicked: deeper\nFiles: `src/snooze.ts`\nChecks:\n- snooze holds'));
    const pt = findTarget('Planner: water reminders', p);
    expect(renderBeforeBuild(pt, relevantItems(pt, p, []))).toMatch(/^Signal: "Planner: water reminders" is shaped \(size picked: deeper\)\./);
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

  it('does not send the agent back for a shown item without a line of its own', () => {
    const dir = project();
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: dir });
    const session = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Planner: water reminders' });
    const r = run('check-limits-filed.js', { hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'Built the reminders. All tests pass.' });
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
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
    expect(run('check-limits-filed.js', { ...stop, session_id: s3, last_assistant_message: ANSWERED }).stderr).not.toMatch(/standing rules/);
  });

  it('holds the build to the item\'s Files: list, and asks for a shape when the build left none', () => {
    const dir = project();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'remind.ts'), 'export const a = 1;\n');
    writeFileSync(join(dir, 'src', 'water.ts'), 'export const w = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: dir });
    const session = randomUUID();
    const before = run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Planner: water reminders' });
    expect(before.stdout).toMatch(/is not shaped yet/);
    writeFileSync(join(dir, 'src', 'remind.ts'), 'export const a = 2;\n');
    writeFileSync(join(dir, 'src', 'water.ts'), 'export const w = 2;\n');
    const stop = { hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'Built the reminders.' };
    const unshaped = run('check-limits-filed.js', stop);
    expect(unshaped.status).toBe(2);
    expect(unshaped.stderr).toMatch(/still has no `Files:` list and `Checks:` bullets/);

    // Shaped during the build: a file outside the list is sent back once, unless the message names it.
    writeFileSync(join(dir, '.planning', 'BACKLOG.md'), BACKLOG.replace('Send a reminder when a bed needs water.', 'Send a reminder when a bed needs water.\nFiles: `src/remind.ts`\nChecks:\n- a dry bed gets one reminder a day'));
    const s2 = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: s2, cwd: dir, prompt: 'Planner: water reminders' });
    const outside = run('check-limits-filed.js', { ...stop, session_id: s2 });
    expect(outside.status).toBe(2);
    expect(outside.stderr).toMatch(/touches 1 file outside the item's `Files:` list.*\n- src\/water\.ts\n/);
    expect(outside.stderr).not.toMatch(/still has no/);
    const s3 = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: s3, cwd: dir, prompt: 'Planner: water reminders' });
    const named = run('check-limits-filed.js', { ...stop, session_id: s3, last_assistant_message: 'Built it.\n- `water.ts`: the reminder reads the soil level from it.' });
    expect(named.stderr).not.toMatch(/outside the item's/);
    // ...but its one check names no test file the build changed.
    expect(named.status).toBe(2);
    expect(named.stderr).toMatch(/1 of the item's checks names no test file this build changed:\n- a dry bed gets one reminder a day\n/);

    // A check that names a changed test file passes.
    writeFileSync(join(dir, '.planning', 'BACKLOG.md'), BACKLOG.replace('Send a reminder when a bed needs water.', 'Send a reminder when a bed needs water.\nFiles: `src/remind.ts`, `src/water.ts`\nChecks:\n- a dry bed gets one reminder a day (`src/remind.test.ts`)'));
    writeFileSync(join(dir, 'src', 'remind.test.ts'), 'test;\n');
    const s4 = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: s4, cwd: dir, prompt: 'Planner: water reminders' });
    // The test file is new and not yet committed; it still counts.
    expect(run('check-limits-filed.js', { ...stop, session_id: s4 }).status).toBe(0);
  });

  it('lets a turn end to ask for a pick, carries the item into the reply, and sends back code built before a pick', () => {
    const SIZES = 'Send a reminder when a bed needs water.\nSizes:\n- as asked (recommended): one reminder.\n  Files: `src/remind.ts`\n  Checks:\n  - one a day (`src/remind.test.ts`)\n- deeper: snooze.\n  Files: `src/snooze.ts`\n  Checks:\n  - snooze holds';
    const dir = project();
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'remind.ts'), 'export const a = 1;\n');
    execFileSync('git', ['add', '-A'], { cwd: dir });
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base'], { cwd: dir });
    const session = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Planner: water reminders' });
    // The agent drafts sizes in the records only and asks: the stop passes.
    writeFileSync(join(dir, '.planning', 'BACKLOG.md'), BACKLOG.replace('Send a reminder when a bed needs water.', SIZES));
    const stop = { hook_event_name: 'Stop', session_id: session, cwd: dir, last_assistant_message: 'Which size? I recommend as asked.' };
    expect(run('check-limits-filed.js', stop).status).toBe(0);
    // The person's reply names no item; the before-build text still comes, about the same item.
    const reply = run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: session, cwd: dir, prompt: 'Go with your recommendation.' });
    expect(reply.stdout).toMatch(/^Signal: "Planner: water reminders" has sizes drafted and none picked\./);
    // Code changed with no pick written: sent back.
    writeFileSync(join(dir, 'src', 'remind.ts'), 'export const a = 2;\n');
    const built = run('check-limits-filed.js', { ...stop, last_assistant_message: 'Built it.' });
    expect(built.status).toBe(2);
    expect(built.stderr).toMatch(/has sizes drafted and none picked, and this build changed code/);
    // Picked: the picked size's check is held to a test.
    writeFileSync(join(dir, '.planning', 'BACKLOG.md'), BACKLOG.replace('Send a reminder when a bed needs water.', SIZES + '\nPicked: as asked\nFiles: `src/remind.ts`\nChecks:\n- one a day (`src/remind.test.ts`)'));
    const s2 = randomUUID();
    run('show-open-items.js', { hook_event_name: 'UserPromptSubmit', session_id: s2, cwd: dir, prompt: 'Planner: water reminders' });
    const picked = run('check-limits-filed.js', { ...stop, session_id: s2, last_assistant_message: 'Built it.' });
    expect(picked.stderr).toMatch(/1 of the item's checks names no test file this build changed:\n- one a day/);
    expect(picked.stderr).not.toMatch(/snooze/);
  });

  it('finds the checks with no test behind them in the change', () => {
    const changed = ['app/src/remind.ts', 'app/src/remind.test.ts', 'app/tests/water.js'];
    expect(
      untestedChecks(
        [
          'a dry bed gets one reminder (`src/remind.test.ts`)',
          'water level read (`tests/water.js`)',
          'logged never (`src/log.test.ts`)',
          'no test named at all',
          'names a source file only (`src/remind.ts`)',
          'the email reads well: not testable by code, it is a judgement',
          'tool calls are never logged: not testable by code',
        ],
        changed,
      ),
    ).toEqual(['logged never (`src/log.test.ts`)', 'no test named at all', 'names a source file only (`src/remind.ts`)', 'tool calls are never logged: not testable by code']);
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
