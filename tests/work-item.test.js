// Tests for the work-item schema (M6.E11.S1.t1.1).
// See .planning/M6.E11-PLAN.md § S1 and .planning/M6.E11-VALIDATION.md rows AC-2.1 … AC-2.4.

import { describe, it, expect } from 'vitest';

import {
  ITEM_ID_RE,
  ITEM_TYPES,
  ITEM_STATUSES,
  CLOSE_REASONS,
  WorkStoreError,
  WORK_STORE_ERROR_CODES,
  parseItem,
  stringifyItem,
  validateItem,
  renderLabel,
} from '../plugin/tools/lib/work-item.js';

// A complete, valid open item. Tests clone and break one field at a time.
function baseItem(over = {}) {
  return {
    id: 'SIG-412',
    type: 'BUG',
    status: 'T',
    title: 'Drain loses the second capture',
    theme: 'capture',
    priority: 2,
    source: 'add',
    source_ref: 'ISSUES-INBOX.md',
    created: { at: '2026-09-29T10:00:00Z', by: 'brett' },
    ...over,
  };
}

function closed(over = {}) {
  return baseItem({
    status: 'C',
    close: { reason: 'fixed', by: 'brett', at: '2026-09-29', proof: 'abc1234', ...over },
  });
}

describe('ITEM_ID_RE', () => {
  it.each(['SIG-1', 'SIG-412', 'AB-9', 'A1B2C3D4E5-10'])('accepts %s', (id) => {
    expect(ITEM_ID_RE.test(id)).toBe(true);
  });
  it.each(['SIG-0', 'SIG-012', 'sig-1', 'S-1', 'SIG1', 'SIG-', '1SIG-2', 'ABCDEFGHIJK-1', 'SIG-412-BUG-T'])(
    'rejects %s',
    (id) => {
      expect(ITEM_ID_RE.test(id)).toBe(false);
    }
  );
});

describe('WorkStoreError', () => {
  it('carries a code from the fixed set', () => {
    const err = new WorkStoreError('SCHEMA', 'bad');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('WorkStoreError');
    expect(err.code).toBe('SCHEMA');
    expect(err.message).toBe('bad');
    expect(WORK_STORE_ERROR_CODES).toEqual(['CONFIG', 'SCHEMA', 'NOT_FOUND', 'CONFLICT', 'GENERATED', 'OPEN_ITEMS']);
  });
  it('refuses a code outside the set', () => {
    expect(() => new WorkStoreError('NOPE', 'x')).toThrow(/code/);
  });
});

describe('validateItem — AC-2.2', () => {
  it('a complete open item is valid', () => {
    expect(validateItem(baseItem())).toEqual([]);
  });

  it('only id, type and status are required (a fresh capture has no title yet)', () => {
    expect(validateItem({ id: 'SIG-1', type: 'NEW', status: 'N' })).toEqual([]);
  });

  it.each(ITEM_TYPES)('accepts type %s', (type) => {
    expect(validateItem(baseItem({ type }))).toEqual([]);
  });

  it.each(['N', 'T', 'Q', 'P'])('accepts open status %s', (status) => {
    expect(validateItem(baseItem({ status }))).toEqual([]);
  });

  it.each(CLOSE_REASONS.filter((r) => r !== 'dup'))('accepts close reason %s', (reason) => {
    expect(validateItem(closed({ reason }))).toEqual([]);
  });

  it('accepts close reason dup with dup_of', () => {
    expect(validateItem(closed({ reason: 'dup', dup_of: 'SIG-100' }))).toEqual([]);
  });

  it('enum sets are exactly the decided ones', () => {
    expect(ITEM_TYPES).toEqual(['NEW', 'BUG', 'FEAT', 'CHORE', 'Q']);
    expect(ITEM_STATUSES).toEqual(['N', 'T', 'Q', 'P', 'C']);
    expect(CLOSE_REASONS).toEqual(['fixed', 'stale', 'wontdo', 'dup', 'rejected']);
  });

  const invalid = [
    ['id missing', { id: undefined }, /id/],
    ['id malformed', { id: 'sig-4' }, /id/],
    ['type missing', { type: undefined }, /type/],
    ['type unknown', { type: 'TASK' }, /type/],
    ['status missing', { status: undefined }, /status/],
    ['status unknown', { status: 'X' }, /status/],
    ['title not a string', { title: 5 }, /title/],
    ['title empty', { title: '  ' }, /title/],
    ['theme not a string', { theme: ['a'] }, /theme/],
    ['created not a mapping', { created: '2026-09-29' }, /created/],
    ['created without by', { created: { at: '2026-09-29' } }, /created\.by/],
    ['created without at', { created: { by: 'brett' } }, /created\.at/],
    ['epic stored', { epic: 'M6.E11' }, /epic.*derived/],
    ['sprint stored', { sprint: 'S1' }, /sprint.*derived/],
    ['unknown key (typo)', { dupOf: 'SIG-1' }, /dupOf/],
    ['legacy_id not a string', { legacy_id: 75 }, /legacy_id/],
  ];
  it.each(invalid)('rejects: %s', (_label, over, pattern) => {
    const item = baseItem(over);
    for (const [k, v] of Object.entries(over)) if (v === undefined) delete item[k];
    const errors = validateItem(item);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join('\n')).toMatch(pattern);
  });

  it('rejects a close reason outside the enum', () => {
    expect(validateItem(closed({ reason: 'done' })).join('\n')).toMatch(/close\.reason/);
  });

  it('a close always carries by and at', () => {
    const noBy = closed();
    delete noBy.close.by;
    expect(validateItem(noBy).join('\n')).toMatch(/close\.by/);
    const noAt = closed();
    delete noAt.close.at;
    expect(validateItem(noAt).join('\n')).toMatch(/close\.at/);
  });

  it('dup without dup_of is rejected', () => {
    expect(validateItem(closed({ reason: 'dup' })).join('\n')).toMatch(/dup_of/);
  });

  it('dup_of must be an item ID', () => {
    expect(validateItem(closed({ reason: 'dup', dup_of: 'B100' })).join('\n')).toMatch(/dup_of/);
  });

  it('dup_of on a non-dup close is rejected', () => {
    expect(validateItem(closed({ reason: 'fixed', dup_of: 'SIG-100' })).join('\n')).toMatch(/dup_of/);
  });

  it('status C requires a close', () => {
    expect(validateItem(baseItem({ status: 'C' })).join('\n')).toMatch(/close/);
  });

  it('an open status must not carry a close', () => {
    const item = closed();
    item.status = 'T';
    expect(validateItem(item).join('\n')).toMatch(/close/);
  });

  it('close must be a mapping', () => {
    expect(validateItem(baseItem({ status: 'C', close: 'fixed' })).join('\n')).toMatch(/close/);
  });

  it('a non-object is one error, not a crash', () => {
    expect(validateItem(null).length).toBe(1);
    expect(validateItem([]).length).toBe(1);
  });
});

describe('validateItem — AC-2.4: every violation, not the first', () => {
  it('an item with 3 violations returns 3 errors', () => {
    const errors = validateItem({ id: 'bad', type: 'TASK', status: 'X' });
    expect(errors).toHaveLength(3);
  });

  it('violations across nested close are all reported', () => {
    const errors = validateItem({
      id: 'SIG-3',
      type: 'BUG',
      status: 'C',
      close: { reason: 'dup' }, // missing by, at, dup_of
    });
    expect(errors).toHaveLength(3);
  });
});

describe('renderLabel — AC-2.3', () => {
  it('renders {KEY}-{n}-{TYPE}-{STATUS}', () => {
    expect(renderLabel(baseItem())).toBe('SIG-412-BUG-T');
    expect(renderLabel({ id: 'SIG-7', type: 'Q', status: 'C' })).toBe('SIG-7-Q-C');
  });
});

describe('parseItem / stringifyItem — AC-2.1', () => {
  const bodies = [
    ['ordinary', 'The words, verbatim.\n\nSecond paragraph.\n'],
    ['empty', ''],
    ['leading newline', '\nstarts blank\n'],
    ['no trailing newline', 'ends without newline'],
    ['a fence mid-text', 'above\n---\nnot: frontmatter\n---\nbelow\n'],
    ['CRLF', 'line one\r\nline two\r\n'],
    ['unicode and pipes', 'a | b — `c|d` ✓\n'],
  ];

  it.each(bodies)('round-trips the body byte-for-byte: %s', (_label, body) => {
    const item = closed({ reason: 'dup', dup_of: 'SIG-100' });
    const text = stringifyItem(item, body);
    const parsed = parseItem(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.body).toBe(body);
    expect(parsed.item).toEqual(item);
  });

  it('writes keys in one canonical order whatever the input order', () => {
    const a = baseItem();
    const b = Object.fromEntries(Object.entries(a).reverse());
    expect(stringifyItem(b, 'x\n')).toBe(stringifyItem(a, 'x\n'));
    const keys = stringifyItem(b, '')
      .split('\n')
      .filter((l) => /^[a-z_]+:/.test(l))
      .map((l) => l.split(':')[0]);
    expect(keys).toEqual(['id', 'type', 'status', 'title', 'theme', 'priority', 'source', 'source_ref', 'created']);
  });

  it('parse reports schema violations with the item file named', () => {
    const text = stringifyItem({ id: 'SIG-1', type: 'TASK', status: 'N' }, 'body\n');
    const { item, errors } = parseItem(text, { path: '.planning/work/inbox/SIG-1.md' });
    expect(item.id).toBe('SIG-1');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/\.planning\/work\/inbox\/SIG-1\.md/);
    expect(errors[0]).toMatch(/type/);
  });

  it('no frontmatter is a schema error, not an empty valid item', () => {
    const { item, errors } = parseItem('just words\n', { path: 'inbox/SIG-2.md' });
    expect(item).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/inbox\/SIG-2\.md/);
    expect(errors[0]).toMatch(/frontmatter/);
  });

  it('malformed YAML names the item file, not STATE.md', () => {
    const { item, errors } = parseItem('---\nid: [unclosed\n---\nbody\n', { path: 'backlog/SIG-3.md' });
    expect(item).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/backlog\/SIG-3\.md/);
    expect(errors[0]).not.toMatch(/STATE\.md/);
  });

  it('non-mapping frontmatter names the item file, not STATE.md', () => {
    const { errors } = parseItem('---\n- a\n- b\n---\n', { path: 'backlog/SIG-4.md' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/backlog\/SIG-4\.md/);
    expect(errors[0]).not.toMatch(/STATE\.md/);
  });

  it('keeps dates as strings (core schema — no Date objects)', () => {
    const { item } = parseItem('---\nid: SIG-5\ntype: NEW\nstatus: N\ncreated:\n  at: 2026-09-29\n  by: add\n---\n');
    expect(item.created.at).toBe('2026-09-29');
  });
});
