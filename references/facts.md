# Signal — canonical facts

Source-of-truth for facts cross-cited in `README.md` and `SECURITY.md`. Other docs reference these values verbatim; the cross-file consistency test (`tests/cross-file-consistency.test.js`) asserts that the referenced docs match what's here.

**Update HERE first.** The consistency tests will catch drift in the docs that cite these values.

---

## Runtime

- **Node.js:** 22+
- **Claude Code:** 2.1.141+
- **Operating system:** Verified on macOS; Linux/WSL untested.

## Dependencies

- **Runtime:** `yaml` (1 dependency).
- **Development:** `vitest`, `esbuild`, `eslint`.

## Test surface

- **Test count:** 387

Placeholder during M4.5.E3 EXECUTE. Set to the post-Slice-2 final count at S2.t7 (CHANGELOG + Epic close) after S2.t2's consistency tests + S2.t5's SECURITY.md land.

## License + repo

- **License:** MIT.
- **Repository:** https://github.com/InsightRiot/signal
