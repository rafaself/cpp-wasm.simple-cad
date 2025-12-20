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
npm install
npm run dev
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

## WASM build (Phase 1 boilerplate)

The WASM builder is a **build container** (not a server). It exits when the compilation finishes.

Prerequisite: Docker (Docker Desktop on Windows).

```bash
cd frontend
npm run build:wasm
```

Expected output:

- frontend/public/wasm/engine.js
- frontend/public/wasm/engine.wasm

## Tests

### Frontend (including WASM integration)

```bash
cd frontend
npm run test
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

## Important docs

- AI agent rules: AGENTS.md
- Project structure: docs/PROJECT_STRUCTURE.md
- WASM tech spec: resources/reports/report_5_cad-wasm-tech-spec.md

## Docker (dev environment)

### Full stack (frontend + backend)

Prerequisite: Docker (Docker Desktop on Windows).

```bash
docker compose up
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8000

> The frontend/backend containers install deps on first start (volume-mounted).
> The wasm-builder job is separate and only runs when invoked (see below).

### WASM build inside Docker

```bash
cd frontend
npm run build:wasm
```

(Uses the `wasm-builder` service; it exits when the build finishes.)

## Troubleshooting (Windows / OneDrive)

If you see a blank page and Vite fails with `Error: spawn EPERM` (often while loading `frontend/vite.config.ts`), your repo is likely inside OneDrive/Controlled Folder Access.

Recommended fixes:
- Move the repository out of OneDrive (e.g. `C:\\dev\\EndeavourCanvas\\`)
- Or use the Docker dev environment: `docker compose up`

More details: `docs/DEV_ENVIRONMENT.md`

## Notes

frontend/vite.config.ts already sets COOP/COEP headers to prepare for SharedArrayBuffer in the future.

