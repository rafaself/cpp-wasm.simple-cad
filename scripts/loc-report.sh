#!/bin/bash
# LOC (Lines of Code) Report Script
# Part of SRP Governance - see docs/agents/srp-refactor-plan.md

set -e

echo "================================================================================"
echo "                         CODE SIZE REPORT"
echo "                         $(date '+%Y-%m-%d %H:%M:%S')"
echo "================================================================================"
echo ""

echo "=== C++ Engine Files (Top 20) ==="
find cpp/engine -name "*.cpp" -o -name "*.h" 2>/dev/null | xargs wc -l 2>/dev/null | sort -rn | head -20
echo ""

echo "=== C++ Root Files ==="
wc -l cpp/engine.cpp 2>/dev/null || echo "  (not found)"
echo ""

echo "=== Frontend Engine Files (Top 20) ==="
find frontend/engine -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null | xargs wc -l 2>/dev/null | sort -rn | head -20
echo ""

echo "=== Editor Components (Top 15) ==="
find frontend/features/editor -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null | xargs wc -l 2>/dev/null | sort -rn | head -15
echo ""

echo "=== Import Utils ==="
find frontend/features/import -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null | xargs wc -l 2>/dev/null | sort -rn | head -10
echo ""

echo "================================================================================"
echo "                    FILES EXCEEDING THRESHOLDS"
echo "================================================================================"
echo ""

VIOLATIONS=0

echo "C++ Files > 800 LOC (MANDATORY REFACTOR):"
for f in $(find cpp -path "*/build*" -prune -o -name "*.cpp" -print 2>/dev/null); do
  if [ -f "$f" ]; then
    loc=$(wc -l < "$f" 2>/dev/null || echo 0)
    if [ "$loc" -gt 800 ]; then
      echo "  ❌ $f: $loc LOC"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
done
echo ""

echo "C++ Files > 450 LOC (REVIEW RECOMMENDED):"
for f in $(find cpp/engine -path "*/build*" -prune -o \( -name "*.cpp" -o -name "*.h" \) -print 2>/dev/null); do
  if [ -f "$f" ]; then
    loc=$(wc -l < "$f" 2>/dev/null || echo 0)
    if [ "$loc" -gt 450 ] && [ "$loc" -le 800 ]; then
      echo "  ⚠️  $f: $loc LOC"
    fi
  fi
done
echo ""

echo "TS/TSX Files > 600 LOC (MANDATORY REFACTOR):"
for f in $(find frontend -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null); do
  if [ -f "$f" ]; then
    loc=$(wc -l < "$f" 2>/dev/null || echo 0)
    if [ "$loc" -gt 600 ]; then
      echo "  ❌ $f: $loc LOC"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
done
echo ""

echo "TS/TSX Files > 350 LOC (REVIEW RECOMMENDED):"
for f in $(find frontend -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print 2>/dev/null); do
  if [ -f "$f" ]; then
    loc=$(wc -l < "$f" 2>/dev/null || echo 0)
    if [ "$loc" -gt 350 ] && [ "$loc" -le 600 ]; then
      echo "  ⚠️  $f: $loc LOC"
    fi
  fi
done
echo ""

echo "================================================================================"
echo "                           SUMMARY"
echo "================================================================================"
echo ""
echo "Total mandatory refactor violations: $VIOLATIONS"
echo ""
echo "Thresholds:"
echo "  C++:    Review > 450 LOC | Mandatory > 800 LOC"
echo "  TS/TSX: Review > 350 LOC | Mandatory > 600 LOC"
echo ""
echo "See docs/agents/srp-refactor-plan.md for refactoring guidance."
