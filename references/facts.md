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

- **Test count:** 2265

Set at each release by `tools/cut-release.js`, from the same `vitest` run that gates the release — most recently **v0.1.18 (2026-08-04)**. Deriving it any other way undercounts: several suites generate cases in a loop. The cross-file consistency test (`tests/cross-file-consistency.test.js`) asserts that any test-count mention in README or SECURITY.md matches this value.

## License + repo

- **License:** MIT.
- **Repository:** https://github.com/InsightRiot/signal
