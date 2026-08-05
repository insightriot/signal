/**
 * The caveats attached to every published run record.
 *
 * WHY THIS IS A MODULE AND NOT A LOCAL FUNCTION IN THE RUNNER (M5.E15 S1.t4).
 *
 * This lived in `tools/adherence-run.js`, which exports nothing and which
 * `tests/adherence-suite-guard.test.js` forbids any test file from importing —
 * that guard is deliberate and load-bearing: importing the runner is how a test
 * suite ends up spawning the paid agent CLI. The combination meant the caveat
 * builder had no test and could not get one without breaking the guard.
 *
 * That mattered the moment M5.E15 replaced the field it branched on. The
 * section caveat keyed off `canary.deleteSection`; renaming that field to
 * `deletions[]` would have left the branch permanently false, and the caveat
 * telling a reader that the control arm removed more than one line would have
 * silently stopped rendering. Nothing would have gone red. That is the `B39`
 * shape — a check that reports nothing and reads as clean — reached through a
 * field rename rather than a missing detector.
 *
 * Building the caveats is pure string work over declared data: no agent, no
 * filesystem, no network. It belongs where it can be tested.
 */

/**
 * @param {{canary:object, runsPerArm:number, dirty:boolean, allowedTools:string[]}} input
 * @returns {string[]} caveats, in publication order
 */
export function buildCaveats({ canary, runsPerArm, dirty, allowedTools, descriptiveResidue = [] }) {
  const out = [
    `**One canary is not a survey.** This is a fact about \`${canary.id}\` in \`commands/${canary.command}.md\`, not evidence about Signal's instructions generally.`,
    `**Tool access is part of the claim.** The agent ran with \`--allowedTools ${allowedTools.join(' ')}\`. An instruction that needs a tool the user denies cannot be obeyed regardless of wording.`,
    '**The unmeasured remainder is unmeasured, not passing** — see the coverage ceiling above.',
  ];
  if (runsPerArm <= 3) {
    out.push(
      `**N=${runsPerArm} is a weak split.** A perfect separation of ${runsPerArm * 2} runs is roughly p=0.05 by permutation. Clean, not deep.`
    );
  }

  // The isolation scope is reported on every record, not only when it is
  // interesting. A reader who cannot see how far the control arm reached cannot
  // tell an isolated verdict from the unisolated ones this Epic exists to fix.
  const deletions = canary.deletions ?? [];
  out.push(
    `**Isolation scope: \`${canary.isolation ?? 'undeclared'}\`.** The control arm deleted the instruction from ${deletions.length} declared site(s): ${deletions.map(d => `\`${d.file}\``).join(', ')}. Sites that teach or document the rule without ordering it were deliberately left in place — a control stripped of the reference docs is a different agent, not the same agent minus one instruction.`
  );

  const sectionSites = deletions.filter(d => d.section);
  if (sectionSites.length > 0) {
    out.push(
      `**The control removed ${sectionSites.length === 1 ? 'a whole section' : 'whole sections'}** (${sectionSites.map(d => `\`${d.file}\` § \`${d.section.trim()}\``).join('; ')}), so anything else stated in ${sectionSites.length === 1 ? 'it' : 'them'} was removed too. Read those sections before attributing the difference to this instruction alone.`
    );
  }

  // AC3.3 — what the control agent could still read about the instruction, named
  // rather than summarised. Descriptive residue does NOT block a run (AC3.2): it
  // is legitimate for the schema reference and the capability itself to survive.
  // But an unstated remainder is how `B55` stayed invisible for two releases, so
  // the record carries the list and lets the reader judge.
  if (descriptiveResidue.length > 0) {
    const byFile = [...new Set(descriptiveResidue.map(h => h.file))];
    out.push(
      `**Descriptive residue survived, by design** (${descriptiveResidue.length} mention(s) across ${byFile.length} file(s): ${byFile.map(f => `\`${f}\``).join(', ')}). These state or implement the rule without ordering it, so deleting them would produce a differently-invalid control. They were reviewed and allowlisted, not overlooked — but the control agent could read them, and that is part of this verdict's scope.`
    );
  }

  if (dirty) {
    out.push('**The working tree was DIRTY at run time** — the recorded commit does not fully describe the code that ran, and this run is not reproducible from the sha alone.');
  }
  return out;
}
