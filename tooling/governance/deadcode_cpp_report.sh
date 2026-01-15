#!/usr/bin/env bash

# Generate a C++ dead-code aid report using nm/objdump/rg signals.
# Output: reports/deadcode_cpp.md

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPORT_DIR="${ROOT}/reports"
REPORT_FILE="${REPORT_DIR}/deadcode_cpp.md"
BUILD_DIR="${ROOT}/cpp/build_native"
ENGINE_BIN="${BUILD_DIR}/engine_tests"

mkdir -p "${REPORT_DIR}"

write_section() {
  echo -e "$1\n" >> "${REPORT_FILE}"
}

command_result() {
  local title="$1"
  local cmd="$2"
  local output
  output="$(eval "${cmd}" 2>&1)"
  local status=$?
  write_section "### ${title}\nCommand: \`${cmd}\`\nExit code: ${status}\n\n\`\`\`\n${output}\n\`\`\`"
}

echo "# C++ Dead Code Report" > "${REPORT_FILE}"
echo "Generated: $(date -Iseconds)" >> "${REPORT_FILE}"
echo >> "${REPORT_FILE}"

if [[ ! -x "${ENGINE_BIN}" ]]; then
  write_section "Build artifacts not found at \`${ENGINE_BIN}\`. Configure/build (`cmake -S cpp -B cpp/build_native && cmake --build cpp/build_native`) before running this report for symbol analysis."
  echo "C++ dead code report written to ${REPORT_FILE}"
  exit 0
fi

# nm defined/undefined summaries
if command -v nm >/dev/null 2>&1; then
  command_result "nm --defined-only (first 50 symbols)" "nm -C --defined-only \"${ENGINE_BIN}\" | head -n 50"
  command_result "nm --undefined (first 50 symbols)" "nm -C --undefined-only \"${ENGINE_BIN}\" | head -n 50"
else
  write_section "nm not available on PATH; skipping symbol dump."
fi

# objdump symbol table snapshot
if command -v objdump >/dev/null 2>&1; then
  command_result "objdump -t (text section, first 50)" "objdump -t \"${ENGINE_BIN}\" | grep '\\.text' | head -n 50"
else
  write_section "objdump not available on PATH; skipping."
fi

# Grep hints for unused/dead markers
command_result "rg hints (\"unused\" tokens in cpp/engine)" "cd \"${ROOT}\" && rg --no-heading --line-number \"unused\" cpp/engine"

echo "C++ dead code report written to ${REPORT_FILE}"
