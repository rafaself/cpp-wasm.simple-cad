# Project Structure (High-level)

This document explains the repository layout and where new code should go.

## Root

```text
.
|-- AGENTS.md                 # AI agent rules (source of truth)
|-- README.md                 # Main project README
|-- docker-compose.yml        # WASM builder job (emscripten/emsdk)
|-- cpp/                      # C++ engine compiled to WebAssembly
|-- frontend/                 # React/Vite app
|-- backend/                  # FastAPI app
|-- docs/                     # Docs and testing guides
`-- resources/                # Reports, prompts, and reference docs
```

## cpp/ (C++ -> WebAssembly)

```text
cpp/
|-- CMakeLists.txt            # Emscripten build (outputs to frontend/public/wasm)
`-- engine.cpp                # Phase 1 POC (CadEngine.add)
```

Notes:
- `frontend/public/wasm/*` is generated output. Do not hand-edit those files.
- Phase 1 uses Embind for a simple JS bridge (later phases may prefer a C ABI for performance).

## docker-compose.yml (WASM builder)

`docker-compose.yml` defines a single build container (`wasm-builder`).

- It is not a long-running service.
- Running `docker compose up` will start the container and it will exit when the build finishes.
- Frontend/backend containers are not included; run them locally (see README).

Recommended usage:
- `cd frontend` then `pnpm build:wasm`

## Dev environment (Windows note)

On Windows, running the repo inside OneDrive-managed folders can cause `spawn EPERM` for Vite/esbuild.

See: `docs/DEV_ENVIRONMENT.md`

## frontend/ (React/Vite)

```text
frontend/
|-- App.tsx                   # Main app entry component
|-- vite.config.ts            # Dev server config (COOP/COEP headers + wasm MIME)
|-- package.json              # Scripts (dev/test/build/build:wasm)
|-- public/
|   `-- wasm/                 # Generated WASM artifacts (engine.js/engine.wasm)
|-- src/components/
|   `-- WasmTest.tsx          # POC component that loads CadEngine and calls add(10,20)
|-- features/                 # Feature-based modules (editor, import, settings, ...)
|-- stores/                   # Zustand stores (data, ui, settings, library)
|-- utils/                    # Geometry and other helpers
|-- tests/                    # Vitest tests
`-- verification/             # Fixtures and docs for tests
```

Package manager: pnpm with `pnpm-lock.yaml` (use `pnpm install --frozen-lockfile`).

Key scripts:
- `pnpm dev` starts Vite (default: http://localhost:3000)
- `pnpm test` runs Vitest
- `pnpm build:wasm` builds `cpp/` via Docker into `frontend/public/wasm/`

## backend/ (FastAPI)

```text
backend/
|-- app/                      # FastAPI application code
`-- tests/                    # Pytest tests
```

## resources/

```text
resources/
|-- reports/                  # Generated technical reports (report_N_*.md)
`-- prompts/                  # Saved prompts used during audits/iterations
```

## AI-related files

```text
.agent/
|-- rules/                    # Agent runner integration (points to AGENTS.md)
`-- workflows/                # Playbooks for typical tasks
```

`AGENTS.md` is the single source of truth for agent behavior and project conventions.
