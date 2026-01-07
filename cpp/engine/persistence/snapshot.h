#ifndef ELETROCAD_ENGINE_SNAPSHOT_H
#define ELETROCAD_ENGINE_SNAPSHOT_H

#include "engine/core/types.h"
#include "engine/protocol/protocol_types.h"
#include <cstdint>
#include <string>
#include <vector>

namespace engine {

struct LayerSnapshot {
    std::uint32_t id;
    std::uint32_t order;
    std::uint32_t flags;
    std::string name;
    engine::protocol::LayerStyleSnapshot style;
};

struct RectSnapshot {
    RectRec rec;
    std::uint32_t layerId;
    std::uint32_t flags;
};

struct LineSnapshot {
    LineRec rec;
    std::uint32_t layerId;
    std::uint32_t flags;
};

struct PolySnapshot {
    PolyRec rec;
    std::uint32_t layerId;
    std::uint32_t flags;
};

struct CircleSnapshot {
    CircleRec rec;
    std::uint32_t layerId;
    std::uint32_t flags;
};

struct PolygonSnapshot {
    PolygonRec rec;
    std::uint32_t layerId;
    std::uint32_t flags;
};

struct ArrowSnapshot {
    ArrowRec rec;
    std::uint32_t layerId;
    std::uint32_t flags;
};

struct TextSnapshot {
    std::uint32_t id;
    std::uint32_t layerId;
    std::uint32_t flags;
    TextPayloadHeader header;
    std::vector<TextRunPayload> runs;
    std::string content;
    float layoutWidth;
    float layoutHeight;
    float minX;
    float minY;
    float maxX;
    float maxY;
};

struct StyleOverrideSnapshot {
    std::uint32_t id;
    std::uint8_t colorMask;
    std::uint8_t enabledMask;
    std::uint16_t reserved;
    std::uint32_t textColorRGBA;
    std::uint32_t textBackgroundRGBA;
    std::uint32_t fillEnabled;
    std::uint32_t textBackgroundEnabled;
};

struct SnapshotData {
    std::vector<RectSnapshot> rects;
    std::vector<LineSnapshot> lines;
    std::vector<PolySnapshot> polylines;
    std::vector<Point2> points;
    std::vector<CircleSnapshot> circles;
    std::vector<PolygonSnapshot> polygons;
    std::vector<ArrowSnapshot> arrows;
    std::vector<LayerSnapshot> layers;
    std::vector<std::uint32_t> drawOrder;
    std::vector<std::uint32_t> selection;
    std::vector<TextSnapshot> texts;
    std::vector<StyleOverrideSnapshot> styleOverrides;
    std::vector<std::uint8_t> historyBytes;
    std::uint32_t nextId{1};
    std::uint32_t version{0};
};

// Parse ESNP snapshot bytes into a SnapshotData structure.
// Returns EngineError::Ok on success.
EngineError parseSnapshot(const std::uint8_t* src, std::uint32_t byteCount, SnapshotData& out);

// Build bytes for an ESNP snapshot from SnapshotData.
std::vector<std::uint8_t> buildSnapshotBytes(const SnapshotData& data);

} // namespace engine

#endif // ELETROCAD_ENGINE_SNAPSHOT_H
