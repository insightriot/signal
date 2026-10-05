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
  '.planning/DECISIONS.md',
  '.planning/archive/pre-work-store-v2/BUGS.md',
  '.planning/work/history/sub/x.md',
  'src/BUGS.md',
  'README.md',
];
// The switch itself: blocked on a v2 store with its own message (REVIEW I7 —
// setting schema_version by hand would turn the guard off), allowed elsewhere.
const WORK_MD = '.planning/work/WORK.md';

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

    it.each([...PROTECTED, ...ALLOWED, WORK_MD])('allows Edit, Write and MultiEdit of %s', (rel) => {
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

  it('an alias without .planning in its name is caught: the prefilter tests the realpath too (REVIEW suggestion)', () => {
    symlinkSync(join(dir, '.planning'), join(dir, 'plan-alias'));
    symlinkSync(join(dir, '.planning', 'work', 'items'), join(dir, 'notes'));
    expect(runHook(edit(join(dir, 'plan-alias', 'BUGS.md'))).status).toBe(2);
    expect(runHook(edit(join(dir, 'notes', '00', 'SIG-1.json'))).status).toBe(2);
    expect(runHook(write(join(dir, 'notes', '05', 'SIG-5001.json'))).status).toBe(2); // not there yet
    expect(runHook(edit('notes/00/SIG-1.json', dir)).status).toBe(2); // relative to the event cwd
    expect(runHook(edit(join(dir, 'notes', '00', 'SIG-1.md'))).status).toBe(0); // a body stays editable
    expect(protectedTarget(join(dir, 'plan-alias', 'BUGS.md'))).toMatchObject({ blocked: true });
  });

  // REVIEW I7, narrowed in loop 1 part B: only an edit that would change or
  // remove `schema_version: 2` (it switches the guard off) or the `key:` line
  // (it orphans every record) is blocked. Any other WORK.md text edit is allowed.
  describe('work/WORK.md: only a change to schema_version: 2 or the key is blocked', () => {
    const BODY = '---\nkey: SIG\nschema_version: 2\n---\n\nSome prose.\n';
    const at = () => join(dir, WORK_MD);
    const ed = (old_string, new_string, extra = {}) => ({ tool_name: 'Edit', tool_input: { file_path: at(), old_string, new_string, ...extra } });
    const wr = (content) => ({ tool_name: 'Write', tool_input: { file_path: at(), content } });
    const me = (edits) => ({ tool_name: 'MultiEdit', tool_input: { file_path: at(), edits } });
    beforeEach(() => writeFileSync(at(), BODY));

    const expectBlocked = (event) => {
      const { status, stderr } = runHook(event);
      expect(status).toBe(2);
      expect(stderr).toMatch(/^\[signal:check-state-write\] /);
      expect(stderr).toContain('schema_version');
      expect(stderr).toContain('/sig:item');
      expect(stderr).toContain('work-migrate-v2');
    };
    const expectAllowed = (event) => {
      const { status, stderr } = runHook(event);
      expect(status, stderr).toBe(0);
    };

    it('Edit changing schema_version to 1 is blocked', () => expectBlocked(ed('schema_version: 2', 'schema_version: 1')));
    it('Edit removing the schema_version line is blocked', () => expectBlocked(ed('schema_version: 2\n', '')));
    it('Edit breaking the frontmatter (so no version can be read) is blocked', () => expectBlocked(ed('---\nkey', 'key')));
    it('Edit with replace_all that rewrites the version is blocked', () => expectBlocked(ed('2', '3', { replace_all: true })));
    it('Write without schema_version: 2 is blocked', () => expectBlocked(wr('---\nkey: SIG\n---\n')));
    it('MultiEdit whose second edit changes the version is blocked', () =>
      expectBlocked(me([{ old_string: 'Some prose.', new_string: 'Other prose.' }, { old_string: 'schema_version: 2', new_string: 'schema_version: 1' }])));

    it('Edit of the prose is allowed', () => expectAllowed(ed('Some prose.', 'Other prose.')));
    it('Write keeping schema_version: 2 is allowed', () => expectAllowed(wr(`${BODY}More prose.\n`)));
    it('MultiEdit of prose only is allowed', () =>
      expectAllowed(me([{ old_string: 'Some prose.', new_string: 'Other.' }, { old_string: 'Other.', new_string: 'Third.' }])));
    // `$&` would re-insert the match under String.replace's expansion and the
    // version would survive; Claude Code writes it literally, which removes it.
    it('a `$&` in new_string is judged literally, as Claude Code writes it', () => expectBlocked(ed('schema_version: 2', '$&')));

    // The store key prefixes every item ID, so a hand change to `key:` orphans
    // every record (REVIEW loop 1 part B, follow-up to I7).
    const expectKeyBlocked = (event) => {
      expectBlocked(event);
      expect(runHook(event).stderr).toContain('`key`');
    };
    it('Edit changing the key is blocked', () => expectKeyBlocked(ed('key: SIG', 'key: ABC')));
    it('Edit removing the key line is blocked', () => expectKeyBlocked(ed('key: SIG\n', '')));
    it('Write with a different key is blocked', () => expectKeyBlocked(wr('---\nkey: ABC\nschema_version: 2\n---\n')));
    it('Write without a key is blocked', () => expectKeyBlocked(wr('---\nschema_version: 2\n---\n')));
    it('MultiEdit whose second edit changes the key is blocked', () =>
      expectKeyBlocked(me([{ old_string: 'Some prose.', new_string: 'Other prose.' }, { old_string: 'key: SIG', new_string: 'key: XYZ' }])));
    it('Write keeping the same key and version is allowed', () =>
      expectAllowed(wr('---\nschema_version: 2\nkey: SIG\n---\n\nReordered.\n')));
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

  // Runs on every filesystem: the classification is by path shape, so it is
  // tested directly (the spawned case above skips on a case-sensitive one).
  it('classifies an upper-case path as protected by shape alone (any filesystem)', () => {
    expect(protectedTarget(join(dir, '.Planning/Work/Items/00/SIG-1.JSON'))).toMatchObject({ blocked: true });
    expect(protectedTarget(join(dir, '.PLANNING/bugs.md'))).toMatchObject({ blocked: true });
    expect(protectedTarget(join(dir, '.PLANNING/Work/WORK.MD'))).toMatchObject({ blocked: true });
    expect(protectedTarget(join(dir, '.Planning/Work/Items/00/SIG-1.MD'))).toMatchObject({ blocked: false });
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

describe('hooks-api.md states what the guard cannot see (REVIEW I7)', () => {
  const doc = readFileSync(join(__dirname, '..', 'plugin', 'references', 'hooks-api.md'), 'utf-8');
  it('names the Bash route, the checkRecords backstop, and its limit', () => {
    const at = doc.indexOf('### What the work-store guard cannot see');
    expect(at).toBeGreaterThanOrEqual(0);
    const section = doc.slice(at);
    expect(section).toMatch(/through Bash/);
    expect(section).toContain('checkRecords');
    expect(section).toMatch(/valid\*?\s+record/);
  });
  it('the guard description says a WORK.md edit changing `key` is blocked', () => {
    const at = doc.indexOf('**Work-store guard (M6.E13/t5.1):**');
    const desc = doc.slice(at, doc.indexOf('- **exit:**', at));
    expect(desc).toMatch(/change or remove `schema_version: 2` or the\s+`key:` line/);
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
