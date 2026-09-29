// Tests for the /sig:item command file (M6.E11.S3.t3.3, AC-5.1).
// See .planning/M6.E11-VALIDATION.md row AC-5.1.
//
// A presence check: the command documents all seven actions and every lib
// function it names is a real export. It does not — cannot — prove an agent
// reading the file calls them (the phase-recording.test.js caveat).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as ops from '../plugin/tools/lib/work-ops.js';
import * as store from '../plugin/tools/lib/work-store.js';
import * as itemLib from '../plugin/tools/lib/work-item.js';
import * as profile from '../plugin/tools/lib/profile.js';
import { parseFrontmatter } from '../plugin/tools/lib/state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'plugin', 'commands', 'item.md');
const text = readFileSync(FILE, 'utf-8');
const MODULES = { 'work-ops.js': ops, 'work-store.js': store, 'work-item.js': itemLib, 'profile.js': profile };

// The lib function each action is carried out by (AC-5.1: "as tools/lib
// functions the command calls").
const ACTIONS = {
  new: ['newItem'],
  triage: ['triageNext', 'applyTriage', 'listNeedsReview'],
  move: ['moveItem'],
  close: ['closeItem'],
  reopen: ['reopenItem'],
  show: ['getItem'],
  list: ['listItems', 'listThemes'],
};

function section(action) {
  const start = text.search(new RegExp(`^### \`${action}\\b`, 'm'));
  if (start === -1) return null;
  const rest = text.slice(text.indexOf('\n', start) + 1);
  const end = rest.search(/^#{2,3} /m);
  return end === -1 ? rest : rest.slice(0, end);
}

describe('/sig:item command file', () => {
  it('has the add.md frontmatter shape: name sig:item, a description, args', () => {
    const { data } = parseFrontmatter(text);
    expect(Object.keys(data)).toEqual(['name', 'description', 'args']);
    expect(data.name).toBe('sig:item');
    expect(data.description.length).toBeGreaterThan(20);
  });

  it.each(Object.entries(ACTIONS))('documents `%s`, naming %j', (action, fns) => {
    const body = section(action);
    expect(body, `no "### \`${action}" section`).not.toBeNull();
    for (const fn of fns) expect(body).toContain(`${fn}(`);
  });

  it('every lib function it names in the references is a real export of that module', () => {
    const refs = [...text.matchAll(/tools\/lib\/([\w-]+\.js)` — (.*)$/gm)];
    expect(refs.length).toBeGreaterThanOrEqual(4);
    for (const [, mod, list] of refs) {
      // Parenthesised notes (`code` values, `attention`) are not exports.
      const names = [...list.replace(/\([^)]*\)/g, '').matchAll(/`(\w+)`/g)].map((m) => m[1]);
      for (const n of names) expect(MODULES[mod]?.[n], `${mod} exports ${n}`).toBeDefined();
    }
  });

  it('every function call it prescribes exists in work-ops.js, work-store.js or profile.js', () => {
    const calls = new Set([...text.matchAll(/`(\w+)\(/g)].map((m) => m[1]));
    for (const fn of calls) {
      const found = [ops, store, profile].some((m) => typeof m[fn] === 'function');
      expect(found, `${fn} is prescribed but exported nowhere`).toBe(true);
    }
  });

  it('says every move goes through it, and tells a store-off user how to turn the store on', () => {
    expect(text).toMatch(/Every move goes through here/);
    expect(text).toMatch(/\.planning\/work\/WORK\.md[^\n]*key: SIG/);
  });

  it('attention, not gate_strictness, governs triage confirmation', () => {
    expect(text).toMatch(/attention[^\n]*confirm/i);
    for (const level of ['attended', 'checkpointed', 'unattended']) expect(text).toContain(`\`${level}\``);
  });

  it('documents every close reason, and `none given` for a fixed close without proof', () => {
    for (const r of itemLib.CLOSE_REASONS) expect(text).toContain(`\`${r}\``);
    expect(text).toContain('proof: none given');
  });
});
