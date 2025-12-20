#ifndef ELETROCAD_ENGINE_ELECTRICAL_H
#define ELETROCAD_ENGINE_ELECTRICAL_H

#include "engine/types.h"
#include <vector>
#include <cstdint>
#include <unordered_map>

namespace engine {

// Resolve the position of a node by id using the engine containers. Returns true on success.
bool resolveNodePosition(
    const std::unordered_map<std::uint32_t, EntityRef>& entities,
    const std::vector<SymbolRec>& symbols,
    const std::vector<NodeRec>& nodes,
    std::uint32_t nodeId,
    Point2& out
) noexcept;

// Snap to electrical entities. Uses the same result struct as the engine (`SnapResult`).
SnapResult snapElectrical(
    const std::unordered_map<std::uint32_t, EntityRef>& entities,
    const std::vector<SymbolRec>& symbols,
    const std::vector<NodeRec>& nodes,
    float x,
    float y,
    float tolerance
) noexcept;

} // namespace engine

#endif // ELETROCAD_ENGINE_ELECTRICAL_H
