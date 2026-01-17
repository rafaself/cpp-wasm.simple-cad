#!/bin/bash
#
# Setup git hooks for the project
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$SCRIPT_DIR/hooks"
GIT_HOOKS_DIR="$(git rev-parse --git-dir)/hooks"

echo "Installing git hooks..."

# Install commit-msg hook
if [ -f "$HOOKS_DIR/commit-msg" ]; then
  cp "$HOOKS_DIR/commit-msg" "$GIT_HOOKS_DIR/commit-msg"
  chmod +x "$GIT_HOOKS_DIR/commit-msg"
  echo "  - commit-msg hook installed"
fi

echo ""
echo "Git hooks installed successfully!"
echo ""
echo "Commit format: <type>(<scope>): <description>"
echo "Example: feat(ui): add dark mode toggle"
