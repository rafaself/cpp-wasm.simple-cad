#!/bin/bash
echo "=== C++ Engine Files ==="
find cpp/engine cpp -maxdepth 1 -name "*.cpp" -o -name "*.h" | xargs wc -l | sort -rn | head -20
echo ""
echo "=== Frontend Engine Files ==="
find frontend/engine -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20
echo ""
echo "=== Editor Components ==="
find frontend/features/editor -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20
echo ""
echo "=== Files Exceeding Thresholds ==="
echo "C++ > 800 LOC:"
find cpp/engine cpp -maxdepth 1 -name "*.cpp" | while read f; do
  loc=$(wc -l < "$f")
  if [ $loc -gt 800 ]; then
    echo "  ❌ $f: $loc"
  fi
done
echo "TS/TSX > 600 LOC:"
find frontend -path "*/node_modules" -prune -o \( -name "*.ts" -o -name "*.tsx" \) -print | while read f; do
  loc=$(wc -l < "$f")
  if [ $loc -gt 600 ]; then
    echo "  ❌ $f: $loc"
  fi
done
