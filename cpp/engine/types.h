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
static constexpr std::uint32_t commandMagicEwdc = 0x43445745; // "EWDC"
static constexpr std::size_t snapshotHeaderBytesV2 = 8 * 4;
static constexpr std::size_t snapshotHeaderBytesV3 = 11 * 4;
static constexpr std::size_t commandHeaderBytes = 4 * 4;
static constexpr std::size_t perCommandHeaderBytes = 4 * 4;
static constexpr std::size_t rectRecordBytes = 36; // id (4) + x,y,w,h,r,g,b,a (8 * 4 = 32) = 36
static constexpr std::size_t lineRecordBytes = 20;
static constexpr std::size_t polyRecordBytes = 12;
static constexpr std::size_t pointRecordBytes = 8;
static constexpr std::size_t symbolRecordBytes = 44;
static constexpr std::size_t nodeRecordBytes = 20;
static constexpr std::size_t conduitRecordBytes = 12;

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
};
struct LineRec { std::uint32_t id; float x0; float y0; float x1; float y1; float r, g, b, a; float enabled; };
struct PolyRec { std::uint32_t id; std::uint32_t offset; std::uint32_t count; float r, g, b, a; float enabled; };
struct Point2 { float x; float y; };

struct SymbolRec {
    std::uint32_t id;
    std::uint32_t symbolKey;
    float x;
    float y;
    float w;
    float h;
    float rotation;
    float scaleX;
    float scaleY;
    float connX;
    float connY;
};

enum class NodeKind : std::uint32_t { Free = 0, Anchored = 1 };
struct NodeRec {
    std::uint32_t id;
    NodeKind kind;
    std::uint32_t anchorSymbolId; // 0 when not anchored
    float x;
    float y;
};

struct ConduitRec {
    std::uint32_t id;
    std::uint32_t fromNodeId;
    std::uint32_t toNodeId;
    float r, g, b, a;
    float enabled;
};

enum class EntityKind : std::uint8_t { Rect = 1, Line = 2, Polyline = 3, Symbol = 4, Node = 5, Conduit = 6 };
struct EntityRef { EntityKind kind; std::uint32_t index; };

enum class CommandOp : std::uint32_t {
    ClearAll = 1,
    UpsertRect = 2,
    UpsertLine = 3,
    UpsertPolyline = 4,
    DeleteEntity = 5,
    UpsertSymbol = 6,
    UpsertNode = 7,
    UpsertConduit = 8,
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
struct RectPayload { float x, y, w, h, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled; };
struct LinePayload { float x0, y0, x1, y1, r, g, b, a, enabled; };
// Polyline payload is variable length, handled manually
struct PolylinePayloadHeader { float r, g, b, a, enabled; std::uint32_t count; std::uint32_t reserved; };
struct SymbolPayload {
    std::uint32_t symbolKey;
    float x, y, w, h;
    float rotation;
    float scaleX, scaleY;
    float connX, connY;
};
struct NodePayload {
    std::uint32_t kind;
    std::uint32_t anchorId;
    float x, y;
};
struct ConduitPayload {
    std::uint32_t fromNodeId;
    std::uint32_t toNodeId;
    float r, g, b, a, enabled;
};

struct SnapResult {
    std::uint32_t kind; // 0 none, 1 node, 2 symbol-connection
    std::uint32_t id;   // node id or symbol id
    float x;
    float y;
};

#endif // ELETROCAD_ENGINE_TYPES_H
