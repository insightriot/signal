# Issues Inbox

Minimal fixture for `/sig:add` S1 back-compat tests. Mirrors the shape of the real `.planning/ISSUES-INBOX.md` (heading → entries separated by `---` → trailing `*Last updated:*` footer) but kept short for snapshot stability. This is the v3-named inbox; the sibling `future-ideas-minimal` fixture proves the legacy name still resolves.

Append new ideas; the planning drain classifies and promotes from here.

---

## Existing inbox entry one

**Status:** Logged 2026-07-15. Fixture content for regression testing.

**Context.** This entry exists so the fixture has a realistic "prior content" surface. The /sig:add tests assert that this content is preserved verbatim after a new entry is appended.

**Resolve by:** never — this is fixture data.

---

## Existing inbox entry two

**Status:** Logged 2026-07-16. Second fixture entry.

Body content with a *italic span* and a `code span` and a [link](https://example.com).

**Resolve by:** never — fixture.

---

*Last updated: 2026-07-16*
