#!/bin/bash
# Session start hook — loads plugin context and checks state
# Runs automatically when a Claude Code session begins with this plugin

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
STATE_DIR="${PLUGIN_ROOT}/state"
CONFIG_FILE="${STATE_DIR}/config.json"

# Verify state directory exists
if [ ! -d "$STATE_DIR" ]; then
  echo "[signal] State directory not found. Run /sig:new-project to initialize."
  exit 0
fi

# Report active project state if .planning/ exists in the working directory
if [ -d ".planning" ]; then
  if [ -f ".planning/STATE.md" ]; then
    echo "[signal] Active project detected. Current state:"
    head -20 ".planning/STATE.md"
  fi
fi

# Read from commands/ — a hand-kept list here named 9 of 24 commands by v0.1.53.
COMMANDS=""
for f in "${PLUGIN_ROOT}"/commands/*.md; do
  [ -e "$f" ] || continue
  COMMANDS="${COMMANDS:+${COMMANDS}, }/sig:$(basename "$f" .md)"
done
echo "[signal] Plugin loaded. Commands: ${COMMANDS}"
