# Course correction — per-command measurements

Moved here from `.planning/COURSE-CORRECTION.md` (Step 1, item 3) on 2026-10-29 to keep that file
under its size limit. Each entry is a fresh session running the branch's command on a copy of the
test project, walking one real bug (sidebar times that don't refresh) through the flow.

**discuss, 2026-10-28, on that bug:** 25.8 KB to 7.5 KB; branch code imported; 4 questions, all
saying what they decide and what was checked, with a recommendation; 5 plumbing calls stated, not
asked; files in the Epic's folder, none loose; one stop for batch approval (`checkpointed`, as
designed; answered by the test agent); STATE written twice,
the second left uncommitted (step 4); $6.27, 28 turns, 4.5 minutes. It caught a planned Epic's
number being handed out (`SIG-367`). An approved calibrate was left undone.
**plan, 2026-10-29, same bug, from where discuss left it:** 30.5 KB to 11.4 KB; branch code
imported; no questions about the work, one stop to confirm inbox triage (`checkpointed`, as
designed; answered by the test agent); plan, research and validation in the
Epic's folder, none loose; one task, test first, its fake-timer assumption checked by a throwaway
test; STATE in the plan commit plus a separate commit to mark it fresh (step 4); $4.29, 38 turns,
7 minutes. It hit a crash on the project's config (`SIG-368`, fixed). Its inbox items were
migration leftovers (`SIG-370`). The approved calibrate again
did not run (`SIG-369`).
**execute, 2026-10-29, from where plan left it (final file):** 12.1 KB to 7.0 KB; branch code
imported; no questions or stops; the task recorded before its work and closed after its commit;
tests red first; the parent run in the progress file; a separate commit to mark STATE fresh
(step 4); $2.88, 32 turns, 3.7 minutes.
**verify, 2026-10-29, after execute:** 15.2 KB to 8.5 KB; branch code imported; no questions or
stops; tests re-proved red; coverage 5 of 5 by the check; a separate commit to mark STATE fresh
(step 4); $2.91, 20 turns, 3.6 minutes.
**verify again, 2026-10-29, step 4's branch, from the same post-execute copy:** one commit (report,
STATE.md, INDEX.md), working tree clean, no markFresh call; the branch's `isStateStale` reads fresh
on it, `main`'s reads stale (2 commits). Same verdict as before (5 of 5); $3.10, 23 turns, 4.3 minutes.
