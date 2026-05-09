# Structure Scan

## Top-Level Inventory

### Source-shaped directories
- `lib/photolog/` — Ruby source (Sinatra app + Sequel models + helpers)
- `views/` — ERB templates

### Test-shaped directories
- `spec/` — 9 files (`*_spec.rb`)

### Doc-shaped directories
- (none) — only README.md

### CI / tooling
- `.travis.yml` — Travis CI config (legacy; service deprecated for OSS)

### Standard project files
- `README.md` — present (52 lines)
- `LICENSE` — present (MIT)
- `CHANGELOG` / `CHANGELOG.md` — absent
- `CONTRIBUTING.md` — absent

### Other top-level entries
- `Gemfile` + `Gemfile.lock`
- `.ruby-version` (`2.7.2`)
- `config.ru`
- `config/database.yml`

## Monorepo Detection

- **Type:** single-repo
- **Workspace tool:** (none)
- **Sub-package count:** N/A
- **Sub-packages:** N/A

## Source Tree (depth-3)

Source root: `lib/photolog/` (chosen because: standard Ruby app layout under `lib/<name>/`).

| Path | Annotation |
|---|---|
| `lib/photolog.rb` | Top-level requires |
| `lib/photolog/web.rb` | Modular Sinatra base |
| `lib/photolog/models/` | Sequel models (Album, Photo, Tag) |
| `lib/photolog/helpers/` | View helpers |
| `views/` | ERB templates |
| `spec/` | RSpec specs (9) |
| `config/` | DB config + rackup |

## Test Surface (organizational view)

- **Dedicated directories:** `spec/`
- **Co-located:** no
- **By-name detection:** 9 files matched `*_spec.rb`
- **Net assessment:** tests in dedicated directory

## Documentation Surface

- **Dedicated directory:** (none)
- **Tooling:** (none)
- **README size:** 52 lines
- **Other docs:** (none)

## Notes

- Ruby web app shape from the mid-2010s — Sinatra + Sequel + Puma, ERB views, Travis CI. Conventional for its era.
- Absence of CHANGELOG combined with absence of recent commits is a non-trivial signal for a brownfield user evaluating whether to revive vs. replace.

## Detection Failures

- (none)
