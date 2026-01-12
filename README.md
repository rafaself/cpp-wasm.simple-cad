# EndeavourCanvas

EndeavourCanvas is a web CAD for residential electrical design.

This repository is transitioning from a Canvas 2D MVP to a high-performance architecture with **C++/WASM** (and a future move to WebGL/R3F).

## Overview

- Frontend: React + TypeScript (Vite)
- Backend: FastAPI (Python)
- Engine (in progress): C++ -> WebAssembly (Emscripten)

## Key folders

```text
.
|-- frontend/                 # React/Vite app
|   |-- public/wasm/          # Generated WASM artifacts (engine.js/engine.wasm)
|   |-- features/             # Features (editor, import, settings...)
|   |-- stores/               # Zustand stores
|   |-- utils/                # Geometry + helpers
|   `-- tests/                # Vitest
|-- backend/                  # FastAPI
|-- cpp/                      # C++ engine (CMake + Emscripten)
|-- docs/                     # Docs and testing guides
|-- resources/                # Reports and misc
`-- docker-compose.yml        # WASM builder job via emscripten/emsdk
```

## Quickstart (dev)

### 1) Frontend

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm dev
```

App: http://localhost:3000

### 2) Backend

```bash
cd backend
python -m venv venv
# Windows:
.\\venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API: http://localhost:8000

Package manager: pnpm with `pnpm-lock.yaml` (use `pnpm install --frozen-lockfile`; pnpm is the only supported manager).

## WASM build (Phase 1 boilerplate)

The WASM builder is a **build container** (not a server). It exits when the compilation finishes.

Prerequisite: Docker (Docker Desktop on Windows).

```bash
cd frontend
pnpm build:wasm
```

Expected output:

- frontend/public/wasm/engine.js
- frontend/public/wasm/engine.wasm

## Tests

### Frontend (including WASM integration)

```bash
cd frontend
pnpm test
# OR for specific tests:
npx vitest run tests/engineRuntime.test.ts
```

### Backend

```bash
cd backend
pytest
```

### C++ Engine (Native)

Native tests are recommended for fast development (TDD) of core logic without Docker overhead.

```bash
mkdir -p cpp/build_native && cd cpp/build_native
cmake ..
make
ctest
```

Optional CMake flags:
- `-DENGINE_ENABLE_WARNINGS=ON` (default) to enable compiler warnings
- `-DENGINE_ENABLE_LOGGING=ON` to enable engine debug logs

## Important docs

- AI agent rules: AGENTS.md
- Project structure: docs/PROJECT_STRUCTURE.md
- WASM tech spec: resources/reports/report_5_cad-wasm-tech-spec.md

## Docker (WASM build helper)

This repo does not ship a dockerized frontend/backend today. The compose file only contains the `wasm-builder` job used for C++ → WASM output.

Prerequisite: Docker (Docker Desktop on Windows).

```bash
cd frontend
pnpm install --frozen-lockfile
pnpm build:wasm
```

The command triggers the `wasm-builder` service and exits when the build finishes.

## Troubleshooting (Windows / OneDrive)

If you see a blank page and Vite fails with `Error: spawn EPERM` (often while loading `frontend/vite.config.ts`), your repo is likely inside OneDrive/Controlled Folder Access.

Recommended fixes:
- Move the repository out of OneDrive (e.g. `C:\\dev\\EndeavourCanvas\\`)
- Or build the WASM artifacts via Docker: `cd frontend && pnpm build:wasm`

More details: `docs/DEV_ENVIRONMENT.md`

## Notes

frontend/vite.config.ts already sets COOP/COEP headers to prepare for SharedArrayBuffer in the future.
