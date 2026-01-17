# Repository Map

## Top-Level Structure

| Directory | Purpose | Stack/Tools |
| :--- | :--- | :--- |
| `apps/web` | Frontend Application | React, Vite, TypeScript, Tailwind, Zustand |
| `apps/api` | Backend API | Python, FastAPI, Uvicorn |
| `packages/engine` | Core CAD Engine | C++20, CMake, Emscripten (WASM), GoogleTest |
| `tooling` | Governance & Scripts | Node.js scripts, custom linters |
| `docs` | Documentation | Markdown |
| `infra` | Infrastructure | Docker, Docker Compose |
| `.github` | CI/CD | GitHub Actions |

## Domain Details

- **Entrypoint**: `index.html`, `index.tsx` (boots App)
- **State**: `stores/` (Zustand)
- **Engine Bridge**: `engine/` (TypeScript wrappers for WASM)
- **UI Components**: `components/`
- **Design System**: `design/` (Tailwind, CSS vars)

### Backend (`apps/api`)
- **Entrypoint**: `app/main.py`
- **Dependencies**: `requirements.txt`
- **Status**: Seemingly minimal integration in current CI/Docs.

### Engine (`packages/engine`)
- **Core**: `engine.cpp` + `engine/` directory
- **Build**: `CMakeLists.txt`
- **Outputs**: `engine.wasm`, `engine.js` (copied to frontend public assets)
- **Tests**: `tests/` (GTest)

### Tooling (`tooling`)
- **Governance**: `governance/` (scripts for checking file sizes, boundaries, manifests)
- **Reports**: `reports/` (generated artifacts)

## Key Configuration Files
- `Makefile`: Root entrypoint for build orchestration.
- `AGENTS.md`: Existing architectural rules (Source of Truth).
- `.github/workflows/ci.yml`: CI definitions (currently checks Frontend + Engine + Governance).
