# Stack Scan

## Languages

| Language | Files | LOC (approx) | % of code |
|---|---|---|---|
| Python | 22 | 1,510 | 82% |
| Markdown | 4 | 240 | 13% |
| TOML | 2 | 78 | (config) |
| YAML | 1 | 22 | 5% |

Total source files (excluding vendored): 29

## Package Managers + Manifests

### Python

- **Manifests:** `pyproject.toml` (PEP 621 metadata; build backend `hatchling`), `requirements.txt` (pinned runtime deps)
- **Lockfile:** (none — `requirements.txt` serves as pinned set; no `poetry.lock` or `uv.lock`)
- **Top dependencies:**
  - `flask==3.0.3`
  - `sqlalchemy==2.0.30`
  - `pydantic==2.7.1`
- **devDependencies (under `[project.optional-dependencies].dev`):**
  - `pytest==8.2.0`, `ruff==0.4.4`, `black==24.4.2`, `httpx==0.27.0`
- **Runtime constraint:** `python_requires = ">=3.11"`

## Frameworks Detected

| Framework | Version | Marker File | Notes |
|---|---|---|---|
| Flask | 3.0.3 | `pyproject.toml` deps + `src/wayfinder/app.py` (`Flask(__name__)`) | Classic Flask app factory pattern |

## Runtime / Deployment

- **Container:** (no Dockerfile)
- **Edge / serverless:** (none detected)
- **Mobile / desktop:** (none)

## Notes

- Pure Python; no native deps requiring compilation toolchain.
- `pyproject.toml` is canonical metadata; `requirements.txt` exists for pip-only environments.

## Detection Failures

- (none)
