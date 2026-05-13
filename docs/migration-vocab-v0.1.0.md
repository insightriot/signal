# Migration: Tranche → Milestone (Signal v0.1.0)

If you have a Signal-managed project with `.planning/TRANCHE-*.md` files from an earlier Signal version, this migration brings it onto the locked v0.1.0 vocabulary.

**Locked vocabulary:**
- `Tranche` → **Milestone** (M1, M2, …)
- `sub-tranche` → **Epic** (M5.E1, M5.E2, …; optional mid-layer)
- T-prefix task IDs (`T4.17`) → M-prefix task IDs (`M4.t17`; lowercase `t`)
- `Phase`, `Wave`, `Task` — unchanged

**Persistence rule:** the **ID is persistent identity, never changes.** Once assigned, a task's ID is its address forever. Phase and Wave are *metadata* on the work unit (transient: planned / in-flight / shipped), not part of the address.

Full rationale: see Signal's `DECISIONS.md` entry dated 2026-05-12.

---

## How to migrate

You have two options:

### Option A — Hand-drive the prompt (recommended for one-off projects)

Open Claude Code in your Signal-managed project and paste the following prompt. Claude will dry-run, ask confirmation, then execute.

````
Apply the Signal v0.1.0 vocabulary migration to this repo.

Locked vocabulary:
- `Tranche` → `Milestone` (M1, M2, …)
- `sub-tranche` → `Epic` (M5.E1, M5.E2, … optional mid-layer)
- T-prefix task IDs (`T4.17`) → M-prefix task IDs (`M4.t17`; lowercase `t`)
- `Phase`, `Wave`, `Task` — unchanged

Excluded from rewriting (frozen history):
- `.upstream/` (any vendored upstream)
- `CHANGELOG*` files
- Commit messages (don't rewrite git history)
- `node_modules/`, `.git/`

Steps:

1. **Dry-run report.** Without making any changes:
   - List every `.planning/TRANCHE-*.md` file (these will be `git mv`'d to `MILESTONE-*.md`).
   - Run `grep -ril "tranche" --include="*.md"` excluding the paths above and report which files contain old vocab.
   - Run `grep -rEl "[[:<:]]T[1-9]([.][0-9]+)?[[:>:]]" --include="*.md"` excluding the paths above and report which files contain T-prefix IDs.
   - Show the count of files affected and a one-line summary of the changes per file.

2. **Ask for confirmation.** Show the dry-run report and ask "Proceed?" before any writes. If I say no, stop.

3. **Execute on confirmation:**
   - `git mv .planning/TRANCHE-N.md .planning/MILESTONE-N.md` for each existing TRANCHE file (preserves history).
   - In every `.md` file outside the excluded paths, apply (in this order, to avoid clobbering historical examples in code-fenced spans):
     - `TRANCHE-N` → `MILESTONE-N` (file refs and headings; uppercase)
     - `TRANCHE` → `MILESTONE` (any remaining all-caps)
     - `Sub-Tranche`/`sub-tranche` (and plurals) → `Epic` (and plurals)
     - T-prefix task IDs → M-prefix: `T<N>.<NN>` becomes `M<N>.t<NN>`
     - Bare T-prefix milestone IDs: `T<N>` becomes `M<N>` (use word boundaries)
     - `Tranche` → `Milestone`, `tranche` → `milestone` (and plurals)
   - **Preserve historical examples.** If a doc contains a literal mapping like `Tranche → Milestone` describing the rename itself, keep the left-hand side as `Tranche` (wrap in backticks if needed). When in doubt, ask before rewriting that specific line.

4. **Append a DECISIONS.md entry** noting the rename, dated today, with this body:
   > Migrated to Signal v0.1.0 vocabulary (Tranche → Milestone, T-prefix → M-prefix, sub-tranche → Epic). ID is persistent identity, never changes. See https://github.com/InsightRiot/signal — `docs/migration-vocab-v0.1.0.md` for the canonical migration spec.

5. **Verification gate.** After writes:
   - `grep -ri "tranche" --include="*.md" --exclude-dir=.upstream --exclude=CHANGELOG.md .` must return zero matches in current-state docs.
   - `grep -rEl "[[:<:]]T[1-9]([.][0-9]+)?[[:>:]]" --include="*.md" --exclude-dir=.upstream .` should return zero matches.
   - Run any local tests/validators (e.g., `npm test`, `npm run validate`) if present.

6. **Final report.** List:
   - Files renamed (TRANCHE-*.md → MILESTONE-*.md).
   - Files modified (count + one-line summary per file).
   - DECISIONS.md entry confirmed appended.
   - Verification gate result (PASS / FAIL with details).

Do not skip steps. Do not skip the dry-run-then-confirm. Do not rewrite git history.
````

### Option B — Run the sed pipeline directly (faster, less safe)

For confident hands. Run from the repo root:

```bash
# 1. Rename TRANCHE files
for n in 1 2 3 4 5; do
  [ -f ".planning/TRANCHE-$n.md" ] && git mv ".planning/TRANCHE-$n.md" ".planning/MILESTONE-$n.md"
done

# 2. Build file list (exclude .upstream, CHANGELOG*, .git, node_modules)
FILES=$(grep -rl --include="*.md" \
  --exclude-dir=.upstream --exclude-dir=node_modules --exclude-dir=.git \
  --exclude=CHANGELOG.md \
  -E "TRANCHE|[Tt]ranche|[[:<:]]T[1-9]" . 2>/dev/null)

# 3. Apply replacements
for f in $FILES; do
  sed -i '' -E '
    s/TRANCHE-([1-9])/MILESTONE-\1/g
    s/TRANCHE/MILESTONE/g
    s/Sub-[Tt]ranches/Epics/g
    s/sub-tranches/Epics/g
    s/Sub-[Tt]ranche/Epic/g
    s/sub-tranche/Epic/g
    s/[[:<:]]T([1-9])\.([0-9]+)[[:>:]]/M\1.t\2/g
    s/[[:<:]]T([1-9])[[:>:]]/M\1/g
    s/Tranches/Milestones/g
    s/tranches/milestones/g
    s/Tranche/Milestone/g
    s/tranche/milestone/g
  ' "$f"
done

# 4. Verification gate
grep -ri "tranche" --include="*.md" --exclude-dir=.upstream --exclude=CHANGELOG.md . && echo "FAIL — tranche refs remain" || echo "PASS"
```

**Note:** The above is GNU/BSD-sed compatible on macOS (uses `[[:<:]]` / `[[:>:]]` for word boundaries; BSD sed does not support `\b`). On Linux GNU sed, replace `[[:<:]]` with `\b` and `[[:>:]]` with `\b`, and drop the `-i ''` quotes (use `-i` alone).

**After Option B**, manually inspect any docs that described the rename itself (look for `Tranche → Milestone` arrows in your DECISIONS.md / migration notes) — sed will have collapsed both sides to `Milestone → Milestone` and you'll want to restore the historical example.

---

## Why ship this as a portable prompt

Every Signal-managed project Brett (and others) maintains will have the old vocabulary and benefit from a clean migration. Solving the migration once portably — instead of doing it ad-hoc per project — is the whole point. The Option A prompt is the canonical form because (a) it dry-runs and asks confirmation, (b) it handles edge cases the sed pipeline can't (historical-example preservation), and (c) it produces an auditable report.

---

*Last updated: 2026-05-12*
