// M5.E2.S1.t3 — the faithfulness gate (the B8-catastrophe mutation test).
//
// THE load-bearing safety test for the whole slice. The B8 hand-recipe DELETED
// ~80 lines of frontmatter prose ("body byte-identical" = the prose was dropped).
// The automated command must relocate that prose, never delete it — and the gate
// must FAIL a relocation that drops it.
//
// Advisor discriminator (baked in below): verifyFaithful (= verifyCardCoverage)
// proves only discrete-token (ID/date/status) coverage — it returns pass:true on
// a TOTAL deletion of pure prose that carries no IDs. So the vector-1 gate is
// WORD conservation, and this fixture is deliberately PURE PROSE WITH NO IDs so
// that ONLY conservation can catch the drop. A fixture with IDs would false-green
// through verifyFaithful and "prove" the wrong gate.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { relocateFaithful, verifyFaithful, WORD, BYTE } from '../tools/lib/migrate-memory.js';
import { verifyCardCoverage } from '../tools/lib/evict.js';

// Pure narrative — NO M*.E* / D-* / FR* / AC* ids, NO ISO dates, NO status
// tokens. This is the exact shape of the frontmatter prose the B8 recipe dropped.
const PURE_PROSE =
  'we refactored the authentication handshake because the previous flow confused ' +
  'new contributors and made the onboarding path far longer than it needed to be';

describe('M5.E2.S1.t3 verifyFaithful is verifyCardCoverage (re-export, not rename)', () => {
  it('re-exports the same function evict.js keeps under its own name', () => {
    expect(verifyFaithful).toBe(verifyCardCoverage);
  });

  it('the advisor discriminator: verifyFaithful ALONE misses a pure-prose deletion', () => {
    // Total drop of prose that carries no discrete tokens → coverage says pass.
    // This is WHY word-conservation, not verifyFaithful, is the vector-1 gate.
    expect(verifyFaithful(PURE_PROSE, '').pass).toBe(true);
  });
});

describe('M5.E2.S1.t3 relocateFaithful — the B8 catastrophe is CAUGHT (WORD mode)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-b8-'));
    await mkdir(join(baseDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('a relocation that DROPS the prose into an empty home → pass:false (apply refused)', async () => {
    const r = await relocateFaithful({
      sourceText: PURE_PROSE,
      card: '', // the catastrophe: prose vanished, nothing landed in the new home
      destAbs: join(baseDir, '.planning', 'STATE.md'),
      baseDir,
      mode: WORD,
    });
    expect(r.pass).toBe(false); // ← the gate refuses the apply
    // And it was CONSERVATION that caught it, not the coverage backstop.
    expect(r.conservation.pass).toBe(false);
    expect(r.coverage.pass).toBe(true); // verifyFaithful alone would have waved it through
  });

  it('a faithful relocation (prose fully present in the new home) → pass:true', async () => {
    const card = `## In-flight\n\n${PURE_PROSE}\n\n(relocated from frontmatter)\n`;
    const r = await relocateFaithful({
      sourceText: PURE_PROSE,
      card,
      destAbs: join(baseDir, '.planning', 'STATE.md'),
      baseDir,
      mode: WORD,
    });
    expect(r.pass).toBe(true);
  });

  it('a relocation missing one sentence → pass:false (mutation: inject a drop)', async () => {
    const card = 'we refactored the authentication handshake'; // rest of the prose gone
    const r = await relocateFaithful({
      sourceText: PURE_PROSE,
      card,
      destAbs: join(baseDir, '.planning', 'STATE.md'),
      baseDir,
      mode: WORD,
    });
    expect(r.pass).toBe(false);
    expect(r.conservation.missing.length).toBeGreaterThan(0);
  });

  it('coverage backstop still fires — a source WITH ids whose card drops one → pass:false', async () => {
    // The other half of the gate: when the source carries discrete tokens, the
    // coverage backstop catches a card that drops an ID even if — hypothetically
    // — the prose tokens looked covered. Here a BYTE archive is byte-identical
    // (conservation passes) but the separate `card` omits an ID it should carry.
    const section = 'Closed M9.E1 — shipped 2026-07-16. See D-M9E1-2.';
    const r = await relocateFaithful({
      sourceText: section,
      card: 'Closed M9.E1 — shipped.', // drops the date + D-M9E1-2
      destAbs: join(baseDir, '.planning', 'archive', 'M9', 'E1', 'STATE-NARRATIVE.md'),
      baseDir,
      mode: BYTE,
    });
    expect(r.conservation.pass).toBe(true); // archive copy is byte-identical
    expect(r.coverage.pass).toBe(false); // but the card dropped 2026-07-16 + D-M9E1-2
    expect(r.pass).toBe(false);
  });
});
