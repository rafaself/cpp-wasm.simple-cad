#!/bin/bash

# Definition of forbidden patterns
# - #hex (3 or 6 digits)
# - rgb(
# - rgba(
# - bg-slate-, text-slate-, border-slate- (Raw palette)

PATTERN="(#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?)|(rgb\()|(rgba\()|(bg-slate-)|(text-slate-)|(border-slate-)"

# Directories/Files to exclude
# - node_modules
# - dist
# - .git
# - theme/ (Where tokens are defined)
# - styles/recipes.ts (Where recipes map to tokens - technically shouldn't use slate here either but recipes might use legacy for fallback? Prompt said recipes should use tokens only. So we include it in search.)
# - shared/styles/tokens.css (Legacy)

# We want to find these patterns in src/ (frontend source)
# Exclude theme definition files
EXCLUDES="--exclude-dir=theme --exclude-dir=tests --exclude-dir=node_modules --exclude-dir=dist --exclude=global.css --exclude=tokens.css --exclude-dir=ColorPicker --exclude=*.svg --exclude-dir=dev --exclude-dir=import --exclude-dir=coverage --exclude-dir=public --exclude-dir=utils --exclude-dir=test-utils"

echo "Running Style Governance Check..."
echo "Searching for forbidden colors (Hex, RGB, Slate Palette) outside of theme infrastructure..."

# Search in frontend directory
# Using grep recursively
# -r: recursive
# -n: line number
# -E: extended regex
# -I: ignore binary

# We use a broader grep and then filter, or just exclusions.
# Ideally we fail if any match found except in allowlist.

MATCHES=$(grep -rEIn "$PATTERN" frontend $EXCLUDES | grep -v "frontend/design/tokens.ts")

if [ -n "$MATCHES" ]; then
  echo "❌ Validation Failed! Found forbidden color patterns:"
  echo "$MATCHES"
  echo ""
  echo "Please use semantic tokens (e.g., bg-surface1, text-text) instead of raw colors."
  exit 1
else
  echo "✅ Style Governance Passed."
  exit 0
fi
