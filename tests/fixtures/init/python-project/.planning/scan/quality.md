# Quality Scan

## Test Runners

| Runner | Version | Config | Test File Count |
|---|---|---|---|
| pytest | 8.2.0 | `pyproject.toml [tool.pytest.ini_options]` | 11 (`tests/test_*.py`) |

## CI Configuration

- **Platform(s):** (none detected)
- **Workflow files:** (none — no `.github/workflows/`, no `.gitlab-ci.yml`, no other CI config)
- **CI runs tests:** N/A
- **CI runs on PRs:** N/A

(No CI is unusual for a 1-year-old project with a real test suite. **Worth flagging in LANDSCAPE's Open Questions for the user** — is CI intentionally absent, or simply not yet set up?)

## Lint / Format Tooling

| Tool | Config | Notes |
|---|---|---|
| Ruff | `pyproject.toml [tool.ruff]` | Lint + isort rules enabled |
| Black | `pyproject.toml [tool.black]` | line-length 100 |

(No type checker config detected — no `mypy.ini`, no `[tool.mypy]` block, no `pyright` config.)

## README

- **Path:** `README.md`
- **Size:** 62 lines
- **Sections present:** What is wayfinder / Install / Usage / Development / License
- **First 30 lines:**

```
# wayfinder

A small place-search service. Given a query and an optional region code, returns
ranked place results with coordinates and metadata. Backed by SQLAlchemy + a
seed dataset; no external API dependencies.

## Install

    python -m venv .venv
    source .venv/bin/activate
    pip install -e ".[dev]"
```

## CHANGELOG

- **Path:** (absent)
- **Last updated:** N/A
- **Latest declared version:** N/A
- **Freshness:** (no CHANGELOG)

## Open Work Signals

- **TODO/FIXME/HACK count:** 5
- **Top files by marker count:**

  | File | Markers |
  |---|---|
  | `src/wayfinder/routes/search.py` | 2 |
  | `src/wayfinder/models/place.py` | 2 |
  | `tests/test_search.py` | 1 |

- **Sample markers:**
  - `# TODO: paginate results once the seed dataset grows past 10k rows`
  - `# FIXME: lat/lng bounds check accepts antipodal pairs by mistake`

## License

- **Detected:** BSD-3-Clause
- **Source:** `LICENSE` (root file) + `pyproject.toml` `license = {text = "BSD-3-Clause"}`

## Notes

- Lint + format are wired (ruff + black) but no type checking — gap worth flagging.
- README + Sphinx docs are both current; documentation discipline is good.

## Detection Failures

- (none)
