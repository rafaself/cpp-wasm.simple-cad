# Selection Handles Root Cause V2

## Observations
- Selection overlay now prefers oriented meta for single selection in `frontend/features/editor/components/ShapeOverlay.tsx`.
- Debug logging for overlay render path + meta is in `frontend/features/editor/components/ShapeOverlay.tsx`.
- Engine protocol info is logged once in `frontend/engine/core/EngineRuntime.ts` when overlay debug is enabled.
- Oriented handle meta is generated in `cpp/engine/impl/engine_overlay.cpp` (`getOrientedHandleMeta` + `pushRotatedCorners`).

## Runtime Evidence (Pending)
Enable debug:

```js
window.__cadDebug = { enabled: true, overlay: true };
```

Reproduce for Circle and Polygon at 67°, 90°, 135° and capture logs containing:
`selection overlay renderPath=... kind=...`

Required fields (already logged):
- `renderPath` (oriented-verbatim / vertex-only / selectionBounds-multiselect / legacy-aabb)
- `kind`
- `orientedMeta.valid`, `hasResizeHandles`, `hasRotateHandle`
- `cornersWorld`, `cornersScreen`
- `rotateHandleWorld`, `rotateHandleScreen`
- `selectionHandleMeta.floatCount` + `firstFloats`
- `applyRotation` (should be `false`)

### Log Capture Slots
Fill in once logs are captured:

- Circle 67°:
  - log:
- Circle 90°:
  - log:
- Circle 135°:
  - log:
- Polygon 67°:
  - log:
- Polygon 90°:
  - log:
- Polygon 135°:
  - log:

## Confirmed Root Cause
Pending runtime logs. Current hypotheses:
- Oriented meta invalid for Circle/Polygon (fallback path used).
- Oriented meta valid but renderPath still falls into non-oriented branch.
- Oriented meta valid and rendered, but coordinates drift off-screen or filtered.

## Fix Summary (Current)
- Added overlay debug logging + oriented meta debug dots (world → screen) in `frontend/features/editor/components/ShapeOverlay.tsx`.
- Added engine protocol info log in `frontend/engine/core/EngineRuntime.ts` for build identity.

## Build Identity
Enable overlay debug and verify:
- `engine protocol info` log line (includes `protocolVersion`, `abiHash`, `featureFlags`).

## Next Steps
1) Collect logs for Circle/Polygon at 67°/90°/135°.
2) Determine renderPath + oriented meta validity.
3) If oriented meta invalid: fix engine invalidation or entity kind gating.
4) If oriented meta valid but renderPath not oriented: fix frontend branch selection.
5) If oriented meta valid but coordinates drift: fix engine meta generation or view transform mismatch.
