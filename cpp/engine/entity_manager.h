#pragma once

#include "engine/types.h"
#include <vector>
#include <unordered_map>
#include <cstdint>
#include <algorithm>

// Forward declaration if needed
struct Point2;

class EntityManager {
public:
    // Core geometric entities storage
    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
    std::vector<CircleRec> circles;
    std::vector<PolygonRec> polygons;
    std::vector<ArrowRec> arrows;

    // Global entity index
    std::unordered_map<std::uint32_t, EntityRef> entities;
    
    // Draw order (list of IDs)
    std::vector<std::uint32_t> drawOrderIds;

    EntityManager();

    void clear() noexcept;
    
    // Reserve capacity for vectors (optimization for snapshot loading)
    void reserve(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints);

    // Deletes an entity from the geometry vectors and index.
    // NOTE: For Text entities (which are stored externally in TextStore), 
    // this method only removes them from 'entities' map and 'drawOrderIds'.
    // The caller is responsible for cleaning up the external store.
    void deleteEntity(std::uint32_t id) noexcept;

    // Upsert methods
    void upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx);
    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx);
    void upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx);
    void upsertCircle(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);
    void upsertPolygon(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, std::uint32_t sides, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);
    void upsertArrow(std::uint32_t id, float ax, float ay, float bx, float by, float head, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);

    // Text registration helper (called by CadEngine when text is added/updated)
    void registerTextEntity(std::uint32_t id);
    
    // Garbage collection for polyline points
    void compactPolylinePoints();
};
