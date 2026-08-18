# Third-Party License Attributions

This project integrates and adapts work from two open-source projects. Both are licensed under the MIT License.

---

## Agent Skills

**Repository:** https://github.com/addyosmani/agent-skills

Skill files in `skills/` and reference checklists in `references/` (security-checklist.md, performance-checklist.md, testing-checklist.md, accessibility-checklist.md) are adapted from Agent Skills.

```
MIT License

Copyright (c) 2025 Addy Osmani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## GSD (Get Shit Done)

**Repository:** https://github.com/gsd-build/get-shit-done

Agent patterns in `agents/`, execution architecture, wave-based parallel execution, `.planning/` state management, and context monitoring are adapted from GSD.

```
MIT License

Copyright (c) 2025 Lex Christopherson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Planned Integrations (v2)

The following repositories are analyzed and planned for integration in Signal's v2 architecture (see `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`). Code has not yet been ported from these projects, but specific patterns, workflows, and structures have informed Signal's design. Each project's license will be honored per its terms; full license texts will be added here when code is actually ported.

### gstack

**Repository:** https://github.com/garrytan/gstack
**Author:** Garry Tan
**Planned contributions to Signal:** 15-phase CSO security audit (replaces Agent Skills' `security-and-hardening` skill in v2), `/office-hours` product reframing pattern, `/retro` + `/learn` memory loop, `/freeze` + `/careful` hard-gate mechanism, design-review pattern.

### pm-skills

**Repository:** https://github.com/phuryn/pm-skills
**Author:** phuryn
**Planned contributions to Signal:** Upstream PM layer — `/discover` workflow (ideation + assumption mapping), `/strategy` workflow (Lean Canvas, VPD, BMC), `/write-prd` workflow, Opportunity Solution Trees, pre-mortem, beachhead + ICP for GTM phase.

### superpowers

**Repository:** https://github.com/obra/superpowers
**Author:** Jesse Vincent (obra)
**Planned contributions to Signal:** `test-driven-development` skill (replaces Agent Skills' TDD in v2), `systematic-debugging` 4-phase structure, `<HARD-GATE>` tag mechanism, anti-rationalization table format.

### compound-engineering

**Repository:** https://github.com/EveryInc/compound-engineering-plugin
**Author:** Every Inc
**Planned contributions to Signal:** Compound memory phase (new Phase 10 in v2), `learnings-researcher` + `session-historian` agents, multi-lens review panel pattern, conventional commits + release automation.

---

## Pattern Sources

The following repositories contributed architectural ideas to Signal's design without being full ports. They are acknowledged here for intellectual attribution.

### planning-with-files

**Repository:** https://github.com/OthmanAdi/planning-with-files
**Author:** OthmanAdi
**Patterns drawn on:** Disk-as-cognitive-scaffold discipline, 2-Action Rule, hook-driven context re-reads on `PostToolUse`, findings-quarantine pattern for untrusted external data.

### oh-my-claudecode

**Repository:** https://github.com/Yeachan-Heo/oh-my-claudecode
**Author:** Yeachan-Heo
**Patterns drawn on:** `deep-interview` with 20% ambiguity gate for spec rigor, consensus planning (planner + architect + critic), `visual-verdict` screenshot-diff review, lifecycle hook architecture.

---

## Reference: GSD Skill Creator

**Repository:** https://github.com/Tibsfox/gsd-skill-creator
**Author:** Tibsfox
**Reference use:** Format-bridging precedent between GSD workflows and Agent Skills; DACP protocol study. No code ported.

---

## Redistributed verbatim: `yaml`

Everything above is a pattern source — ideas adapted into Signal's own files. **This one is
different: the package is redistributed as published, unmodified,** at
`plugin/node_modules/yaml/`, so that installing the plugin never has to install anything
(`D-M6E1-7`). Its own `LICENSE` travels with the copy; this entry exists so the obligation is
discharged somewhere a reader looks, not only inside a vendored directory.

**Package:** `yaml@2.8.3`
**Repository:** https://github.com/eemeli/yaml
**Author:** Eemeli Aro <eemeli@gmail.com>
**License:** ISC
**Used by:** `plugin/tools/lib/profile.js` and `plugin/tools/lib/state.js` — the only external import
in Signal's shipped surface. Everything else is a `node:` builtin.

### Provenance — how to check this copy is really `yaml`

`AC3.7` calls the vendored copy *"faithful and provable."* It was only provable by diffing it against
your own `npm install`, which requires already trusting your own install. **Recorded at REVIEW so a
third party can verify it without that assumption:**

| | |
|---|---|
| Obtained by | `npm pack yaml@2.8.3` on 2026-08-17 |
| Tarball | `yaml-2.8.3.tgz`, 111,837 bytes, 233 files |
| Tarball SHA-256 | `9539805d7447def2bed5c5b4acacc283362c5e80abc5d93472b2f35f0cbf85ad` |
| Extracted with | `tar -xzf yaml-2.8.3.tgz -C plugin/node_modules/yaml --strip-components=1` |
| Modifications | **None.** Nothing added, removed, or edited — including the 456 KB `browser/` build, which Node never loads but which is part of the published package |

To re-verify: run `npm pack yaml@2.8.3`, compare the SHA-256, extract, and diff against
`plugin/node_modules/yaml/`.

**Audited at REVIEW, and stated rather than assumed:** the package declares **no dependencies and no
peer dependencies**; the shipped code contains **no `http`/`https`/`net`/`child_process` import, no
`fetch`, no `eval`, and no `Function` constructor**. Its `package.json` does carry npm lifecycle
scripts (`prepublishOnly`, `preversion`), which are the **author's** publish-time scripts and never
run for a consumer — and cannot run here regardless, because the plugin root has no `package.json`
or lockfile, so nothing ever installs in it.

```
Copyright Eemeli Aro <eemeli@gmail.com>

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND
FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS
OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER
TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```
