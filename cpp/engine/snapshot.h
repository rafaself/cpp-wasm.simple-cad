#ifndef ELETROCAD_ENGINE_SNAPSHOT_H
#define ELETROCAD_ENGINE_SNAPSHOT_H

#include "engine/types.h"
#include <cstdint>
#include <vector>

namespace engine {

struct SnapshotData {
    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
    std::vector<SymbolRec> symbols;
    std::vector<NodeRec> nodes;
    std::vector<ConduitRec> conduits;
    std::vector<std::uint8_t> rawBytes; // original payload (header + records)
    std::uint32_t version{0};
};

// Parse snapshot bytes into a SnapshotData structure. Throws std::runtime_error on error.
SnapshotData parseSnapshot(const std::uint8_t* src, std::uint32_t byteCount);

// Build bytes for a V3 snapshot from SnapshotData.
std::vector<std::uint8_t> buildSnapshotBytes(const SnapshotData& data);

} // namespace engine

#endif // ELETROCAD_ENGINE_SNAPSHOT_H
