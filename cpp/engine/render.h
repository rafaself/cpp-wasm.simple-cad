#ifndef ELETROCAD_ENGINE_RENDER_H
#define ELETROCAD_ENGINE_RENDER_H

#include "engine/types.h"
#include <vector>
#include <cstdint>

namespace engine {

using ResolveNodeCallback = bool(*)(void* ctx, std::uint32_t nodeId, Point2& out);

// Rebuild triangle and line vertex buffers from world containers.
// The resolve callback is used to compute node positions for conduits.
void rebuildRenderBuffers(
    const std::vector<RectRec>& rects,
    const std::vector<LineRec>& lines,
    const std::vector<PolyRec>& polylines,
    const std::vector<Point2>& points,
    const std::vector<ConduitRec>& conduits,
    const std::vector<SymbolRec>& symbols,
    const std::vector<NodeRec>& nodes,
    std::vector<float>& triangleVertices,
    std::vector<float>& lineVertices,
    ResolveNodeCallback resolveCb,
    void* resolveCtx
);

} // namespace engine

#endif // ELETROCAD_ENGINE_RENDER_H
