# Migration Notes — Phase 6: Flip Source of Truth (TS → WASM) + Versioned Snapshot

**Date:** 2025-12-19  
**Scope:** Next (R3F/WASM) document ownership for the supported geometry subset (`rect/line/polyline`).  
**Non-goals:** Full tool parity, text/SVG/symbol rendering, electrical rules, and full legacy editor replacement.

---

## 1) Problem

The project needs to transition from a TS/Zustand document (legacy Canvas2D) to a WASM-owned document for performance and determinism. The risks are:

- **Broken memory views** when WASM heap grows (detached/out-of-bounds).
- **Non-deterministic undo/redo** if commands aren’t strictly ordered and replayable.
- **Interop overhead** if the bridge becomes chatty or allocates per frame.
- **Compatibility** with existing saved projects.

---

## 2) Plan / Approach (Phase 6 MVP)

1) **Define a versioned snapshot format** (`v1`) with a minimal, WASM-friendly payload:
   - No large strings (SVG raw, text payloads).
   - Fixed binary layout (little-endian).
2) **Import legacy projects into WASM**:
   - TS performs a one-time conversion of `SerializedProject` → `WorldSnapshotV1`.
   - WASM loads the snapshot from a byte buffer (`ptr + byteCount`) and rebuilds render buffers.
3) **Export from WASM**:
   - WASM exposes snapshot bytes via `{ ptr, byteCount }` metadata.
4) **TS stores become view-model** (incremental):
   - UI-only state remains in TS (`viewport`, `selection`, tool state, preferences).
   - The Next viewer no longer re-renders from `useDataStore.shapes` (legacy source); it renders from WASM buffers and uses WASM snapshot bytes as truth.
5) **Performance hardening**:
   - Add capacity planning hooks (`reserveWorld`) and a build-time flag to disable heap growth for production.

---

## 3) Snapshot Schema (v1)

Binary header (little-endian):

- `u32 magic = 0x31435745` (`"EWC1"`)
- `u32 version = 1`
- `u32 rectCount`
- `u32 lineCount`
- `u32 polylineCount`
- `u32 pointCount`
- `u32 reserved0`
- `u32 reserved1`

Records:

- Rect record (20 bytes): `u32 id, f32 x, f32 y, f32 w, f32 h`
- Line record (20 bytes): `u32 id, f32 x0, f32 y0, f32 x1, f32 y1`
- Polyline record (12 bytes): `u32 id, u32 offset, u32 count`
- Point record (8 bytes): `f32 x, f32 y`

ID strategy (Phase 6 MVP):

- `id` is a **deterministic** `u32` FNV-1a hash of the legacy `shape.id` string.
- Collision handling is best-effort in TS (keeps the first mapping). Production should move to a collision-free numeric ID strategy (e.g., u64 or allocator-based IDs).

---

## 4) Persistence Flow (Phase 6 MVP)

### Import (legacy → WASM)

1) TS calls `useDataStore.getState().serializeProject()`.
2) TS converts to `WorldSnapshotV1` and encodes to bytes.
3) TS allocates WASM memory via `engine.allocBytes(byteCount)`.
4) TS copies bytes into `HEAPU8` and calls `engine.loadSnapshotFromPtr(ptr, byteCount)`.
5) TS frees the transient buffer via `engine.freeBytes(ptr)`.

### Export (WASM → bytes)

1) TS calls `engine.getSnapshotBufferMeta()` to obtain `{ ptr, byteCount }`.
2) TS creates a view `HEAPU8.subarray(ptr, ptr + byteCount)` and copies it into a standalone `Uint8Array` for saving.

---

## 5) Instrumentation (minimum)

WASM exposes `engine.getStats()` with:

- shape counts (rect/line/polyline/points)
- render vertex counts (triangles/lines)
- `lastLoadMs`, `lastRebuildMs` timings (snapshot load + render buffer rebuild)

Viewer overlay should show these values in dev-only mode.

---

## 6) Performance Methodology (Before/After)

### Scenarios

- **10k static shapes**: pan/zoom + click selection.
- **100k static shapes**: pan/zoom only (interaction baseline), then click selection.

### Metrics to capture

- Frame time budget (`ms/frame`) during pan/zoom.
- GPU upload cost (geometry update frequency; must be generation-based, not per frame).
- Bridge cost:
  - snapshot load time (ms)
  - rebuild time (ms)
  - heap growth events (should be **zero** in production)

### Reproducibility rules

- Same fixture file.
- Same camera path (recorded gesture or scripted viewport changes).
- Same build type (`Release` + `ENGINE_ALLOW_MEMORY_GROWTH=0` for production-like tests).

---

## 7) Files Changed (Phase 6 MVP)

- `cpp/engine.cpp` (snapshot load/export APIs + stats)
- `cpp/CMakeLists.txt` (configurable `ALLOW_MEMORY_GROWTH`)
- `frontend/src/next/worldSnapshot.ts` (schema + encode/decode + legacy conversion)
- `frontend/src/components/CadViewer.tsx` (imports legacy once, renders from WASM buffers)
- `frontend/tests/worldSnapshot.test.ts` (deterministic encode/decode tests)
- `frontend/verification/world-snapshot-v1-min.json` (reference fixture)
- `frontend/verification/README.md` (fixture documentation)

---

## 8) Risks / Known Gaps

- **ID collisions**: `u32` hash is not collision-free; must be upgraded before “Next default” for production.
- **Undo/redo source-of-truth**: not yet migrated to a WASM command log. Current path must evolve to:
  - TS sends batched commands to WASM (deterministic ordering),
  - WASM maintains the authoritative command log and can export it or checkpoints.
- **Snapping**: object snapping still needs to be moved to WASM spatial indices for 100k+.
- **Memory growth**: production should disable heap growth and rely on `reserveWorld` + capacity planning.

---

## 9) Verification

Automated:

- `frontend/tests/worldSnapshot.test.ts` (encode/decode determinism)

Manual:

- Open Next viewer, verify:
  - geometry renders,
  - pan/zoom stable,
  - no detached/out-of-bounds errors on common reload paths.

Environment note:

- Running tests under OneDrive can fail with `spawn EPERM` (esbuild). Prefer moving the repo out of OneDrive-controlled folders or allowlisting toolchain executables.

