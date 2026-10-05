# Bugs

| ID | Status | Pri | Summary |
|---|---|---|---|
| B1 | `fixed` | P2 | **Resume ignores the Epic profile** — fixed in M6.E1. |
| B2 | `confirmed` | P1 | **Doctor misreads a missing key** as a pass. |
| B3 | `confirmed` | P2 | **Drain crashes on an empty inbox** — reported twice. |
| B5 | `dismissed` | P3 | **Status colours look off** — terminal theme, not ours. |
| B6 | `confirmed (regression)` | P1 | **Checkpoint drops the last question.** |

A sample row in a fence is not an entry:

```
| B7 | `confirmed` | P1 | sample only |
```

## Lock left behind after a crash

**Status:** needs-triage

A killed run leaves `.state.lock` behind.

---

*0 needs-triage · **1 captured-untriaged** · 3 confirmed · 1 dismissed · 2 fixed (**7 total**). Last updated: 2026-01-10.*
