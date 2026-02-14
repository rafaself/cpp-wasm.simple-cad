#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if ! command -v emcmake >/dev/null 2>&1; then
  echo "error: emcmake not found. Install/activate emsdk before running this script." >&2
  exit 1
fi

BUILD_DIR="${BUILD_DIR:-${ROOT_DIR}/build-wasm}"
BUILD_TYPE="${BUILD_TYPE:-Release}"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT_DIR}/dist/wasm}"
JOBS="${JOBS:-$(nproc)}"

emcmake cmake -S "${ROOT_DIR}" -B "${BUILD_DIR}" -DCMAKE_BUILD_TYPE="${BUILD_TYPE}" -DOUTPUT_DIR="${OUTPUT_DIR}" "$@"
cmake --build "${BUILD_DIR}" -j"${JOBS}"
