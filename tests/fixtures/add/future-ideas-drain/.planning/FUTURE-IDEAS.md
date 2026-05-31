# Future Ideas

Intro paragraph — file preamble, not an entry. The first `## ` heading below
opens the first real entry.

---

## Canonical candidate via add

**Status:** Logged 2026-05-27 via `/sig:add`.

A normal capture that should surface as a drain candidate.

---

## Hand-authored candidate

**Status:** Logged 2026-05-20 during a planning conversation.

No `/sig:add` marker — still a genuine candidate.

---

## Candidate with a fenced block and nested heading

**Status:** Logged 2026-05-21.

This entry embeds a code fence whose contents must NOT be parsed as document
structure — neither the fenced `## ` line nor the fenced `**Status:**` line:

```markdown
## Not a real heading

**Status:** Deferred 2099-01-01 (fake drain stamp inside a fence).
```

### A nested h3 subheading

The nested `###` must not split this entry into two.

---

## Candidate dated in heading (2026-05-19)

A genuine candidate whose only date lives in the heading — there is no
`**Status:**` line at all.

---

## ✓ SHIPPED — Already-shipped thing

**Status:** Logged 2026-05-02; shipped 2026-05-15.

Dispositioned via the `✓ SHIPPED` heading marker — must be skipped.

---

## Already-drained candidate

**Status:** Logged 2026-05-18 via `/sig:add`. → Deferred 2026-05-30 (M4.5.E2 drain).

Dispositioned via the inline drain stamp on its Status line — must be skipped.

---

*Last updated: 2026-05-24*

## Entry below the orphaned footer

**Status:** Logged 2026-05-25.

A genuine candidate sitting BELOW a mid-file `*Last updated:*` footer — the
parser must tolerate the orphaned footer and still surface this entry.

---
