#!/bin/bash
# Session start hook — loads plugin context and checks state
# Runs automatically when a Claude Code session begins with this plugin

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(dirname "$(dirname "$0")")}"
STATE_DIR="${PLUGIN_ROOT}/state"
CONFIG_FILE="${STATE_DIR}/config.json"

# Verify state directory exists
if [ ! -d "$STATE_DIR" ]; then
  echo "[skills-gsd] State directory not found. Run /hybrid-new-project to initialize."
  exit 0
fi

# Report active project state if .planning/ exists in the working directory
if [ -d ".planning" ]; then
  if [ -f ".planning/STATE.md" ]; then
    echo "[skills-gsd] Active project detected. Current state:"
    head -20 ".planning/STATE.md"
  fi
fi

echo "[skills-gsd] Plugin loaded. Commands: /hybrid-new-project, /hybrid-discuss, /hybrid-plan, /hybrid-execute, /hybrid-verify, /hybrid-review, /hybrid-ship"
