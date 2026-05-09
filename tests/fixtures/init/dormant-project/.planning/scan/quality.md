# Quality Scan

## Test Runners

| Runner | Version | Config | Test File Count |
|---|---|---|---|
| RSpec | 3.9.0 | `.rspec` + `spec/spec_helper.rb` | 9 (`spec/*_spec.rb`) |

## CI Configuration

- **Platform(s):** Travis CI (legacy)
- **Workflow files:** `.travis.yml`
- **CI runs tests:** historically yes; Travis OSS has been deprecated for years and the build is almost certainly red or unrun.
- **CI runs on PRs:** N/A (Travis OSS sunset)

(Travis CI's OSS tier was deprecated in 2021. The `.travis.yml` is effectively dead config — a strong signal the project hasn't been maintained for CI in years. **Worth flagging in LANDSCAPE's Open Questions for the user** — does CI need to be migrated, or is the project being read for archaeology only?)

## Lint / Format Tooling

| Tool | Config | Notes |
|---|---|---|
| (none detected) | — | No `.rubocop.yml`, no `.editorconfig`, no `Rakefile` lint task |

## README

- **Path:** `README.md`
- **Size:** 52 lines
- **Sections present:** Photolog / Setup / Running / Testing / License
- **First 30 lines:**

```
# Photolog

A small Sinatra web app for organizing photos by album and tag. Personal-scale.
SQLite by default; configurable for Postgres via `DATABASE_URL`.

## Setup

    bundle install
    bundle exec rake db:migrate

## Running

    bundle exec puma -C config/puma.rb

## Testing

    bundle exec rspec
```

## CHANGELOG

- **Path:** (absent)
- **Last updated:** N/A
- **Latest declared version:** N/A
- **Freshness:** (no CHANGELOG)

## Open Work Signals

- **TODO/FIXME/HACK count:** 28
- **Top files by marker count:**

  | File | Markers |
  |---|---|
  | `lib/photolog/models/photo.rb` | 7 |
  | `lib/photolog/web.rb` | 6 |
  | `lib/photolog/helpers/thumbnails.rb` | 5 |
  | `views/album/show.erb` | 4 |

- **Sample markers:**
  - `# TODO: rewrite thumbnail cache to use ActiveStorage-style hashed paths`
  - `# FIXME: tag normalization is case-sensitive; should fold to lowercase`
  - `# HACK: monkey-patch Sequel::Model to allow nil titles for legacy data`

(28 markers across a 47-file codebase = elevated debt density. Combined with the dormant status, suggests a project that drifted into stagnation rather than reached a clean stopping point.)

## License

- **Detected:** MIT
- **Source:** `LICENSE` (root file)

## Notes

- The Travis CI config + the lack of any modern lint tooling + the 28 TODOs paint a consistent picture: this project was actively maintained for several years and then drifted into low-touch dormancy.
- No CHANGELOG means version history is purely git-log-derived.

## Detection Failures

- (none)
