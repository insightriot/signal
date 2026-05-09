# Structure Scan

## Top-Level Inventory

### Source-shaped directories
- `src/wayfinder/` — Python source, src-layout package

### Test-shaped directories
- `tests/` — 11 files (`test_*.py`)

### Doc-shaped directories
- `docs/` — Sphinx docs (1 conf, ~6 rst files)

### CI / tooling
- (none — no `.github/`, no `.gitlab-ci.yml`, no `tox.ini`)

### Standard project files
- `README.md` — present (62 lines)
- `LICENSE` — present (BSD-3-Clause)
- `CHANGELOG` / `CHANGELOG.md` — absent
- `CONTRIBUTING.md` — absent

### Other top-level entries
- `pyproject.toml`
- `requirements.txt`
- `.gitignore`

## Monorepo Detection

- **Type:** single-repo
- **Workspace tool:** (none)
- **Sub-package count:** N/A
- **Sub-packages:** N/A

## Source Tree (depth-3)

Source root: `src/wayfinder/` (chosen because: standard Python `src/<pkg>/` layout, with `__init__.py` present).

| Path | Annotation |
|---|---|
| `src/wayfinder/__init__.py` | Package init |
| `src/wayfinder/app.py` | Flask application factory |
| `src/wayfinder/routes/` | Blueprint route modules |
| `src/wayfinder/models/` | SQLAlchemy ORM models |
| `src/wayfinder/schemas/` | Pydantic request/response schemas |
| `tests/` | pytest test files (11) |
| `docs/` | Sphinx documentation |

## Test Surface (organizational view)

- **Dedicated directories:** `tests/`
- **Co-located:** no
- **By-name detection:** 11 files matched `test_*.py`
- **Net assessment:** tests in dedicated directory

## Documentation Surface

- **Dedicated directory:** `docs/` (Sphinx)
- **Tooling:** Sphinx (`docs/conf.py` present)
- **README size:** 62 lines
- **Other docs:** Sphinx-rendered API reference under `docs/`

## Notes

- Standard PEP 621 src-layout; tests outside the package; Sphinx for API docs.

## Detection Failures

- (none)
