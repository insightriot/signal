#!/usr/bin/env bash
#
# upstream-sync.sh — refresh every clone under .upstream/
#
# Usage:
#   scripts/upstream-sync.sh          # pull all repos, print summary
#   scripts/upstream-sync.sh --quiet  # only print repos with new commits
#
# Exit code is always 0 unless a repo is in a non-fast-forward state
# (which means someone made local edits — we refuse to clobber them).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
UPSTREAM_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/.upstream"

QUIET=0
[[ "${1:-}" == "--quiet" ]] && QUIET=1

if [[ ! -d "$UPSTREAM_DIR" ]]; then
  echo "no .upstream/ directory at $UPSTREAM_DIR — nothing to sync" >&2
  exit 0
fi

updated=0
unchanged=0
failed=0
summary=""

shopt -s nullglob
for repo in "$UPSTREAM_DIR"/*/; do
  repo="${repo%/}"
  name="$(basename "$repo")"

  [[ -d "$repo/.git" ]] || continue

  before="$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo "")"

  if ! out="$(git -C "$repo" pull --ff-only --quiet 2>&1)"; then
    failed=$((failed + 1))
    summary+="  FAIL  $name :: $(echo "$out" | head -1)"$'\n'
    continue
  fi

  after="$(git -C "$repo" rev-parse HEAD 2>/dev/null || echo "")"

  if [[ "$before" == "$after" ]]; then
    unchanged=$((unchanged + 1))
    [[ $QUIET -eq 0 ]] && summary+="  ----  $name  (no change)"$'\n'
  else
    new_count="$(git -C "$repo" rev-list --count "$before..$after" 2>/dev/null || echo "?")"
    latest="$(git -C "$repo" log -1 --format='%cs %s' "$after" 2>/dev/null | cut -c1-72)"
    updated=$((updated + 1))
    summary+="  NEW   $name  (+$new_count commit$([ "$new_count" = "1" ] || echo s))  $latest"$'\n'
  fi
done

echo "upstream-sync: $updated updated, $unchanged unchanged, $failed failed"
[[ -n "$summary" ]] && printf '%s' "$summary"

exit $((failed > 0 ? 1 : 0))
