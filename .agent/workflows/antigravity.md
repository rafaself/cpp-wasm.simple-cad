---
description: High-performance workflow (Frontend + Backend + WASM).
---

# Workflow "Antigravity"

This workflow keeps development fast and consistent. Source of truth: `AGENTS.md`.

## 1) Health check

1. Install dependencies:
   - Frontend: `cd frontend` + `npm install`
   - Backend: `cd backend` + `pip install -r requirements.txt`

2. Run quick tests:
   - Frontend: `cd frontend` + `npm run test`
   - Backend: `cd backend` + `pytest`

3. (Optional) Build WASM (C++ -> WebAssembly):
   - `cd frontend` + `npm run build:wasm`

## 2) "Zero-G" cycle (recommended order)

1. State first: stores (`frontend/stores/`).
2. Logic second: domain/engine rules (`frontend/utils/`, `backend/app/`, `cpp/`).
3. UI last: components (`frontend/components/`, `frontend/features/`).

## 3) CAD/Engine checklist

- [ ] Deterministic and reversible operations (undo/redo when applicable)
- [ ] Persisted models are serializable (no UI-only fields)
- [ ] Hot paths avoid allocations (mousemove/drag/frame)
- [ ] For WASM: batch interop and stable memory (reserve/arenas)

## 4) Reports (when requested)

Save under `resources/reports/` as described in `AGENTS.md`.

## 5) Useful commands

| Action | Command |
| --- | --- |
| Frontend dev | `cd frontend` + `npm run dev` |
| Backend dev | `cd backend` + `uvicorn app.main:app --reload` |
| Frontend tests | `cd frontend` + `npm run test` |
| Backend tests | `cd backend` + `pytest` |
| Frontend build | `cd frontend` + `npm run build` |
| WASM build | `cd frontend` + `npm run build:wasm` |
