#ifndef ELETROCAD_ENGINE_SNAPSHOT_H
#define ELETROCAD_ENGINE_SNAPSHOT_H

#include "engine/core/types.h"
#include <cstdint>
#include <string>
#include <vector>

namespace engine {

struct LayerSnapshot {
    std::uint32_t id;
    std::uint32_t order;
    std::uint32_t flags;
    std::string name;
    // New Style Fields
    float strokeR = 0.0f;
    float strokeG = 0.0f;
    float strokeB = 0.0f;
    float strokeA = 1.0f;
    float fillR = 0.0f;
    float fillG = 0.0f;
    float fillB = 0.0f;
    float fillA = 0.0f;
    float strokeWidth = 1.0f;
};

// Entity Styles could be saved within the entity record or in a separate list.
// Since EntityStyleStore is a sparse map, saving it as a separate list is efficient.
// This avoids changing RectSnapshot etc. if they are just wrapping RectRec.
// However, the report mentioned "Sidecar".
// Let's add a list of EntityStyleSnapshot to SnapshotData.

struct EntityStyleSnapshot {
    std::uint32_t entityId;
    std::uint8_t strokeSource; // 0=ByLayer, 1=Override
    std::uint8_t fillSource;   // 0=ByLayer, 1=Override, 2=None
    float strokeR;
    float strokeG;
    float strokeB;
    float strokeA;
    float fillR;
    float fillG;
    float fillB;
    float fillA;
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
    std::vector<std::uint8_t> historyBytes;
    // New: Styles
    std::vector<EntityStyleSnapshot> styles;

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
