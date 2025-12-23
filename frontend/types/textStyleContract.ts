// Text style binary contract (engine-first). No backward compatibility with legacy payloads.
// Mirrors cpp/engine/text/text_style_contract.h

export const COMMAND_OP_APPLY_TEXT_STYLE = 0x2a;

// Flags (boolean attributes only)
export const TEXT_STYLE_FLAG_BOLD = 1 << 0;
export const TEXT_STYLE_FLAG_ITALIC = 1 << 1;
export const TEXT_STYLE_FLAG_UNDERLINE = 1 << 2;
export const TEXT_STYLE_FLAG_STRIKE = 1 << 3;

// Tri-state encoding (2 bits per attribute)
// 00 off, 01 on, 10 mixed, 11 reserved
export const enum TextStyleTriState {
  Off = 0,
  On = 1,
  Mixed = 2,
  Reserved = 3,
}

// TLV tags (version 1)
export const TEXT_STYLE_TAG_FONT_WEIGHT_NUM = 0x01; // u16, 100-900
export const TEXT_STYLE_TAG_LETTER_SPACING = 0x02; // f32
export const TEXT_STYLE_TAG_AXIS_BASE = 0x10; // axisId in 0x10..0x3f, f32 absolute
export const TEXT_STYLE_TAG_UNDERLINE_COLOR = 0x40; // u32 RGBA (reserved)
export const TEXT_STYLE_TAG_UNDERLINE_THICK = 0x41; // f32 (reserved)

// ApplyTextStyle payload layout (packed, little-endian)
export const APPLY_STYLE_OFFSETS = {
  textId: 0, // u32
  rangeStartLogical: 4, // u32
  rangeEndLogical: 8, // u32
  flagsMask: 12, // u8
  flagsValue: 13, // u8
  mode: 14, // u8 (0=set,1=clear,2=toggle)
  styleParamsVersion: 15, // u8
  styleParamsLen: 16, // u16
  headerBytes: 18, // bytes before TLV block
} as const;

// Style snapshot layout (packed, little-endian)
export const STYLE_SNAPSHOT_OFFSETS = {
  selectionStartLogical: 0, // u32
  selectionEndLogical: 4, // u32
  selectionStartByte: 8, // u32
  selectionEndByte: 12, // u32
  caretLogical: 16, // u32
  caretByte: 20, // u32
  lineIndex: 24, // u16
  x: 26, // f32
  y: 30, // f32
  lineHeight: 34, // f32
  styleTriStateFlags: 38, // u8 (2 bits per attr)
  textGeneration: 39, // u32
  styleTriStateParamsLen: 43, // u16
  headerBytes: 45, // bytes before params TLV
} as const;
