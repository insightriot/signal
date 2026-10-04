// M6.E13/t5.1 (AC5.1) — the PreToolUse guard against hand edits of a v2 work
// store. Spawns plugin/hooks/check-state-write.js with a hook event on stdin,
// as hook-check-state-write-spawn.test.js does, and drives the same edit set
// through three projects: store off (hand-kept views), a v1 store and a v2
// store. Only the v2 store blocks. The STATE.md cases live in the existing
// spawn test, which this task leaves untouched.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, symlinkSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { protectedTarget } from '../plugin/tools/lib/work-write-guard.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'plugin', 'hooks', 'check-state-write.js');
const HOOKS_JSON = join(__dirname, '..', 'plugin', 'hooks', 'hooks.json');

function runRaw(input) {
  const r = spawnSync('node', [HOOK], { encoding: 'utf-8', input });
  return { status: r.status, stderr: (r.stderr ?? '').toString() };
}
const runHook = (event) => runRaw(JSON.stringify(event));

const edit = (file_path, cwd) => ({
  tool_name: 'Edit',
  cwd,
  tool_input: { file_path, old_string: 'a', new_string: 'b' },
});
const write = (file_path, cwd) => ({ tool_name: 'Write', cwd, tool_input: { file_path, content: 'x\n' } });
const multi = (file_path, cwd) => ({
  tool_name: 'MultiEdit',
  cwd,
  tool_input: { file_path, edits: [{ old_string: 'a', new_string: 'b' }] },
});

// Repo-relative paths. Every one is a protected target in a v2 store.
const PROTECTED = [
  '.planning/work/items/00/SIG-1.json',
  '.planning/work/items/01/SIG-1001.json',
  '.planning/BUGS.md',
  '.planning/BACKLOG.md',
  '.planning/ISSUES-INBOX.md',
  '.planning/OPEN-QUESTIONS.md',
  '.planning/work/EPICS.md',
  '.planning/work/history/2026-10.md',
];
// Never protected.
const ALLOWED = [
  '.planning/work/items/00/SIG-1.md',
  '.planning/WATCHLIST.md',
  '.planning/work/WORK.md',
  '.planning/DECISIONS.md',
  '.planning/archive/pre-work-store-v2/BUGS.md',
  '.planning/work/history/sub/x.md',
  'src/BUGS.md',
  'README.md',
];

function makeProject(store) {
  const dir = mkdtempSync(join(tmpdir(), 'sig-guard-'));
  mkdirSync(join(dir, '.planning', 'work', 'items', '00'), { recursive: true });
  mkdirSync(join(dir, '.planning', 'work', 'history'), { recursive: true });
  for (const v of ['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md', 'WATCHLIST.md']) {
    writeFileSync(join(dir, '.planning', v), `# ${v}\n\nhand-kept\n`);
  }
  writeFileSync(join(dir, '.planning', 'work', 'items', '00', 'SIG-1.json'), '{}\n');
  writeFileSync(join(dir, '.planning', 'work', 'items', '00', 'SIG-1.md'), 'body\n');
  if (store === 'v1') writeFileSync(join(dir, '.planning', 'work', 'WORK.md'), '---\nkey: SIG\n---\n');
  if (store === 'v1-explicit') writeFileSync(join(dir, '.planning', 'work', 'WORK.md'), '---\nkey: SIG\nschema_version: 1\n---\n');
  if (store === 'v2') writeFileSync(join(dir, '.planning', 'work', 'WORK.md'), '---\nkey: SIG\nschema_version: 2\n---\n');
  return dir;
}

describe('hooks.json — the guard sees MultiEdit', () => {
  it('the PreToolUse matcher is Edit|Write|MultiEdit', () => {
    const cfg = JSON.parse(readFileSync(HOOKS_JSON, 'utf-8'));
    const entry = cfg.hooks.PreToolUse.find((e) => e.hooks.some((h) => h.command.includes('check-state-write.js')));
    expect(entry.matcher).toBe('Edit|Write|MultiEdit');
  });
});

describe.each([['store off', null], ['v1 store (no schema_version)', 'v1'], ['v1 store (schema_version: 1)', 'v1-explicit']])(
  'work write guard — %s: never blocks',
  (_label, store) => {
    let dir;
    beforeEach(() => { dir = makeProject(store); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it.each([...PROTECTED, ...ALLOWED])('allows Edit, Write and MultiEdit of %s', (rel) => {
      for (const ev of [edit, write, multi]) {
        const { status, stderr } = runHook(ev(join(dir, rel)));
        expect(status, `${ev.name} ${rel}: ${stderr}`).toBe(0);
        expect(stderr).toBe('');
      }
    });
  },
);

describe('work write guard — v2 store', () => {
  let dir;
  beforeEach(() => { dir = makeProject('v2'); });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it.each(PROTECTED)('blocks Edit, Write and MultiEdit of %s (exit 2, names /sig:item)', (rel) => {
    for (const ev of [edit, write, multi]) {
      const { status, stderr } = runHook(ev(join(dir, rel)));
      expect(status, `${ev.name} ${rel}`).toBe(2);
      expect(stderr).toMatch(/^\[signal:check-state-write\] /);
      expect(stderr).toContain('/sig:item');
      expect(stderr).toMatch(/regenerat/);
      expect(stderr).toMatch(/body/);
      // A record is not generated: it is written through /sig:item (VERIFY loop 1).
      expect(stderr).toContain('written only through /sig:item');
      expect(stderr).not.toContain(`${rel} is generated`);
    }
  });

  it.each(ALLOWED)('allows %s', (rel) => {
    for (const ev of [edit, write, multi]) {
      const { status, stderr } = runHook(ev(join(dir, rel)));
      expect(status, `${ev.name} ${rel}: ${stderr}`).toBe(0);
    }
  });

  it('blocks a new record that does not exist yet (realpath of the nearest parent)', () => {
    expect(runHook(write(join(dir, '.planning/work/items/07/SIG-7001.json'))).status).toBe(2);
  });

  it('resolves a relative file_path against the event cwd', () => {
    expect(runHook(edit('.planning/BUGS.md', dir)).status).toBe(2);
    expect(runHook(edit('work/items/00/SIG-1.json', join(dir, '.planning'))).status).toBe(2);
    expect(runHook(edit('BUGS.md', join(dir, '.planning'))).status).toBe(2);
    expect(runHook(edit('.planning/work/items/00/SIG-1.md', dir)).status).toBe(0);
  });

  it('blocks a path that reaches a target through ..', () => {
    expect(runHook(edit(join(dir, '.planning/work/items/../../BUGS.md'))).status).toBe(2);
  });

  it('blocks through a symlinked .planning directory', () => {
    const outer = mkdtempSync(join(tmpdir(), 'sig-guard-link-'));
    try {
      symlinkSync(join(dir, '.planning'), join(outer, '.planning'));
      expect(runHook(edit(join(outer, '.planning/work/items/00/SIG-1.json'))).status).toBe(2);
      expect(runHook(edit(join(outer, '.planning/BACKLOG.md'))).status).toBe(2);
      expect(runHook(edit(join(outer, '.planning/work/items/00/SIG-1.md'))).status).toBe(0);
    } finally {
      rmSync(outer, { recursive: true, force: true });
    }
  });

  it('an alias without .planning in its name is not caught by the hook (prefilter); protectedTarget still classifies it', () => {
    symlinkSync(join(dir, '.planning'), join(dir, 'plan-alias'));
    // The cheap prefilter looks for ".planning" in the resolved path, so an
    // alias without it is only caught when the path names .planning somewhere.
    // Here the realpath candidate is what matches.
    expect(runHook(edit(join(dir, '.planning', '..', 'plan-alias', 'BUGS.md'))).status).toBe(0);
    expect(protectedTarget(join(dir, 'plan-alias', 'BUGS.md'))).toMatchObject({ blocked: true });
  });

  it('blocks an upper-case path on a case-insensitive filesystem', (ctx) => {
    if (!existsSync(join(dir, '.PLANNING', 'BUGS.md'))) {
      ctx.skip('the temp filesystem is case-sensitive: .PLANNING is a different directory there');
      return;
    }
    expect(runHook(edit(join(dir, '.Planning/Work/Items/00/SIG-1.JSON'))).status).toBe(2);
    expect(runHook(edit(join(dir, '.PLANNING/bugs.md'))).status).toBe(2);
    expect(runHook(edit(join(dir, '.Planning/Work/Items/00/SIG-1.MD'))).status).toBe(0);
  });

  it('a WORK.md that cannot be read fails open', () => {
    writeFileSync(join(dir, '.planning', 'work', 'WORK.md'), '---\nkey: [unclosed\n---\n');
    expect(runHook(edit(join(dir, '.planning/BUGS.md'))).status).toBe(0);
  });

  it('an unknown schema_version fails open', () => {
    writeFileSync(join(dir, '.planning', 'work', 'WORK.md'), '---\nkey: SIG\nschema_version: 3\n---\n');
    expect(runHook(edit(join(dir, '.planning/BUGS.md'))).status).toBe(0);
  });

  it('ignores other tools', () => {
    const ev = { tool_name: 'Read', tool_input: { file_path: join(dir, '.planning/BUGS.md') } };
    expect(runHook(ev).status).toBe(0);
  });

  it('STATE.md writes get the same verdict and stderr in a v2 store as in a store-off project', () => {
    const off = makeProject(null);
    try {
      const clean = '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases:\n  - DISCUSS (2026-07-13)\nblockers: []\n---\nbody\n';
      const prose = '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncompleted_phases:\n  - "**Active: a long multi-line narrative that keeps\n    rambling across physical lines and never belongs here"\nblockers: []\n---\nbody\n';
      for (const content of [clean, prose]) {
        const ev = (d) => ({ tool_name: 'Write', tool_input: { file_path: join(d, '.planning/STATE.md'), content } });
        const a = runHook(ev(off));
        const b = runHook(ev(dir));
        expect(b.status).toBe(a.status);
        expect(b.stderr).toBe(a.stderr);
      }
      // The prose case is the shape check's block, so both runs judged it.
      expect(runHook({ tool_name: 'Write', tool_input: { file_path: join(dir, '.planning/STATE.md'), content: prose } }).status).toBe(2);
    } finally {
      rmSync(off, { recursive: true, force: true });
    }
  });
});

describe('work write guard — malformed events fail open', () => {
  it.each([
    ['empty stdin', ''],
    ['not JSON', '{nope'],
    ['no tool_input', JSON.stringify({ tool_name: 'Edit' })],
    ['file_path not a string', JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: 7 } })],
    ['cwd not a string', JSON.stringify({ tool_name: 'Edit', cwd: 7, tool_input: { file_path: 'x/.planning/BUGS.md' } })],
  ])('%s → exit 0', (_label, input) => {
    expect(runRaw(input).status).toBe(0);
  });
});
