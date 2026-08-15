# Signal — Brand & Identity (Proposal)

**Status:** v0.1 — five open questions resolved 2026-05-02. Inspired by `OpenRouterTeam/skills/create-agent-tui`'s approach (ASCII banner, locked palette, single-select visual styles), adapted for a plugin that renders into Claude Code chat rather than a Node TUI.

**Goal:** Lock a small, consistent visual vocabulary so every Signal command's output is recognizably *Signal* — banner moment, tier glyphs, phase markers, artifact headers — without bloating maintenance across 11 commands + 22 agents + 21 skills.

---

## 1. Wordmark / Banner

Block-letter ASCII using `█`, ~47 columns wide. Printed once at the start of `/sig:new-project` and `/sig:init`. Not repeated in every command — the banner is a *moment*, not a header.

```
███████ ██  ██████  ███   ██  █████  ██
██      ██ ██       ████  ██ ██   ██ ██
███████ ██ ██   ███ ██ ██ ██ ███████ ██
     ██ ██ ██    ██ ██  ████ ██   ██ ██
███████ ██  ██████  ██   ███ ██   ██ ███████
```

**Tagline (under banner):**
> *Right-sized rigor for AI-assisted engineering.*

One tagline, used only on the banner moment. Resist the urge to coin alternates per-command — proliferating taglines is anti-brand.

---

## 2. Tier Glyphs

Four tiers, four glyphs. Order is not strictly linear-rigor (SPIKE is exploratory-light, not "between FEATURE and FULL") so glyphs are *categorical*, not a progress bar.

| Tier    | Glyph | Meaning                                           |
|---------|-------|---------------------------------------------------|
| SKETCH  | `◦`   | Quick draft — minimal rigor, throwaway-friendly   |
| SPIKE   | `◊`   | Exploration — open shape, unknown territory       |
| FEATURE | `◆`   | Feature — solid, structured work                  |
| FULL    | `■`   | Production — full rigor, all gates active         |

**Usage:**
- `/sig:status` first line: `Tier: ◆ FEATURE`
- `PROFILE.md` H1: `# Signal Profile — ◆ FEATURE`
- Phase gate output when a tier-skip applies: `— skipped (tier: ◆ FEATURE)`

The whole tier family is geometric — open/closed shapes ascending in solidity from `◦` (lightest) through `■` (heaviest). Avoids decorative glyphs that render unreliably across fonts.

---

## 3. Phase Markers (Signal-Strength Metaphor)

The signal-vs-noise metaphor is THE organizing idea — lean into it. Phases are signal-strength bars, ascending toward SHIP:

| Phase     | Glyph | Notes                                 |
|-----------|-------|---------------------------------------|
| CALIBRATE | `▁`   | Faintest signal — tuning the receiver |
| DISCUSS   | `▂`   |                                       |
| PLAN      | `▃`   |                                       |
| EXECUTE   | `▅`   | Jump — execute is the big lift        |
| VERIFY    | `▆`   |                                       |
| REVIEW    | `▇`   |                                       |
| SHIP      | `█`   | Full strength                         |

**Usage:**
- `/sig:status` phase line: `Phase: ▃ PLAN  →  ▅ EXECUTE (next)`
- Phase command headers in chat: `▅ EXECUTE — wave 2 of 4`
- `STATE.md` phase field: `phase: ▃ PLAN`

---

## 4. Marker Vocabulary (already in use — locking it as brand)

| Marker        | Meaning                                                 |
|---------------|---------------------------------------------------------|
| `[INFERRED]`  | Auto-inferred from landscape scan; user must confirm    |
| `[FILL IN]`   | Placeholder; user must supply                           |

These are already a Signal tic — `/sig:init` Step 5 walkthrough centers on them. Document them here so they stay consistent across future commands.

**On deferral:** when a user defers a walkthrough item, the original marker stays in place and a Notes entry records the deferral. We deliberately do **not** introduce a third `[DEFERRED]` marker — the category of the original (review-needed vs. supply-needed) is information worth preserving, and the marker-counting logic in `tools/lib/walkthrough.js` is built around two states.

---

## 5. Color Palette

**Decision: unicode + markdown only. No ANSI.**

Markdown bold/italic + glyphs render reliably in every Claude Code surface (chat, tool output, file content, agent transcripts). Raw ANSI escapes (`\x1b[...]`) render inconsistently across surfaces and we have no easy way to test the matrix without burning real cycles. Color is also non-load-bearing — every brand element above (banner, tier glyphs, phase markers, headers) reads cleanly without it.

If we later confirm ANSI renders reliably in a specific surface, color can be layered on as additive polish — never as a load-bearing identity element. Until then, treat ANSI as out-of-scope.

---

## 6. Artifact Header Style

Every `.planning/` artifact gets a consistent top block:

```markdown
# {Artifact Name} — {Tier glyph} {TIER}

> *{tagline or one-line purpose}*

**Phase:** {phase glyph} {PHASE}
**Last updated:** {ISO date}

---
```

Examples:
- `# Signal Profile — ◆ FEATURE`
- `# Project Landscape — ■ FULL`
- `# Project State — ◊ SPIKE`

Phase commands writing artifacts use this template. Frees individual command files from re-inventing headers each time.

---

## 7. Where Each Element Appears

| Surface                         | Banner | Tier glyph | Phase marker | Header style |
|---------------------------------|:------:|:----------:|:------------:|:------------:|
| `/sig:new-project` step 1       |   ✓    |     —      |      —       |      —       |
| `/sig:init` step 1              |   ✓    |     —      |      —       |      —       |
| `/sig:calibrate` write          |   —    |     ✓      |     `▁`      |      ✓       |
| `/sig:status` output            |   —    |     ✓      |      ✓       |      —       |
| All other phase commands        |   —    |     ✓      |      ✓       |      —       |
| Artifacts in `.planning/`       |   —    |     ✓      |      ✓       |      ✓       |
| Agent prompts                   |   —    |     —      |      —       |      —       |

Rule of thumb: **commands and artifacts wear the brand; agents and skills don't.** Agents are internal scaffolding — branding them adds noise without signal (pun intended).

---

## 8. Non-Goals (Explicitly)

- **No logo file / SVG / PNG.** Signal lives in a terminal; raster art is wrong-medium.
- **No per-skill branding.** Skills load on-demand into Claude Code's context — they're internal tooling, not user-facing.
- **No animated loaders / spinners.** Signal commands are turn-based, not long-running TUI processes. (create-agent-tui needs spinners; we don't.)
- **No theming / customization.** Locked vocabulary is the *point*. One Signal, one look.
