// Tests for the STATE.md schema layer in tools/lib/state.js (M4.5.E6.S1.t3).
// Covers the YAML-frontmatter parser/serializer + StateSchemaError, the pure
// helpers underlying upgradeStateFile (S1.t4) and the readState rewrite
// (S1.t5).

import { describe, it, expect } from 'vitest';

import {
  parseFrontmatter,
  stringifyFrontmatter,
  StateSchemaError,
} from '../tools/lib/state.js';

describe('parseFrontmatter', () => {
  it('parses a well-formed frontmatter + body', () => {
    const raw = '---\nschema_version: 1\nphase: EXECUTE\n---\nfreeform body here\n';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ schema_version: 1, phase: 'EXECUTE' });
    expect(body).toBe('freeform body here\n');
  });

  it('tolerates CRLF line endings', () => {
    const raw = '---\r\nschema_version: 1\r\nphase: PLAN\r\n---\r\nbody\r\n';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ schema_version: 1, phase: 'PLAN' });
    expect(body).toContain('body');
  });

  it('tolerates a missing trailing newline after the closing fence', () => {
    const raw = '---\nschema_version: 1\n---\nbody';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ schema_version: 1 });
    expect(body).toBe('body');
  });

  it('returns {data: null, body: raw} when no frontmatter is present', () => {
    const raw = '# Just a freeform markdown file\n\nNothing structured here.\n';
    const result = parseFrontmatter(raw);
    expect(result.data).toBeNull();
    expect(result.body).toBe(raw);
  });

  it('throws StateSchemaError when YAML inside the fence is malformed', () => {
    const raw = '---\nphase: [unterminated\n---\nbody\n';
    expect(() => parseFrontmatter(raw)).toThrow(StateSchemaError);
  });

  it('throws StateSchemaError when YAML is non-mapping (e.g., a list)', () => {
    const raw = '---\n- one\n- two\n---\nbody\n';
    expect(() => parseFrontmatter(raw)).toThrow(StateSchemaError);
  });

  it('throws StateSchemaError when YAML is non-mapping (e.g., empty/null)', () => {
    const raw = '---\n\n---\nbody\n';
    expect(() => parseFrontmatter(raw)).toThrow(StateSchemaError);
  });
});

describe('stringifyFrontmatter', () => {
  it('round-trips losslessly through parseFrontmatter', () => {
    const data = {
      schema_version: 1,
      phase: 'EXECUTE',
      completed_phases: ['CALIBRATE', 'DISCUSS', 'PLAN'],
      current_tasks: [{ id: 'M4.5.E6.S1.t3', startedAt: '2026-05-17T16:00:00Z' }],
    };
    const body = '# Notes\n\nFreeform narrative below the frontmatter.\n';
    const round = parseFrontmatter(stringifyFrontmatter(data, body));
    expect(round.data).toEqual(data);
    expect(round.body).toBe(body);
  });

  it('handles an empty body cleanly', () => {
    const out = stringifyFrontmatter({ schema_version: 1 }, '');
    expect(out).toMatch(/^---\nschema_version: 1\n---\n$/);
    const round = parseFrontmatter(out);
    expect(round.data).toEqual({ schema_version: 1 });
    expect(round.body).toBe('');
  });

  it('handles a single-key data object', () => {
    const out = stringifyFrontmatter({ phase: 'PLAN' }, 'body');
    const round = parseFrontmatter(out);
    expect(round.data).toEqual({ phase: 'PLAN' });
    expect(round.body).toBe('body');
  });
});

describe('StateSchemaError', () => {
  it('is a named subclass of Error', () => {
    const err = new StateSchemaError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StateSchemaError);
    expect(err.name).toBe('StateSchemaError');
    expect(err.message).toBe('boom');
  });
});
