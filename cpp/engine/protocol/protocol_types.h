/**
 * @file protocol_types.h
 * @brief Protocol types for CadEngine WASM communication
 * 
 * This file contains enums and POD structs used in the JS ↔ Engine protocol.
 * Extracted from engine.h to reduce the "God Object" size.
 * 
 * IMPORTANT: Changes to these types require ABI hash update in both:
 * - cpp/engine/engine_protocol_types.h (computeAbiHash)
 * - frontend/engine/core/protocol.ts (computeAbiHash)
 * 
 * @see AGENTS.md section "Engine-First Architecture"
 * @see docs/agents/audit-action-plan.md
 */

#ifndef ELETROCAD_PROTOCOL_TYPES_H
#define ELETROCAD_PROTOCOL_TYPES_H

#include <cstdint>

namespace engine {
namespace protocol {

// =============================================================================
// Engine Capabilities (runtime feature detection)
// =============================================================================

enum class EngineCapability : std::uint32_t {
    HAS_QUERY_MARQUEE = 1 << 0,
    HAS_RESIZE_HANDLES = 1 << 1,
    HAS_TRANSFORM_RESIZE = 1 << 2,
};

// =============================================================================
// Feature Flags (build-time capabilities for protocol handshake)
// =============================================================================

enum class EngineFeatureFlags : std::uint32_t {
    FEATURE_PROTOCOL = 1 << 0,
    FEATURE_LAYERS_FLAGS = 1 << 1,
    FEATURE_SELECTION_ORDER = 1 << 2,
    FEATURE_SNAPSHOT_VNEXT = 1 << 3,
    FEATURE_EVENT_STREAM = 1 << 4,
    FEATURE_OVERLAY_QUERIES = 1 << 5,
    FEATURE_INTERACTIVE_TRANSFORM = 1 << 6,
    FEATURE_ENGINE_HISTORY = 1 << 7,
    FEATURE_ENGINE_DOCUMENT_SOT = 1 << 8,
};

// =============================================================================
// Layer Property Masks
// =============================================================================

enum class LayerPropMask : std::uint32_t {
    Name = 1 << 0,
    Visible = 1 << 1,
    Locked = 1 << 2,
};

// =============================================================================
// Style Targets (engine-first styling)
// =============================================================================

enum class StyleTarget : std::uint8_t {
    Stroke = 0,
    Fill = 1,
    TextColor = 2,
    TextBackground = 3,
};

enum class StyleState : std::uint8_t {
    None = 0,
    Layer = 1,
    Override = 2,
    Mixed = 3,
};

enum class TriState : std::uint8_t {
    Off = 0,
    On = 1,
    Mixed = 2,
};

// =============================================================================
// Selection Types
// =============================================================================

enum class SelectionMode : std::uint32_t {
    Replace = 0,
    Add = 1,
    Remove = 2,
    Toggle = 3,
};

enum class SelectionModifier : std::uint32_t {
    Shift = 1 << 0,
    Ctrl = 1 << 1,
    Alt = 1 << 2,
    Meta = 1 << 3,
};

enum class MarqueeMode : std::uint32_t {
    Window = 0,
    Crossing = 1,
};

// =============================================================================
// Draw Order Actions
// =============================================================================

enum class ReorderAction : std::uint32_t {
    BringToFront = 1,
    SendToBack = 2,
    BringForward = 3,
    SendBackward = 4,
};

// =============================================================================
// Event Stream Types
// =============================================================================

enum class EventType : std::uint16_t {
    Overflow = 1,
    DocChanged = 2,
    EntityChanged = 3,
    EntityCreated = 4,
    EntityDeleted = 5,
    LayerChanged = 6,
    SelectionChanged = 7,
    OrderChanged = 8,
    HistoryChanged = 9,
};

enum class ChangeMask : std::uint32_t {
    Geometry = 1 << 0,
    Style = 1 << 1,
    Flags = 1 << 2,
    Layer = 1 << 3,
    Order = 1 << 4,
    Text = 1 << 5,
    Bounds = 1 << 6,
    RenderData = 1 << 7,
};

// =============================================================================
// Overlay Types (for selection visualization)
// =============================================================================

enum class OverlayKind : std::uint16_t {
    Polyline = 1,
    Polygon = 2,
    Segment = 3,
    Rect = 4,
    Point = 5,
};

// =============================================================================
// Protocol Handshake Payload (POD struct for Embind)
// =============================================================================

struct ProtocolInfo {
    std::uint32_t protocolVersion;
    std::uint32_t commandVersion;
    std::uint32_t snapshotVersion;
    std::uint32_t eventStreamVersion;
    std::uint32_t abiHash;
    std::uint32_t featureFlags;
};

// =============================================================================
// Buffer Metadata (POD structs for Embind)
// =============================================================================

struct BufferMeta {
    std::uint32_t generation;
    std::uint32_t vertexCount;
    std::uint32_t capacity;   // in vertices
    std::uint32_t floatCount; // convenience for view length
    std::uintptr_t ptr;       // byte offset in WASM linear memory
};

struct ByteBufferMeta {
    std::uint32_t generation;
    std::uint32_t byteCount;
    std::uintptr_t ptr;
};

struct TextureBufferMeta {
    std::uint32_t generation;
    std::uint32_t width;
    std::uint32_t height;
    std::uint32_t byteCount;
    std::uintptr_t ptr;
};

// =============================================================================
// Document Digest (for change detection)
// =============================================================================

struct DocumentDigest {
    std::uint32_t lo;
    std::uint32_t hi;
};

// =============================================================================
// History Metadata
// =============================================================================

struct HistoryMeta {
    std::uint32_t depth;
    std::uint32_t cursor;
    std::uint32_t generation;
};

// =============================================================================
// Style Summary (selection/layer)
// =============================================================================

struct StyleTargetSummary {
    std::uint8_t state;
    std::uint8_t enabledState;
    std::uint8_t supportedState;
    std::uint8_t reserved;
    std::uint32_t colorRGBA;
    std::uint32_t layerId;
};

struct SelectionStyleSummary {
    std::uint32_t selectionCount;
    StyleTargetSummary stroke;
    StyleTargetSummary fill;
    StyleTargetSummary textColor;
    StyleTargetSummary textBackground;
};

struct LayerStyleSnapshot {
    std::uint32_t strokeRGBA;
    std::uint32_t fillRGBA;
    std::uint32_t textColorRGBA;
    std::uint32_t textBackgroundRGBA;
    std::uint8_t strokeEnabled;
    std::uint8_t fillEnabled;
    std::uint8_t textBackgroundEnabled;
    std::uint8_t reserved;
};

// =============================================================================
// Event Structures
// =============================================================================

struct EngineEvent {
    std::uint16_t type;
    std::uint16_t flags;
    std::uint32_t a;
    std::uint32_t b;
    std::uint32_t c;
    std::uint32_t d;
};

struct EventBufferMeta {
    std::uint32_t generation;
    std::uint32_t count;
    std::uintptr_t ptr;
};

// =============================================================================
// Overlay Structures
// =============================================================================

struct OverlayPrimitive {
    std::uint16_t kind;
    std::uint16_t flags;
    std::uint32_t count;  // number of points
    std::uint32_t offset; // float offset into data buffer
};

struct OverlayBufferMeta {
    std::uint32_t generation;
    std::uint32_t primitiveCount;
    std::uint32_t floatCount;
    std::uintptr_t primitivesPtr;
    std::uintptr_t dataPtr;
};

// =============================================================================
// Entity Bounding Box
// =============================================================================

struct EntityAabb {
    float minX;
    float minY;
    float maxX;
    float maxY;
    std::uint32_t valid;
};

// =============================================================================
// Entity Transform (unified transform data for inspector panel)
// =============================================================================

struct EntityTransform {
    float posX;           // Center of AABB (X coordinate)
    float posY;           // Center of AABB (Y coordinate)
    float width;          // Local object width (unrotated)
    float height;         // Local object height (unrotated)
    float rotationDeg;    // Rotation in degrees (-180 to 180), counterclockwise positive
    std::uint32_t hasRotation;  // 1 if entity type supports rotation, 0 otherwise
    std::uint32_t valid;        // 1 if entity exists, 0 otherwise
};

// =============================================================================
// Engine Statistics
// =============================================================================

struct EngineStats {
    std::uint32_t generation;
    std::uint32_t rectCount;
    std::uint32_t lineCount;
    std::uint32_t polylineCount;
    std::uint32_t pointCount;
    std::uint32_t triangleVertexCount;
    std::uint32_t lineVertexCount;
    std::uint32_t rebuildAllGeometryCount;
    float lastLoadMs;
    float lastRebuildMs;
    float lastApplyMs;
    float lastTransformUpdateMs;
    std::uint32_t lastSnapCandidateCount;
    std::uint32_t lastSnapHitCount;
};

// =============================================================================
// Transform Log
// =============================================================================

enum class TransformLogEvent : std::uint32_t {
    Begin = 1,
    Update = 2,
    Commit = 3,
    Cancel = 4,
};

struct TransformLogEntry {
    std::uint32_t type;
    std::uint32_t mode;
    std::uint32_t idOffset;
    std::uint32_t idCount;
    std::uint32_t specificId;
    std::int32_t vertexIndex;
    float x;
    float y;
    std::uint32_t modifiers;
    float viewX;
    float viewY;
    float viewScale;
    float viewWidth;
    float viewHeight;
    std::uint32_t snapEnabled;
    std::uint32_t snapGridEnabled;
    float snapGridSize;
    float snapTolerancePx;
    std::uint32_t snapEndpointEnabled;
    std::uint32_t snapMidpointEnabled;
    std::uint32_t snapCenterEnabled;
    std::uint32_t snapNearestEnabled;
};

// =============================================================================
// Text Metadata
// =============================================================================

struct TextContentMeta {
    std::uint32_t byteCount;  // Length of UTF-8 content in bytes
    std::uintptr_t ptr;       // Pointer to UTF-8 data in WASM memory
    bool exists;              // Whether the text entity exists
};

} // namespace protocol
} // namespace engine

#endif // ELETROCAD_PROTOCOL_TYPES_H
