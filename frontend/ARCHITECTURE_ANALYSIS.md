# Frontend Architecture Overview (Current)

This repo uses a high-performance rendering pipeline powered by WebGL2 and WASM.

- `frontend/App.tsx` → `frontend/src/components/NextSurface.tsx`
  - `frontend/src/components/TessellatedWasmLayer.tsx` (WebGL2 custom renderer fed by WASM buffers)
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

- `TessellatedWasmLayer` manages a `requestAnimationFrame` loop that interfaces directly with the WASM engine.
- It binds typed array views (from WASM memory) to WebGL2 buffers and renders:
  - Tessellated geometry (triangles)
  - Text (MSDF)
  - Symbols
- There is no dependency on Three.js or React-Three-Fiber.

## 3) Interaction Flow

- `EngineInteractionLayer` is an `absolute` overlay that captures pointer/wheel events.
- Picking uses `GpuPicker` (WebGL2-based framebuffer reading) for pixel-perfect accuracy, falling back to spatial index queries when needed.
- Tools are implemented in TS for now and commit changes to `useDataStore`.
- `frontend/engine/runtime/useEngineStoreSync.ts` subscribes to `useDataStore` and mirrors supported shapes into the WASM engine via commands.

## 4) Key Performance Notes (Current)

- Rendering is GPU-accelerated via raw WebGL2.
- Remaining hotspots are mostly TS-side:
  - decoding snapshot whenever engine `generation` changes.
  - TS→WASM mirroring (`useEngineStoreSync`) still runs on every shape update.

## 5) Next Steps (Roadmap)

1) Move tool state machines into WASM (JS sends raw inputs/commands).
2) Replace TS shapes as source-of-truth with an engine document model.
