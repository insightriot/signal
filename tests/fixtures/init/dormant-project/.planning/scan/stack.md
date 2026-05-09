# Stack Scan

## Languages

| Language | Files | LOC (approx) | % of code |
|---|---|---|---|
| Ruby | 34 | 2,180 | 88% |
| ERB | 6 | 210 | 8% |
| Markdown | 3 | 95 | 4% |
| YAML | 4 | 62 | (config) |

Total source files (excluding vendored): 47

## Package Managers + Manifests

### Ruby

- **Manifest:** `Gemfile` (no gemspec — service, not a library)
- **Lockfile:** `Gemfile.lock` (Bundler)
- **Top dependencies:**
  - `sinatra` (1.4.8)
  - `sequel` (5.20.0)
  - `puma` (4.3.5)
- **devDependencies (under `:test` group):**
  - `rspec` (3.9.0), `rack-test` (1.1.0)
- **Runtime constraint:** `ruby '2.7.2'` (`.ruby-version` present)

## Frameworks Detected

| Framework | Version | Marker File | Notes |
|---|---|---|---|
| Sinatra | 1.4.8 | `Gemfile` + `lib/photolog/web.rb` (`Sinatra::Base` subclass) | Modular Sinatra app, not classic top-level |

## Runtime / Deployment

- **Container:** (no Dockerfile)
- **Edge / serverless:** (none detected)
- **Mobile / desktop:** (none)
- **Process manager hint:** Puma rackup config in `config.ru`

## Notes

- Ruby 2.7 is end-of-life (community support ended 2023-03). Indicates the project hasn't been touched for upgrades in some time.
- Bundler lockfile exists but reflects pre-2.0 Sinatra; Sinatra 3.x has been stable for years.

## Detection Failures

- (none)
