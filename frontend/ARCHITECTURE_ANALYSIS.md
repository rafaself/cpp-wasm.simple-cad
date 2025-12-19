# Frontend Architecture Overview (Current)

This repo has moved away from the Canvas2D renderer. The current runtime path is:

- `frontend/App.tsx` → `frontend/src/components/NextSurface.tsx`
  - `frontend/src/components/CadViewer.tsx` (R3F/WebGL renderer fed by WASM buffers)
  - `frontend/src/components/EngineInteractionLayer.tsx` (HTML overlay handling user input)

## 1) Source of Truth (Current State)

This is currently a **hybrid**:

- **Authoritative document store (temporary):** `frontend/stores/useDataStore.ts` (Zustand)
  - Holds shapes, layers, connection graph, history (undo/redo), etc.
- **Authoritative renderer buffers:** **C++/WASM engine**
  - Receives shape updates via a **binary command buffer** (`applyCommandBuffer`) and rebuilds GPU buffers.
  - Exposes a compact **snapshot** buffer for picking/selection and UI queries.

The migration goal is to make **WASM the authoritative document model** (not just renderer buffers), and keep TS stores as view-model/UI state.

## 2) Rendering Flow

- `CadViewer` binds typed array views (`HEAPF32`) to `THREE.BufferGeometry` attributes and renders:
  - triangles (fills)
  - line segments (strokes)
- Selection highlight is rendered as `THREE.Line` primitives built from the decoded snapshot.

## 3) Interaction Flow

- `EngineInteractionLayer` is an `absolute` overlay that captures pointer/wheel events.
- Tools are implemented in TS for now and commit changes to `useDataStore`:
  - `line`, `rect`, `polyline`
  - `select`, `pan`, `zoom`
  - `move` (basic translate)
  - `electrical-symbol` (places symbol; rendered via WebGL instancing)
  - `eletroduto` (creates conduit segment between nodes)
- `frontend/engine/runtime/useEngineStoreSync.ts` subscribes to `useDataStore` and mirrors supported shapes into the WASM engine via commands.

## 4) Key Performance Notes (Current)

- Rendering is no longer Canvas2D-bound; GPU does the heavy lifting.
- Remaining hotspots are mostly TS-side:
  - decoding snapshot whenever engine `generation` changes (OK; should avoid per-frame decode)
  - TS→WASM mirroring (`useEngineStoreSync`) still runs on every shape update

## 5) Next Steps (Roadmap)

1) Move tool state machines into WASM (JS sends raw inputs/commands; tools deterministic and reversible).
2) Replace TS shapes as source-of-truth with an engine document model + queries.
3) Introduce instanced pipelines:
   - text: MSDF atlas + instancing (bold/italic/align/size)
   - symbols: atlas/instancing
