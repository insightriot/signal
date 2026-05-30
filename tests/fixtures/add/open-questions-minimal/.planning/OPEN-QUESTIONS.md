# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

---

## Should the cache TTL be configurable

**Status:** Open — surfaced during the first dogfood pass.

We hardcode a 30s TTL today. A few flows want longer; none yet want shorter.

**Watch for** real-user flows that need a different TTL.

**Resolve by:** post-v1 with usage data.

---

## Do we need a second log level

**Status:** Open.

Debug vs. info might not be enough granularity.

**Resolve by:** when a contributor asks.

---
