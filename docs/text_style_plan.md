# Text Style Plan (Engine-First, C++/WASM Authority)

## Scope and Goals
- Apply bold/italic/underline/strike in an engine-first architecture.
- Keep selection, layout, shaping, and rendering in the C++/WASM engine; React only orchestrates commands and UI.
- Ensure logical (grapheme) indices are the external contract; UTF-8 offsets remain internal storage.
- Design for extensibility (variable fonts, numeric weight, letter spacing, advanced decorations). No backward compatibility is required for prior payloads; plan assumes coordinated rollout of new opcode/structures.

## Command: TEXT_APPLY_STYLE (Binary Spec – for review/freeze)
- Endianness: little-endian, packed (1-byte alignment).
- Suggested opcode: 0x2A (confirm in enum).
- Fields (ordered):
  - textId u32
  - rangeStartLogical u32 (grapheme index, inclusive)
  - rangeEndLogical u32 (grapheme index, end-exclusive; if equal to start = caret)
  - flagsMask u8 (bits: 1=bold, 2=italic, 4=underline, 8=strike)
  - flagsValue u8 (applied where mask has 1s; ignored if mode=toggle)
  - mode u8 (0=set, 1=clear, 2=toggle)
  - styleParamsVersion u8 (0 = none)
  - styleParamsLen u16 (bytes; 0 if none)
  - [styleParams bytes] (TLV; multiple entries allowed)
- TLV (version 1 reserved tags):
  - 0x01 fontWeightNum (u16, 100–900)
  - 0x02 letterSpacing (f32)
  - 0x10..0x3F variation axes (tag=axisId u8, payload f32 absolute)
  - 0x40 underlineColor (u32 RGBA) [future]
  - 0x41 underlineThickness (f32) [future]
- Rules:
  - mode=toggle ignores flagsValue, flips bits in mask.
  - Engine maps logical → UTF-8 offsets internally, mutates runs, splits/merges contiguously identical runs (flags + params).
  - Forward compatibility: unknown tags are skipped using length when styleParamsVersion >= tag version; versioning prevents breakage.

## Snapshot (Authoritative, preferred over queries)
- Packed struct (little-endian):
  - selectionStartLogical u32
  - selectionEndLogical u32
  - selectionStartByte u32
  - selectionEndByte u32
  - caretLogical u32
  - caretByte u32
  - lineIndex u16
  - x f32
  - y f32
  - lineHeight f32
  - styleTriStateFlags u8 (2 bits per attr: bold bits0-1, italic bits2-3, underline bits4-5, strike bits6-7; 00 off, 01 on, 10 mixed, 11 reserved)
  - textGeneration u32
  - styleTriStateParamsLen u16 (bytes)
  - [styleTriStateParams bytes] (TLV: tag u8, state u8 (0 off,1 on,2 mixed), value f32 or sentinel NaN for mixed without representative value)
- Usage: ribbon and overlays read snapshot only; GET_TEXT_STYLE_STATE is fallback/debug.
- Typescript mirror: define constant offsets and DataView/StructView; avoid per-field object allocations in hot paths.

Status: implemented in C++ as `getTextStyleSnapshot` (Embind value_object) and exposed in TS via `TextBridge.getTextStyleSnapshot`. Params block still empty; TS offsets remain available if/when binary snapshot is preferred.

## Indices and Selection (Logical First)
- External contract: logical (grapheme) indices for selection/ranges.
- Engine is responsible for visual hit-test → logical index → UTF-8 byte offsets.
- Storage remains UTF-8; no UI assumption byte==character; ligatures/emoji/IME preserved.

## Extensibility Model
- Flags bitmask reserved for boolean attributes only (bold, italic, underline, strike).
- Parametrized attributes live in versioned styleParams (TLV/struct): numeric weight, letter spacing, variation axes, decorations (color/thickness/offset) in future.
- Versioning allows adding new tags without breaking existing runs/payloads.

## Normalization Rules
- After APPLY_STYLE: split runs at range boundaries, apply deltas, merge adjacent runs with identical (flags + params + fontId + fontSize + color).
- Maintain run order by startByte; ensure deterministic merges.

## Undo / Redo (Engine-First)
- APPLY_STYLE must be reversible; engine keeps command log/stack.
- Inverse can be derived (for toggle) or stored as before/after diff for the affected runs.
- UI (TS) does not maintain style history; it only issues commands and reads snapshot/generation.

## IME / Composition
- Runs support a marked composition span; style applied during composition stays within that span.
- On commit/cancel, engine re-normalizes (merge-compatible runs) and preserves logical/byte offsets correctness.

## Render / Invalidation (Summary)
- Re-shape + atlas/metrics dirty when: bold/italic/fontId/fontSize/variation axes/fontWeightNum change.
- Repaint-only when: underline/strike color/thickness/offset change without affecting glyph metrics.
- Buffers: text vertex buffer dirty on re-shape; underline/strike overlay buffer dirty on decoration changes; atlas dirty only if new glyphs needed.
- Underline/strike must use font metrics (underlinePosition/Thickness) scaled by fontSize and current transform, respecting Y-up vs screen conversion.

## Queries (Fallback)
- GET_TEXT_STYLE_STATE(textId, startLogical, endLogical) returns tri-state and values; use only when snapshot is insufficient.

## Future Delivery Order (suggested)
1) Snapshot/tri-state + TS mirror types (no style apply yet).
2) APPLY_STYLE command + normalization + relayout partial.
3) Undo/redo for styles (engine log).
4) IME spans with safe style application.
5) Relayout/reshape optimizations and full test coverage.

## Test Plan (to implement later)
- Mixed selection toggle bold → on across range; tri-state on; runs merged.
- Underline set/clear repaint-only when metrics unchanged.
- IME composition + toggle italic; post-commit merge and index correctness.
- styleParams weight/letterSpacing/axes: weight triggers reshape; letterSpacing adjusts advances only.
- Undo/redo APPLY_STYLE restores runs/flags/params; generations consistent.
- Snapshot tri-state mixed underline returns bits 10; params block optional or mixed sentinel.
- Large text: relayout partial for small ranges; performance guard.

## Criteria of Acceptance (per stage)
- Snapshot stage: C++/TS structs aligned; tri-state valid; ribbon consumes snapshot only.
- APPLY_STYLE stage: set/clear/toggle correct; logical indices preserved; logical→UTF-8 mapping correct; merges deterministic.
- Undo/redo: reversible without drift; generations increment.
- IME: composition span isolated; normalization stable.
- Render: minimal invalidations; reshape only when metrics change; underline/strike consistent with font metrics and Y-up.
