# Frontend Architecture Overview (Engine-First)

This repo uses a high-performance rendering pipeline powered by WebGL2 and WASM.

- `frontend/App.tsx` → `frontend/src/components/NextSurface.tsx`
  - `frontend/src/components/TessellatedWasmLayer.tsx` (WebGL2 renderer fed by WASM buffers)
  - `frontend/src/components/EngineInteractionLayer.tsx` (HTML overlay handling user input)

## 1) Source of Truth (Current State)

The **C++/WASM engine is the only source of truth** for the document:

- Entities, layers, flags, selection, draw order, history, and snapshots live in WASM.
- The frontend never stores authoritative shapes or layers.
- UI state (tool selection, viewport, panels, preferences) lives in `useUIStore` and `useSettingsStore`.

## 2) Rendering Flow

- `TessellatedWasmLayer` pulls render buffers directly from the engine on each frame.
- No JS-side reconstruction of geometry or draw order is allowed.

## 3) Interaction Flow

- `EngineInteractionLayer` captures input and sends **commands** to the engine.
- Selection, picking, and overlays are resolved inside the engine and queried by the UI.
- The UI reacts to the engine **event stream** and updates only UI state or caches.

## 4) Performance Notes

- Interactive transforms avoid global rebuilds; only dirty entities are retessellated on commit.
- Overlay geometry (bounds/handles/caret) is queried from the engine to avoid JS geometry math.
