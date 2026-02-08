#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="asp-skill"
STANDALONE_REPO="$HOME/code/skills/asp-skill"

if [ -d "$STANDALONE_REPO" ] && [ -f "$STANDALONE_REPO/install.sh" ]; then
  echo "Found standalone skill repo at $STANDALONE_REPO"
  bash "$STANDALONE_REPO/install.sh"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
  BUNDLED_SKILL="$MONOREPO_ROOT/.agents/skills/$SKILL_NAME"

  if [ ! -d "$BUNDLED_SKILL" ]; then
    echo "Warning: No skill source found (checked $STANDALONE_REPO and $BUNDLED_SKILL), skipping skill install."
    exit 0
  fi

  echo "Standalone repo not found, falling back to bundled skill at $BUNDLED_SKILL"

  CLAUDE_SKILLS_DIR="$HOME/.claude/skills"
  AMP_SKILLS_DIR="$HOME/.config/agents/skills"

  create_symlink() {
    local target_dir="$1"
    local link_path="$target_dir/$SKILL_NAME"

    mkdir -p "$target_dir"

    if [ -L "$link_path" ]; then
      existing="$(readlink "$link_path")"
      if [ "$existing" = "$BUNDLED_SKILL" ]; then
        echo "  ✓ $link_path already points to $BUNDLED_SKILL"
        return 0
      fi
      echo "  Updating symlink $link_path -> $BUNDLED_SKILL (was $existing)"
      rm "$link_path"
    elif [ -e "$link_path" ]; then
      echo "  ⚠ $link_path exists and is not a symlink, skipping"
      return 0
    fi

    ln -s "$BUNDLED_SKILL" "$link_path"
    echo "  ✓ Created symlink $link_path -> $BUNDLED_SKILL"
  }

  echo "Installing $SKILL_NAME skill..."
  create_symlink "$CLAUDE_SKILLS_DIR"
  create_symlink "$AMP_SKILLS_DIR"
  echo "Done."
fi
