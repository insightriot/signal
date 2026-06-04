<!-- Recording storyboard for the M4.5.E5 demo (FR2). Claude can't record a screen — this is the turnkey script Brett records from. -->

# Signal demo — recording script

A ~45–60 second screen recording that shows the **calibration wedge** in one sitting: the same tool sizing rigor to the job. The goal is to make a newcomer *see* `/sig:calibrate` decide a tier, not just read about it.

## Before you record (read this — it changes what's on screen)

- **Record on macOS.** That's the only verified install path today (see [`./install-verification.md`](./install-verification.md)).
- **Record from a real marketplace install, not a dev checkout.** This matters: in dev mode the scanner agents resolve as `general-purpose` fallbacks instead of the real `sig:scanners:*` names, and `${CLAUDE_PLUGIN_ROOT}` isn't set. A dev-mode recording would show behavior a peer installing from the marketplace won't see. Install with:
  ```
  /plugin marketplace add insightriot/signal
  /plugin install sig@signal
  /reload-plugins
  ```
- **Pick a small real repo** to run `/sig:init` on (a fresh clone of a public project works well), or use `/sig:new-project` for a greenfield demo.
- **Sequence `/sig:calibrate` before `/sig:status`.** A clean `/sig:init` writes `STATE.md` but not `PROFILE.md`; `/sig:status` reads `PROFILE.md`, so calibrate first or its tier-aware output is thin.
- **Tools:** a terminal recorder (asciinema) or QuickTime screen capture. Keep the font large enough to read at 720p.

## Storyboard

| # | ~sec | On screen | Narration beat |
|---|---|---|---|
| 1 | 0–4 | Title card: "Signal — right-sized rigor for AI coding agents" | "Same workflow. Different rigor, depending on the job." |
| 2 | 4–16 | Run `/sig:init` on the sample repo; the 4 scanners run; `LANDSCAPE.md` + a baseline `PROJECT.md` appear | "Signal scans the repo and writes down what it found — stack, structure, activity, test surface." |
| 3 | 16–34 | Run `/sig:calibrate`; answer the five questions on screen; `PROFILE.md` is written with a tier | "Five questions — scope, stakes, novelty, reversibility, horizon — and it picks a tier. *This* is the part nothing else does." |
| 4 | 34–46 | Run `/sig:status`; show tier + current phase + recommended next action | "Now every phase reads that profile. Status shows where you are and what's next, sized to the tier." |
| 5 | 46–58 | Split or cut: contrast a SKETCH answer set vs. a FULL answer set (or narrate over the README table) | "Answer 'throwaway, hours, reversible' and it goes SKETCH — skips the ceremony. Answer 'production, years, irreversible' and it goes FULL. Same commands either way." |
| 6 | 58–60 | End card: repo URL + `/sig:calibrate` to try it | "It's `github.com/insightriot/signal`. Calibrate once; the workflow tunes itself." |

## Notes for the recorder

- If frame 5 is too much to capture live, narrate it over the SKETCH-vs-FULL table in the README — the numbers (5 min / 0 tests vs. 2 hours / 39 tests) are the punchline.
- Keep it honest to the [draft launch post](./launch-post.md): early, macOS-only, sample-of-one. Don't imply v2 features (harder TDD, the learning loop) are shipped.
- The complete FULL run shown in frame 5 is committed at [`../examples/url-shortener/`](../examples/url-shortener/) if you want to pull real artifacts on screen.
