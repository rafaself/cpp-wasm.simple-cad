---
trigger: always_on
---

# AI Agent Rules (Source of Truth)

This repository keeps a single source of truth for AI agent behavior in:

- `AGENTS.md`

This file exists to integrate with agent runners that support `.agent/rules/*`.

## Project Context (Current Direction)

- Frontend: React + TypeScript (Vite). (Future: R3F/Three.js)
- Core Engine: C++ → WebAssembly (Emscripten)
- Performance: Data-Oriented Design, deterministic tools, zero-allocation hot paths

## Key Reminders (Supplementary)

- Treat `frontend/public/wasm/*` as generated build outputs.
- Prefer batch JS↔WASM interop and stable memory strategies (reserve/arenas).
