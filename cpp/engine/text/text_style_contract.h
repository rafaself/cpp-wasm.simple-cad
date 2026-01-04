#ifndef ELETROCAD_ENGINE_TEXT_STYLE_CONTRACT_H
#define ELETROCAD_ENGINE_TEXT_STYLE_CONTRACT_H

#include <cstdint>
#include <cstddef>

// Engine-first text styling contract (binary wire layout).
// This header defines constants and packed layouts for the APPLY_STYLE command
// and the style snapshot block. No backward compatibility with legacy payloads
// is required; rollout assumes coordinated engine/frontend update.

namespace engine::text {

// -----------------------------------------------------------------------------
// Opcodes
// -----------------------------------------------------------------------------
static constexpr std::uint32_t commandOpApplyTextStyle = 0x2A; // TEXT_APPLY_STYLE

// -----------------------------------------------------------------------------
// Flags and tri-state packing
// -----------------------------------------------------------------------------
static constexpr std::uint8_t textStyleFlagBold      = 1 << 0;
static constexpr std::uint8_t textStyleFlagItalic    = 1 << 1;
static constexpr std::uint8_t textStyleFlagUnderline = 1 << 2;
static constexpr std::uint8_t textStyleFlagStrike    = 1 << 3;

// Tri-state encoding (2 bits per attribute)
// 00 = off, 01 = on, 10 = mixed, 11 = reserved
enum class TextStyleTriState : std::uint8_t { Off = 0, On = 1, Mixed = 2, Reserved = 3 };

// -----------------------------------------------------------------------------
// TLV tags for styleParams (version 1)
// -----------------------------------------------------------------------------
static constexpr std::uint8_t textStyleTagFontWeightNum   = 0x01; // u16, 100-900
static constexpr std::uint8_t textStyleTagLetterSpacing   = 0x02; // f32
static constexpr std::uint8_t textStyleTagFontSize        = 0x03; // f32
static constexpr std::uint8_t textStyleTagFontId          = 0x04; // u32
static constexpr std::uint8_t textStyleTagAxisBase        = 0x10; // axisId in 0x10..0x3F, f32
static constexpr std::uint8_t textStyleTagUnderlineColor  = 0x40; // u32 RGBA (reserved)
static constexpr std::uint8_t textStyleTagUnderlineThick  = 0x41; // f32 (reserved)

// -----------------------------------------------------------------------------
// TEXT_APPLY_STYLE binary layout (packed). Endianness: little-endian.
// -----------------------------------------------------------------------------
#pragma pack(push, 1)
struct ApplyTextStylePayload {
    std::uint32_t textId;
    std::uint32_t rangeStartLogical; // UTF-16 code unit index, inclusive
    std::uint32_t rangeEndLogical;   // UTF-16 code unit index, end-exclusive
    std::uint8_t  flagsMask;         // bits: bold/italic/underline/strike
    std::uint8_t  flagsValue;        // applied where mask=1; ignored when mode=toggle
    std::uint8_t  mode;              // 0=set, 1=clear, 2=toggle
    std::uint8_t  styleParamsVersion;// 0 = none
    std::uint16_t styleParamsLen;    // bytes following this header
    // [styleParams bytes...]         // TLV entries; multiple allowed
};
#pragma pack(pop)

static constexpr std::size_t applyTextStyleHeaderBytes = sizeof(ApplyTextStylePayload);

// -----------------------------------------------------------------------------
// Style snapshot layout (packed). Endianness: little-endian.
// This block is the authoritative source for ribbon/caret/selection states.
// -----------------------------------------------------------------------------
#pragma pack(push, 1)
struct TextStyleSnapshot {
    std::uint32_t selectionStartLogical;
    std::uint32_t selectionEndLogical;
    std::uint32_t selectionStartByte;
    std::uint32_t selectionEndByte;
    std::uint32_t caretLogical;
    std::uint32_t caretByte;
    std::uint16_t lineIndex;
    float x;
    float y;
    float lineHeight;
    std::uint8_t styleTriStateFlags; // 2 bits per attr (bold/italic/underline/strike)
    std::uint8_t align;              // 0=Left, 1=Center, 2=Right
    std::uint8_t fontIdTriState;     // 0=off/unknown, 1=uniform, 2=mixed
    std::uint8_t fontSizeTriState;   // 0=off/unknown, 1=uniform, 2=mixed
    std::uint32_t fontId;
    float fontSize;
    std::uint32_t textGeneration;
    std::uint16_t styleTriStateParamsLen; // bytes following the header
    // [styleTriStateParams bytes...]
};
#pragma pack(pop)

static constexpr std::size_t textStyleSnapshotHeaderBytes = sizeof(TextStyleSnapshot);

} // namespace engine::text

#endif // ELETROCAD_ENGINE_TEXT_STYLE_CONTRACT_H
