#!/usr/bin/env bash
set -euo pipefail

# ================================================
# ASP CLI Installer
# ================================================
# Installs the `asp` command globally.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/KarthikRaju391/agent-solution-protocol/main/scripts/install-cli.sh | bash
#
# Requires: Node.js 20+, git
# ================================================

INSTALL_DIR="${ASP_INSTALL_DIR:-$HOME/.asp}"
REPO_URL="https://github.com/KarthikRaju391/agent-solution-protocol.git"
BIN_LINK="/usr/local/bin/asp"

echo ""
echo "  Installing ASP CLI..."
echo ""

# --- Check prerequisites ---
for cmd in node git; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "  Error: '$cmd' is required but not found." >&2
    exit 1
  fi
done

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "  Error: Node.js 20+ required (found $(node -v))" >&2
  exit 1
fi

# Enable pnpm via corepack
if ! command -v pnpm &>/dev/null; then
  echo "  Enabling pnpm via corepack..."
  corepack enable 2>/dev/null || npm install -g pnpm@9
fi

# --- Clone or update ---
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Updating existing installation..."
  git -C "$INSTALL_DIR" pull --quiet
else
  echo "  Cloning repository..."
  git clone --quiet "$REPO_URL" "$INSTALL_DIR"
fi

# --- Build ---
echo "  Installing dependencies..."
cd "$INSTALL_DIR"
pnpm install --frozen-lockfile --silent 2>/dev/null || pnpm install --silent

echo "  Building..."
pnpm build --silent 2>/dev/null || pnpm build

# --- Link binary ---
ASP_BIN="$INSTALL_DIR/apps/cli/dist/index.js"
if [ ! -f "$ASP_BIN" ]; then
  echo "  Error: Build failed - $ASP_BIN not found" >&2
  exit 1
fi

# Try /usr/local/bin first (needs sudo), fall back to ~/.local/bin
if [ -w "$(dirname "$BIN_LINK")" ] || [ -w "$BIN_LINK" ] 2>/dev/null; then
  ln -sf "$ASP_BIN" "$BIN_LINK"
  echo "  Linked asp -> $BIN_LINK"
else
  LOCAL_BIN="$HOME/.local/bin"
  mkdir -p "$LOCAL_BIN"
  ln -sf "$ASP_BIN" "$LOCAL_BIN/asp"
  echo "  Linked asp -> $LOCAL_BIN/asp"
  if ! echo "$PATH" | grep -q "$LOCAL_BIN"; then
    echo ""
    echo "  Add this to your shell profile (~/.bashrc or ~/.zshrc):"
    echo "    export PATH=\"$LOCAL_BIN:\$PATH\""
  fi
fi

# --- Install skill for Claude/agent integration ---
if [ -f "$INSTALL_DIR/apps/cli/scripts/install-skill.sh" ]; then
  echo "  Installing ASP skill for agent integration..."
  bash "$INSTALL_DIR/apps/cli/scripts/install-skill.sh" 2>/dev/null || true
fi

echo ""
echo "  Done! Run 'asp version' to verify."
echo ""
echo "  Set your registry URL:"
echo "    export ASP_REGISTRY_URL=https://asp-registry-blpqs.sprites.app"
echo ""
echo "  Quick start:"
echo "    asp search \"TypeError\"        # Search for solutions"
echo "    asp create -o packet.json     # Create a solved packet"
echo "    asp submit packet.json        # Submit to registry"
echo ""
