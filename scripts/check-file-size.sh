#!/bin/bash
# SRP Code Size Enforcement Script
# See docs/agents/srp-refactor-plan.md for guidelines
#
# Thresholds:
#   C++ engine files: 800 LOC max
#   TS/TSX files: 600 LOC max

set -e

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

ERRORS=0
WARNINGS=0

# Review thresholds (warnings only)
CPP_REVIEW_THRESHOLD=450
TS_REVIEW_THRESHOLD=350

# Mandatory refactor thresholds (errors)
CPP_ERROR_THRESHOLD=800
TS_ERROR_THRESHOLD=600

echo "=== SRP Code Size Check ==="
echo "Project root: $PROJECT_ROOT"
echo ""

# Known violations - tracked for future refactoring phases
# These files are exempt until their refactoring phase is complete
KNOWN_VIOLATIONS=(
  # C++ - Phase 1 remaining items
  "cpp/engine.cpp"                           # Phase 1.3-1.4: Further engine splits
  "cpp/engine/text/text_layout.cpp"          # Phase 4: Text system refactor
  "cpp/engine/snapshot.cpp"                  # Phase 1.4: Snapshot extraction
  "cpp/engine/vector_tessellation.cpp"       # Phase 4: Render system
  # TypeScript - Phase 4+ items
  "frontend/engine/tools/TextTool.ts"        # Phase 4: Text tool refactor
  "frontend/engine/tools/text/TextInputCoordinator.ts"  # Just created, needs split
  "frontend/engine/bridge/textBridge.ts"     # Phase 4: Text bridge refactor
  "frontend/features/import/utils/pdfToShapes.ts"       # Phase 5: Import refactor
  "frontend/features/import/utils/dxf/dxfToShapes.ts"   # Phase 5: Import refactor
  "frontend/features/import/utils/pdfToVectorDocument.ts"  # Phase 5: Import refactor
)

is_known_violation() {
  local file="$1"
  for known in "${KNOWN_VIOLATIONS[@]}"; do
    if [[ "$file" == *"$known"* ]]; then
      return 0
    fi
  done
  return 1
}

# C++ engine files
echo "Checking C++ files..."
while IFS= read -r -d '' f; do
  [ -z "$f" ] && continue
  loc=$(wc -l < "$f")
  if [ "$loc" -gt "$CPP_ERROR_THRESHOLD" ]; then
    if is_known_violation "$f"; then
      echo "  📋 KNOWN: $f exceeds ${CPP_ERROR_THRESHOLD} LOC ($loc) - tracked for future refactor"
    else
      echo "  ❌ ERROR: $f exceeds ${CPP_ERROR_THRESHOLD} LOC ($loc)"
      ERRORS=$((ERRORS + 1))
    fi
  elif [ "$loc" -gt "$CPP_REVIEW_THRESHOLD" ]; then
    echo "  ⚠️  WARN: $f exceeds ${CPP_REVIEW_THRESHOLD} LOC ($loc) - consider refactoring"
    WARNINGS=$((WARNINGS + 1))
  fi
done < <(find cpp/engine -name "*.cpp" -print0 2>/dev/null)

# Also check root cpp/*.cpp files
while IFS= read -r -d '' f; do
  [ -z "$f" ] && continue
  loc=$(wc -l < "$f")
  if [ "$loc" -gt "$CPP_ERROR_THRESHOLD" ]; then
    if is_known_violation "$f"; then
      echo "  📋 KNOWN: $f exceeds ${CPP_ERROR_THRESHOLD} LOC ($loc) - tracked for future refactor"
    else
      echo "  ❌ ERROR: $f exceeds ${CPP_ERROR_THRESHOLD} LOC ($loc)"
      ERRORS=$((ERRORS + 1))
    fi
  elif [ "$loc" -gt "$CPP_REVIEW_THRESHOLD" ]; then
    echo "  ⚠️  WARN: $f exceeds ${CPP_REVIEW_THRESHOLD} LOC ($loc) - consider refactoring"
    WARNINGS=$((WARNINGS + 1))
  fi
done < <(find cpp -maxdepth 1 -name "*.cpp" -print0 2>/dev/null)

echo ""

# TS/TSX files (excluding node_modules, dist, coverage)
echo "Checking TypeScript files..."
while IFS= read -r -d '' f; do
  [ -z "$f" ] && continue
  # Skip generated/vendor files
  [[ "$f" == *"node_modules"* ]] && continue
  [[ "$f" == *"dist"* ]] && continue
  [[ "$f" == *"coverage"* ]] && continue
  [[ "$f" == *".d.ts" ]] && continue
  
  loc=$(wc -l < "$f")
  if [ "$loc" -gt "$TS_ERROR_THRESHOLD" ]; then
    if is_known_violation "$f"; then
      echo "  📋 KNOWN: $f exceeds ${TS_ERROR_THRESHOLD} LOC ($loc) - tracked for future refactor"
    else
      echo "  ❌ ERROR: $f exceeds ${TS_ERROR_THRESHOLD} LOC ($loc)"
      ERRORS=$((ERRORS + 1))
    fi
  elif [ "$loc" -gt "$TS_REVIEW_THRESHOLD" ]; then
    echo "  ⚠️  WARN: $f exceeds ${TS_REVIEW_THRESHOLD} LOC ($loc) - consider refactoring"
    WARNINGS=$((WARNINGS + 1))
  fi
done < <(find frontend -type f \( -name "*.ts" -o -name "*.tsx" \) -print0 2>/dev/null)

echo ""
echo "=== Summary ==="
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo "❌ Found $ERRORS file(s) exceeding size limits."
  echo "See docs/agents/srp-refactor-plan.md for refactoring guidance."
  exit 1
fi

if [ $WARNINGS -gt 0 ]; then
  echo ""
  echo "⚠️  Found $WARNINGS file(s) that should be reviewed for potential refactoring."
fi

echo ""
echo "✅ All files within mandatory size limits"
