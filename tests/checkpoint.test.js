// Tests for /sig:checkpoint helpers in tools/lib/checkpoint.js (M4.5.E6.S2).
// Slice 2 lands in tasks S2.t1 → S2.t4 + S2.t7; this file grows alongside.

import { describe, it, expect } from 'vitest';

import { parseCheckpointArgs } from '../tools/lib/checkpoint.js';

describe('parseCheckpointArgs', () => {
  it('returns {contextMode: false, unknownFlags: []} for no args', () => {
    expect(parseCheckpointArgs('')).toEqual({ contextMode: false, unknownFlags: [] });
    expect(parseCheckpointArgs(undefined)).toEqual({ contextMode: false, unknownFlags: [] });
    expect(parseCheckpointArgs('   ')).toEqual({ contextMode: false, unknownFlags: [] });
  });

  it('sets contextMode: true for --context', () => {
    expect(parseCheckpointArgs('--context')).toEqual({
      contextMode: true,
      unknownFlags: [],
    });
  });

  it('captures trailing unknown tokens after --context as unknownFlags', () => {
    expect(parseCheckpointArgs('--context foo')).toEqual({
      contextMode: true,
      unknownFlags: ['foo'],
    });
  });

  it('captures a bare unknown token as unknownFlags', () => {
    expect(parseCheckpointArgs('foo')).toEqual({
      contextMode: false,
      unknownFlags: ['foo'],
    });
  });

  it('tolerates whitespace and ordering — --context can be anywhere', () => {
    expect(parseCheckpointArgs('foo --context bar')).toEqual({
      contextMode: true,
      unknownFlags: ['foo', 'bar'],
    });
  });
});
