#!/bin/bash
set -euo pipefail

# Install project skills to global Claude config on session start
SKILLS_SRC="$CLAUDE_PROJECT_DIR/.claude/skills"
SKILLS_DEST="$HOME/.claude/skills"

if [ -d "$SKILLS_SRC" ]; then
  mkdir -p "$SKILLS_DEST"
  cp -r "$SKILLS_SRC/." "$SKILLS_DEST/"
  echo "[session-start] Skills geïnstalleerd: $(ls "$SKILLS_SRC")"
fi

# Install project dependencies
if [ -f "$CLAUDE_PROJECT_DIR/package.json" ]; then
  cd "$CLAUDE_PROJECT_DIR"
  npm install --silent
  echo "[session-start] npm install klaar"
fi
