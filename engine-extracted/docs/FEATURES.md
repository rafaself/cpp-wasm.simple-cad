# Features (Milestone 2)

## Default profile

- `ENGINE_PROFILE_MINIMAL_2D=ON`
- Backend: WebGL2-oriented path only (`ENGINE_FEATURE_WEBGPU=OFF`)

## IN (enabled by default)

- Shapes: `Rect`, `Line`, `Arrow`, `Text`
- Picking: `pick`, `pickEx`, `pickCandidates`, handle picking
- Transforms: move + resize (including side resize)
- Ordering: deterministic draw/pick ordering using `elevationZ` plus stable tie-breakers
- Text pipeline: text entities, shaping/layout, atlas/quads
- Persistence: snapshot save/load
- History: undo/redo

## OUT (disabled by default)

- WebGPU backend/build path
- `Polyline`, `Circle`, `Polygon` command ops
- Draft workflow command ops
- Rotate transform mode
- Vertex/edge drag transform modes
- In-canvas text editing command ops:
  - `SetTextCaret`
  - `SetTextSelection`
  - `InsertTextContent`
  - `DeleteTextContent`
  - `ReplaceTextContent`
  - `ApplyTextStyle`

## Build flags

- `ENGINE_PROFILE_MINIMAL_2D` (default `ON`)
- `ENGINE_FEATURE_WEBGPU`
- `ENGINE_FEATURE_POLYLINE`
- `ENGINE_FEATURE_CIRCLE`
- `ENGINE_FEATURE_POLYGON`
- `ENGINE_FEATURE_DRAFT`
- `ENGINE_FEATURE_ROTATE`
- `ENGINE_FEATURE_VERTEX_EDIT`
- `ENGINE_FEATURE_TEXT_EDITING`

When `ENGINE_PROFILE_MINIMAL_2D=ON`, the feature flags above are forced OFF for excluded features.
