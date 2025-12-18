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

Frontend:

```bash
cd frontend
npm run test
```

Backend:

```bash
cd backend
pytest
```

## Important docs

- AI agent rules: AGENTS.md
- Project structure: docs/PROJECT_STRUCTURE.md
- WASM tech spec: resources/reports/report_5_cad-wasm-tech-spec.md

## Notes

frontend/vite.config.ts already sets COOP/COEP headers to prepare for SharedArrayBuffer in the future.
