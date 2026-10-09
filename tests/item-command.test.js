// Tests for the /sig:item command file (M6.E11.S3.t3.3, AC-5.1).
// See .planning/M6.E11-VALIDATION.md row AC-5.1.
//
// A presence check: the command documents all eight actions and every lib
// function it names is a real export. It does not — cannot — prove an agent
// reading the file calls them (the phase-recording.test.js caveat).
//
// M6.E13 t6.1 (AC3.4): rewritten for records and events — the actions are
// carried by the v2 library, `work-records.js`, and no sentence says a folder
// is a status.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as records from '../plugin/tools/lib/work-records.js';
import * as itemLib from '../plugin/tools/lib/work-item.js';
import * as profile from '../plugin/tools/lib/profile.js';
import { parseFrontmatter } from '../plugin/tools/lib/state.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'plugin', 'commands', 'item.md');
const text = readFileSync(FILE, 'utf-8');
const MODULES = { 'work-records.js': records, 'work-item.js': itemLib, 'profile.js': profile };

// The lib function each action is carried out by (AC-5.1: "as tools/lib
// functions the command calls").
const ACTIONS = {
  new: ['newItem'],
  triage: ['triageNext', 'listThemes', 'listNeedsReview', 'triageItem', 'closeItem', 'editItem'],
  move: ['triageItem', 'queueItem', 'startItem'],
  close: ['requestClose', 'closeItem'],
  reopen: ['reopenItem'],
  edit: ['editItem'],
  show: ['getRecord'],
  list: ['listRecords'],
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
    expect(refs.length).toBeGreaterThanOrEqual(3); // work-records, work-item, profile (t6.1: work-ops + work-store became work-records)
    for (const [, mod, list] of refs) {
      // Parenthesised notes (`code` values, `attention`) are not exports.
      const names = [...list.replace(/\([^)]*\)/g, '').matchAll(/`(\w+)`/g)].map((m) => m[1]);
      for (const n of names) expect(MODULES[mod]?.[n], `${mod} exports ${n}`).toBeDefined();
    }
  });

  it('every function call it prescribes exists in work-records.js, work-item.js or profile.js', () => {
    const calls = new Set([...text.matchAll(/`(\w+)\(/g)].map((m) => m[1]));
    for (const fn of calls) {
      const found = [records, itemLib, profile].some((m) => typeof m[fn] === 'function');
      expect(found, `${fn} is prescribed but exported nowhere`).toBe(true);
    }
  });

  it('says every change goes through it, and tells a store-off user how to turn the store on', () => {
    expect(text).toMatch(/Every change to an item goes through here/);
    // The migration, never a hand-made WORK.md — that regenerates over hand-kept lists (REVIEW I1).
    // M6.E13 t7.4: the migration named is /sig:docs-migrate's (tools/work-migrate.mjs was retired).
    // M6.E15 S1: it shipped, as /sig:docs-migrate --work-store.
    expect(text).toMatch(/\.planning\/work\/WORK\.md[^\n]*`\/sig:docs-migrate --work-store`/);
    expect(text).not.toMatch(/create `\.planning\/work\/WORK\.md` with `key: SIG`/);
  });

  it('attention, not gate_strictness, governs triage confirmation', () => {
    expect(text).toMatch(/attention[^\n]*confirm/i);
    for (const level of ['attended', 'checkpointed', 'unattended']) expect(text).toContain(`\`${level}\``);
  });

  it('documents every close reason; a fixed close is a close request on a commit, read as closing', () => {
    for (const r of itemLib.CLOSE_REASONS) expect(text).toContain(`\`${r}\``);
    const close = section('close');
    expect(close).toMatch(/`fixed`[^\n]*requestClose\(/);
    expect(close).toMatch(/commit hash/);
    expect(close).toMatch(/closing/);
    expect(close).toContain('confirmCloses');
    // v1's "none given" proof is gone: requestClose refuses anything but a hash.
    expect(text).not.toContain('proof: none given');
  });

  it('carries no folder-is-status sentence (AC3.4): a record never moves, status comes from events', () => {
    expect(text).not.toMatch(/folder is its status/i);
    expect(text).not.toMatch(/work\/(inbox|backlog|done)\//);
    expect(text).toMatch(/A record never moves/);
    expect(text).toContain('.planning/work/items/NN/SIG-n.json');
    expect(text).toMatch(/derived from the record's own list of events/);
  });

  it('branches on the store version: v1 reads, every v1 write refuses naming the v2 migration', () => {
    expect(text).toContain('storeVersion(baseDir)');
    expect(text).toContain('node tools/work-migrate-v2.mjs');
    expect(text).toMatch(/`version` is `1`/);
    expect(text).toMatch(/checkRecords\(baseDir\)/);
  });
});
