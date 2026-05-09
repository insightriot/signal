# Activity Scan

## Repo Lifetime

- **First commit:** 2017-09-04 (~8.6 years ago)
- **Last commit:** 2025-08-02 (~9 months ago)
- **Total commits:** 218
- **Project age:** 3,156 days

## Commit Cadence

| Window | Commits | Avg/week |
|---|---|---|
| Last 30 days | 0 | 0 |
| Last 90 days | 0 | 0 |
| Last 365 days | 4 | 0.08 |

## Contributors (90 days)

- **Total unique:** 0
- **Top contributors:**

  | Name | Commits |
  |---|---|
  | (none in window) | 0 |

(Lifetime top contributor: `dakota-finch` — 192 commits — but no activity in the 90-day window.)

## Hot Files (90 days, lockfiles excluded)

| File | Commits |
|---|---|
| (none — no commits in 90-day window) | 0 |

(Top hot files in the last 365-day window — for context only, not a primary signal:)

| File | Commits (365d) |
|---|---|
| `Gemfile.lock` | 2 |
| `lib/photolog/models/photo.rb` | 1 |
| `README.md` | 1 |

## Commit-Message Convention

- **Dominant pattern:** free-form (descriptive; predates Conventional Commits adoption in this project)
- **Sample subjects:**
  - `Bump puma to 4.3.5 (CVE-2020-11077 backport)`
  - `Fix N+1 in album#show`
  - `Adjust thumbnail cache TTL`

## Branch State

- **Default branch:** `master`
- **Current branch:** `master`
- **Stale branches:** 6 (no commits in 60+ days; most are >2 years stale)

## Health Classification

- **Status:** dormant
- **Reasoning:** rule 2 fired — last commit ~9 months ago (within the 6-to-18-month dormant window).

## Most Recent Commits

| Date | Author | Subject |
|---|---|---|
| 2025-08-02 | dakota-finch | Bump puma to 4.3.5 (CVE-2020-11077 backport) |
| 2025-06-14 | dakota-finch | Fix N+1 in album#show |
| 2025-04-22 | dakota-finch | Adjust thumbnail cache TTL |
| 2025-01-09 | dakota-finch | Update README installation steps |

## Notes

- Default branch is `master` (predates the 2020-era `main` rename).
- Long history (8+ years), single dominant author, recent activity is sparse security backports — classic dormant-but-not-archived shape.
- No `ARCHIVED` or `DEPRECATED` marker file at root, so rule 1 did not fire.

## Detection Failures

- (none)
