#ifndef ELETROCAD_ENGINE_RENDER_H
#define ELETROCAD_ENGINE_RENDER_H

#include "engine/core/types.h"
#include <vector>
#include <cstdint>
#include <unordered_map>

namespace engine {

struct ResolvedShapeStyle {
    float fillR;
    float fillG;
    float fillB;
    float fillA;
    float strokeR;
    float strokeG;
    float strokeB;
    float strokeA;
    float fillEnabled;
    float strokeEnabled;
};

using ResolveNodeCallback = bool(*)(void* ctx, std::uint32_t nodeId, Point2& out);
using EntityVisibilityFn = bool(*)(void* ctx, std::uint32_t entityId);
using ResolveStyleFn = bool(*)(void* ctx, std::uint32_t entityId, EntityKind kind, ResolvedShapeStyle& outStyle);

struct RenderRange {
    std::uint32_t offset; // float offset into triangle buffer
    std::uint32_t count;  // float count
};

// Append triangle vertices for a single entity into the provided buffer.
// Returns false if entity is not renderable or not visible.
bool buildEntityRenderData(
    std::uint32_t entityId,
    const EntityRef& ref,
    const std::vector<RectRec>& rects,
    const std::vector<LineRec>& lines,
    const std::vector<PolyRec>& polylines,
    const std::vector<Point2>& points,
    const std::vector<CircleRec>& circles,
    const std::vector<PolygonRec>& polygons,
    const std::vector<ArrowRec>& arrows,
    float viewScale,
    std::vector<float>& triangleVertices,
    void* resolveCtx,
    EntityVisibilityFn isVisible,
    ResolveStyleFn resolveStyle
);

// Rebuild triangle and line vertex buffers from world containers.
void rebuildRenderBuffers(
    const std::vector<RectRec>& rects,
    const std::vector<LineRec>& lines,
    const std::vector<PolyRec>& polylines,
    const std::vector<Point2>& points,
    const std::vector<CircleRec>& circles,
    const std::vector<PolygonRec>& polygons,
    const std::vector<ArrowRec>& arrows,
    const std::unordered_map<std::uint32_t, EntityRef>& entities,
    const std::vector<std::uint32_t>& drawOrderIds,
    float viewScale,
    std::vector<float>& triangleVertices,
    std::vector<float>& lineVertices,
    void* resolveCtx,
    EntityVisibilityFn isVisible,
    ResolveStyleFn resolveStyle,
    std::unordered_map<std::uint32_t, RenderRange>* outRanges
);

} // namespace engine

#endif // ELETROCAD_ENGINE_RENDER_H
