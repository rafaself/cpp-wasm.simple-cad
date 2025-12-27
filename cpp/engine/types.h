#ifndef ELETROCAD_ENGINE_TYPES_H
#define ELETROCAD_ENGINE_TYPES_H

#include <cstdint>
#include <cstddef>

// Lightweight types and constants used by the CAD engine.

// Capacity defaults
static constexpr std::size_t defaultCapacityFloats = 50000;   // ~16.6k vertices
static constexpr std::size_t defaultLineCapacityFloats = 20000; // ~6.6k line vertices
static constexpr std::size_t defaultSnapshotCapacityBytes = 1 * 1024 * 1024;

// Snapshot/command format constants
static constexpr std::uint32_t snapshotMagicEwc1 = 0x31435745; // "EWC1"
static constexpr std::uint32_t snapshotMagicEsnp = 0x504E5345; // "ESNP"
static constexpr std::uint32_t snapshotVersionEsnp = 1;
static constexpr std::uint32_t commandMagicEwdc = 0x43445745; // "EWDC"
static constexpr std::size_t snapshotHeaderBytesV2 = 8 * 4;
static constexpr std::size_t snapshotHeaderBytesV3 = 11 * 4;
static constexpr std::size_t snapshotHeaderBytesEsnp = 4 * 4; // magic + version + sectionCount + reserved
static constexpr std::size_t snapshotSectionEntryBytes = 4 * 4; // tag + offset + size + crc32
static constexpr std::size_t commandHeaderBytes = 4 * 4;
static constexpr std::size_t perCommandHeaderBytes = 4 * 4;
static constexpr std::size_t rectRecordBytes = 36; // id (4) + x,y,w,h,r,g,b,a (8 * 4 = 32) = 36
static constexpr std::size_t lineRecordBytes = 20;
static constexpr std::size_t polyRecordBytes = 12;
static constexpr std::size_t pointRecordBytes = 8;
static constexpr std::size_t textRunRecordBytes = 24; // TextRunPayload size
static constexpr std::size_t textPayloadHeaderBytes = 28; // TextPayloadHeader size

// Render budgeting constants
static constexpr std::size_t rectTriangleFloats = 6 * 7; // 6 vertices * (x,y,z,r,g,b,a)
static constexpr std::size_t rectOutlineFloats = 8 * 7; // 4 segments, 2 vertices each (x,y,z,r,g,b,a)
static constexpr std::size_t lineSegmentFloats = 2 * 7;

// Snapshot (EWC1) persists only the "base" fields for these records.
// Styling fields appended below are runtime-only and defaulted when loading a snapshot.
struct RectRec {
    std::uint32_t id;
    float x;
    float y;
    float w;
    float h;
    float r, g, b, a; // fill RGBA (persisted)
    float sr, sg, sb, sa; // stroke RGBA (runtime-only)
    float strokeEnabled; // 0 or 1 (runtime-only)
    float strokeWidthPx; // screen-space width (runtime-only)
};
struct LineRec { std::uint32_t id; float x0; float y0; float x1; float y1; float r, g, b, a; float enabled; float strokeWidthPx; };
struct PolyRec { 
    std::uint32_t id; 
    std::uint32_t offset; 
    std::uint32_t count; 
    float r, g, b, a; 
    float sr, sg, sb, sa; 
    float enabled; 
    float strokeEnabled; 
    float strokeWidthPx; 
};
struct Point2 { float x; float y; };

struct CircleRec {
    std::uint32_t id;
    float cx, cy;
    float rx, ry;
    float rot;
    float sx, sy;
    float r, g, b, a; // fill
    float sr, sg, sb, sa; // stroke
    float strokeEnabled;
    float strokeWidthPx;
};

struct PolygonRec {
    std::uint32_t id;
    float cx, cy;
    float rx, ry;
    float rot;
    float sx, sy;
    std::uint32_t sides;
    float r, g, b, a; // fill
    float sr, sg, sb, sa; // stroke
    float strokeEnabled;
    float strokeWidthPx;
};

struct ArrowRec {
    std::uint32_t id;
    float ax, ay;
    float bx, by;
    float head;
    float sr, sg, sb, sa;
    float strokeEnabled;
    float strokeWidthPx;
};

// ============================================================================
// Text Types (Engine-Native Text Pipeline)
// ============================================================================

// Text style flags (bitmask)
enum class TextStyleFlags : std::uint8_t {
    None      = 0,
    Bold      = 1 << 0,
    Italic    = 1 << 1,
    Underline = 1 << 2,
    Strike    = 1 << 3,
};

inline TextStyleFlags operator|(TextStyleFlags a, TextStyleFlags b) {
    return static_cast<TextStyleFlags>(static_cast<std::uint8_t>(a) | static_cast<std::uint8_t>(b));
}
inline TextStyleFlags operator&(TextStyleFlags a, TextStyleFlags b) {
    return static_cast<TextStyleFlags>(static_cast<std::uint8_t>(a) & static_cast<std::uint8_t>(b));
}
inline bool hasFlag(TextStyleFlags flags, TextStyleFlags flag) {
    return (static_cast<std::uint8_t>(flags) & static_cast<std::uint8_t>(flag)) != 0;
}

// Text alignment
enum class TextAlign : std::uint8_t {
    Left   = 0,
    Center = 1,
    Right  = 2,
};

// Text box mode
enum class TextBoxMode : std::uint8_t {
    AutoWidth  = 0,  // Grows horizontally, no auto-wrap (only explicit \n)
    FixedWidth = 1,  // Wraps at constraintWidth
};

// A "run" is a contiguous span of text with uniform styling.
// Rich text = multiple runs per TextRec.
struct TextRun {
    std::uint32_t startIndex;   // UTF-8 byte offset into content buffer
    std::uint32_t length;       // UTF-8 byte length of this run
    std::uint32_t fontId;       // Font identifier (0 = default)
    float fontSize;             // Font size in canvas units
    std::uint32_t colorRGBA;    // Packed color: 0xRRGGBBAA
    TextStyleFlags flags;       // Bold, Italic, Underline, Strike
    std::uint8_t reserved[3];   // Padding for alignment
};

// Main text entity record.
// The engine owns layout computation; JS only sets input fields.
struct TextRec {
    std::uint32_t id;
    std::uint32_t drawOrder;    // Z-index for interleaving with shapes

    // Position and constraints (Input from JS)
    float x, y;                 // Anchor position (top-left)
    float rotation;             // Rotation in radians

    TextBoxMode boxMode;        // AutoWidth or FixedWidth
    TextAlign align;            // Left, Center, Right
    std::uint8_t reserved[2];   // Padding

    float constraintWidth;      // Used when boxMode == FixedWidth

    // Layout results (Output from Engine - readonly for JS)
    float layoutWidth;          // Computed width (max line width or constraintWidth)
    float layoutHeight;         // Computed height (sum of line heights)

    // AABB for hit-testing (computed by engine)
    float minX, minY, maxX, maxY;

    // Content references (into global buffers managed by TextStore)
    std::uint32_t contentOffset;  // Byte offset into text content buffer
    std::uint32_t contentLength;  // UTF-8 byte length
    std::uint32_t runsOffset;     // Index into runs array
    std::uint32_t runsCount;      // Number of runs
};

// Caret/selection state for a text entity
struct TextCaretState {
    std::uint32_t textId;
    std::uint32_t caretIndex;     // UTF-8 byte position
    std::uint32_t selectionStart; // Selection anchor (same as caretIndex if no selection)
    std::uint32_t selectionEnd;   // Selection extent
};

// Result of hit-testing a point against text
struct TextHitResult {
    std::uint32_t charIndex;      // UTF-8 byte index of hit character
    std::uint32_t lineIndex;      // Line number (0-based)
    bool isLeadingEdge;           // True if hit is on leading edge of glyph
};

// Caret position for rendering (computed by engine)
struct TextCaretPosition {
    float x, y;                   // Top-left of caret rectangle
    float height;                 // Caret height (line height)
    std::uint32_t lineIndex;      // Which line the caret is on
};

// Result of querying text layout bounds (AABB).
struct TextBoundsResult {
    float minX, minY, maxX, maxY;
    bool valid;
};

enum class EntityKind : std::uint8_t { Rect = 1, Line = 2, Polyline = 3, Circle = 7, Polygon = 8, Arrow = 9, Text = 10 };
struct EntityRef { EntityKind kind; std::uint32_t index; };

enum class CommandOp : std::uint32_t {
    ClearAll = 1,
    UpsertRect = 2,
    UpsertLine = 3,
    UpsertPolyline = 4,
    DeleteEntity = 5,
    SetDrawOrder = 9,
    SetViewScale = 10,
    UpsertCircle = 11,
    UpsertPolygon = 12,
    UpsertArrow = 13,
    // Text commands (Engine-Native Text Pipeline)
    UpsertText = 14,
    DeleteText = 15,
    SetTextCaret = 16,
    SetTextSelection = 17,
    InsertTextContent = 18,   // Insert text at caret position
    DeleteTextContent = 19,   // Delete text range
    ApplyTextStyle = 42,      // TEXT_APPLY_STYLE (0x2A)
    SetTextAlign = 43,        // TEXT_SET_ALIGN (0x2B)
};

enum class EngineError : std::uint32_t {
    Ok = 0,
    InvalidMagic = 1,
    UnsupportedVersion = 2,
    BufferTruncated = 3,
    InvalidPayloadSize = 4,
    UnknownCommand = 5,
    InvalidOperation = 6,
};

// Command Payloads (POD)
struct RectPayload { float x, y, w, h, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx; };
struct LinePayload { float x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx; };
// Polyline payload is variable length, handled manually
struct PolylinePayloadHeader { float r, g, b, a, enabled, strokeWidthPx; std::uint32_t count; std::uint32_t reserved; };

struct DrawOrderPayloadHeader {
    std::uint32_t count;
    std::uint32_t reserved;
};

struct ViewScalePayload { float scale; };

struct CirclePayload {
    float cx, cy;
    float rx, ry;
    float rot;
    float sx, sy;
    float fillR, fillG, fillB, fillA;
    float strokeR, strokeG, strokeB, strokeA;
    float strokeEnabled;
    float strokeWidthPx;
};

struct PolygonPayload {
    float cx, cy;
    float rx, ry;
    float rot;
    float sx, sy;
    float fillR, fillG, fillB, fillA;
    float strokeR, strokeG, strokeB, strokeA;
    float strokeEnabled;
    float strokeWidthPx;
    std::uint32_t sides;
};

struct ArrowPayload {
    float ax, ay;
    float bx, by;
    float head;
    float strokeR, strokeG, strokeB, strokeA;
    float strokeEnabled;
    float strokeWidthPx;
};

// ============================================================================
// Text Command Payloads
// ============================================================================

// Header for UpsertText command (variable-length payload follows)
// Layout: [TextPayloadHeader][TextRunPayload * runCount][UTF-8 content bytes]
struct TextPayloadHeader {
    float x, y;
    float rotation;
    std::uint8_t boxMode;       // 0 = AutoWidth, 1 = FixedWidth
    std::uint8_t align;         // 0 = Left, 1 = Center, 2 = Right
    std::uint8_t reserved[2];
    float constraintWidth;
    std::uint32_t runCount;     // Number of TextRunPayload structs following
    std::uint32_t contentLength; // UTF-8 byte length of content following runs
};

// Per-run data in UpsertText payload
struct TextRunPayload {
    std::uint32_t startIndex;   // Byte offset into content
    std::uint32_t length;       // Byte length
    std::uint32_t fontId;
    float fontSize;
    std::uint32_t colorRGBA;    // Packed 0xRRGGBBAA
    std::uint8_t flags;         // TextStyleFlags as uint8
    std::uint8_t reserved[3];
};

// SetTextCaret payload
struct TextCaretPayload {
    std::uint32_t textId;
    std::uint32_t caretIndex;   // UTF-8 byte position
};

// SetTextSelection payload
struct TextSelectionPayload {
    std::uint32_t textId;
    std::uint32_t selectionStart;
    std::uint32_t selectionEnd;
};

// InsertTextContent payload (variable-length)
// Layout: [TextInsertPayloadHeader][UTF-8 bytes]
struct TextInsertPayloadHeader {
    std::uint32_t textId;
    std::uint32_t insertIndex;  // UTF-8 byte position to insert at
    std::uint32_t byteLength;   // Length of UTF-8 content following
    std::uint32_t reserved;
};

// DeleteTextContent payload
struct TextDeletePayload {
    std::uint32_t textId;
    std::uint32_t startIndex;   // UTF-8 byte start (inclusive)
    std::uint32_t endIndex;     // UTF-8 byte end (exclusive)
    std::uint32_t reserved;
};

// SetTextAlign payload
struct TextAlignmentPayload {
    std::uint32_t textId;
    std::uint8_t align;         // TextAlign enum
    std::uint8_t reserved[3];
};

#endif // ELETROCAD_ENGINE_TYPES_H
