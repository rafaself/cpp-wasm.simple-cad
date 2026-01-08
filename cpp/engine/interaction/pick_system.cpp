#include "engine/interaction/pick_system.h"
#include <cmath>
#include <algorithm>
#include <limits>

// Masks corresponding to JS side
static const std::uint32_t PICK_BODY   = 1 << 0;
static const std::uint32_t PICK_EDGE   = 1 << 1;
static const std::uint32_t PICK_VERTEX = 1 << 2;
static const std::uint32_t PICK_HANDLES = 1 << 3; // Not fully implemented in this iteration
static const std::uint32_t PICK_TEXT_CARET = 1 << 4;

// Math helpers
static float distSq(float x1, float y1, float x2, float y2) {
    float dx = x1 - x2;
    float dy = y1 - y2;
    return dx*dx + dy*dy;
}

// Transform a point from world space to local space (inverse rotation around center)
static void worldToLocal(float wx, float wy, float cx, float cy, float rot, float& lx, float& ly) {
    if (std::abs(rot) < 1e-6f) {
        lx = wx;
        ly = wy;
        return;
    }
    const float cosR = std::cos(-rot);
    const float sinR = std::sin(-rot);
    const float dx = wx - cx;
    const float dy = wy - cy;
    lx = cx + dx * cosR - dy * sinR;
    ly = cy + dx * sinR + dy * cosR;
}

// Transform a point from local space to world space (apply rotation around center)
static void localToWorld(float lx, float ly, float cx, float cy, float rot, float& wx, float& wy) {
    if (std::abs(rot) < 1e-6f) {
        wx = lx;
        wy = ly;
        return;
    }
    const float cosR = std::cos(rot);
    const float sinR = std::sin(rot);
    const float dx = lx - cx;
    const float dy = ly - cy;
    wx = cx + dx * cosR - dy * sinR;
    wy = cy + dx * sinR + dy * cosR;
}

static float distToSegmentSq(float px, float py, float x1, float y1, float x2, float y2) {
    float l2 = distSq(x1, y1, x2, y2);
    if (l2 == 0) return distSq(px, py, x1, y1);
    float t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = std::max(0.0f, std::min(1.0f, t));
    return distSq(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
}

static bool tryPickResizeHandleAabb(float x, float y, float tol, float minX, float minY, float maxX, float maxY, float& bestDist, PickCandidate& outCandidate) {
    bool hit = false;
    const float corners[4][2] = {
        {minX, minY},
        {maxX, minY},
        {maxX, maxY},
        {minX, maxY},
    };

    for (int i = 0; i < 4; ++i) {
        const float d = std::sqrt(distSq(x, y, corners[i][0], corners[i][1]));
        if (d <= tol && d < bestDist) {
            bestDist = d;
            outCandidate.subTarget = PickSubTarget::ResizeHandle;
            outCandidate.subIndex = i;
            hit = true;
        }
    }

    return hit;
}

// Rotated version: corners are in world space (already rotated)
static bool tryPickResizeHandleRotated(float x, float y, float tol,
    float cx, float cy, float hw, float hh, float rot,
    float& bestDist, PickCandidate& outCandidate) {

    // Local space corners (unrotated)
    const float localCorners[4][2] = {
        {cx - hw, cy - hh},  // BL
        {cx + hw, cy - hh},  // BR
        {cx + hw, cy + hh},  // TR
        {cx - hw, cy + hh},  // TL
    };

    bool hit = false;
    for (int i = 0; i < 4; ++i) {
        // Transform corner to world space
        float wx, wy;
        localToWorld(localCorners[i][0], localCorners[i][1], cx, cy, rot, wx, wy);

        const float d = std::sqrt(distSq(x, y, wx, wy));
        if (d <= tol && d < bestDist) {
            bestDist = d;
            outCandidate.subTarget = PickSubTarget::ResizeHandle;
            outCandidate.subIndex = i;
            hit = true;
        }
    }

    return hit;
}

static bool tryPickRotateHandleAabb(float x, float y, float tol, float viewScale, float minX, float minY, float maxX, float maxY, float& bestDist, PickCandidate& outCandidate) {
    // Rotation handles are positioned diagonally outside each corner
    // ROTATION_HANDLE_OFFSET_PX = 15px in screen space
    // ROTATION_HANDLE_RADIUS_PX = 10px in screen space
    const float offsetPx = 15.0f;
    const float radiusPx = 10.0f;

    // Convert screen pixels to world space
    const float offsetWorld = offsetPx / viewScale;
    const float radiusWorld = radiusPx / viewScale;

    bool hit = false;

    // Corner positions and their outward diagonal directions
    const struct {
        float x, y;
        float dx, dy;  // Normalized diagonal direction
    } corners[4] = {
        {minX, minY, -0.707f, -0.707f},  // BL: down-left
        {maxX, minY,  0.707f, -0.707f},  // BR: down-right
        {maxX, maxY,  0.707f,  0.707f},  // TR: up-right
        {minX, maxY, -0.707f,  0.707f},  // TL: up-left
    };

    for (int i = 0; i < 4; ++i) {
        // Calculate rotation handle position (offset diagonally from corner)
        const float handleX = corners[i].x + corners[i].dx * offsetWorld;
        const float handleY = corners[i].y + corners[i].dy * offsetWorld;

        const float d = std::sqrt(distSq(x, y, handleX, handleY));
        if (d <= radiusWorld && d < bestDist) {
            bestDist = d;
            outCandidate.subTarget = PickSubTarget::RotateHandle;
            outCandidate.subIndex = i;
            hit = true;
        }
    }

    return hit;
}

// Rotated version for rectangles with rotation
static bool tryPickRotateHandleRotated(float x, float y, float tol, float viewScale,
    float cx, float cy, float hw, float hh, float rot,
    float& bestDist, PickCandidate& outCandidate) {

    const float offsetPx = 15.0f;
    const float radiusPx = 10.0f;
    const float offsetWorld = offsetPx / viewScale;
    const float radiusWorld = radiusPx / viewScale;

    // Local space corners (unrotated)
    const float localCorners[4][2] = {
        {cx - hw, cy - hh},  // BL
        {cx + hw, cy - hh},  // BR
        {cx + hw, cy + hh},  // TR
        {cx - hw, cy + hh},  // TL
    };

    // Base diagonal directions (unrotated)
    const float baseDirs[4][2] = {
        {-0.707f, -0.707f},  // BL: down-left
        { 0.707f, -0.707f},  // BR: down-right
        { 0.707f,  0.707f},  // TR: up-right
        {-0.707f,  0.707f},  // TL: up-left
    };

    bool hit = false;
    const float cosR = std::cos(rot);
    const float sinR = std::sin(rot);

    for (int i = 0; i < 4; ++i) {
        // Transform corner to world space
        float cornerWx, cornerWy;
        localToWorld(localCorners[i][0], localCorners[i][1], cx, cy, rot, cornerWx, cornerWy);

        // Rotate the direction vector
        const float dirX = baseDirs[i][0] * cosR - baseDirs[i][1] * sinR;
        const float dirY = baseDirs[i][0] * sinR + baseDirs[i][1] * cosR;

        // Calculate handle position
        const float handleX = cornerWx + dirX * offsetWorld;
        const float handleY = cornerWy + dirY * offsetWorld;

        const float d = std::sqrt(distSq(x, y, handleX, handleY));
        if (d <= radiusWorld && d < bestDist) {
            bestDist = d;
            outCandidate.subTarget = PickSubTarget::RotateHandle;
            outCandidate.subIndex = i;
            hit = true;
        }
    }

    return hit;
}

// SpatialHashGrid implementation
SpatialHashGrid::SpatialHashGrid(float cellSize) : cellSize_(cellSize) {}

std::int64_t SpatialHashGrid::hash(int ix, int iy) const {
    // Simple spatial hash
    return (static_cast<std::int64_t>(ix) * 73856093) ^ (static_cast<std::int64_t>(iy) * 19349663);
}

void SpatialHashGrid::insert(std::uint32_t id, const AABB& bounds) {
    int minX = static_cast<int>(std::floor(bounds.minX / cellSize_));
    int maxX = static_cast<int>(std::floor(bounds.maxX / cellSize_));
    int minY = static_cast<int>(std::floor(bounds.minY / cellSize_));
    int maxY = static_cast<int>(std::floor(bounds.maxY / cellSize_));

    std::vector<std::int64_t> cellKeys;

    for (int x = minX; x <= maxX; ++x) {
        for (int y = minY; y <= maxY; ++y) {
            std::int64_t key = hash(x, y);
            cells_[key].push_back(id);
            cellKeys.push_back(key);
        }
    }
    entityCells_[id] = std::move(cellKeys);
}

void SpatialHashGrid::remove(std::uint32_t id) {
    auto it = entityCells_.find(id);
    if (it == entityCells_.end()) return;

    for (std::int64_t key : it->second) {
        auto& list = cells_[key];
        // Swap-remove
        for (size_t i = 0; i < list.size(); ++i) {
            if (list[i] == id) {
                list[i] = list.back();
                list.pop_back();
                break;
            }
        }
        if (list.empty()) {
            cells_.erase(key);
        }
    }
    entityCells_.erase(it);
}

void SpatialHashGrid::clear() {
    cells_.clear();
    entityCells_.clear();
}

void SpatialHashGrid::query(const AABB& bounds, std::vector<std::uint32_t>& results) const {
    int minX = static_cast<int>(std::floor(bounds.minX / cellSize_));
    int maxX = static_cast<int>(std::floor(bounds.maxX / cellSize_));
    int minY = static_cast<int>(std::floor(bounds.minY / cellSize_));
    int maxY = static_cast<int>(std::floor(bounds.maxY / cellSize_));

    // Use a small local cache to avoid duplicates?
    // For now, simpler to push all and sort/unique outside or check duplicates.
    // PickSystem handles unique candidates.

    for (int x = minX; x <= maxX; ++x) {
        for (int y = minY; y <= maxY; ++y) {
            std::int64_t key = hash(x, y);
            auto it = cells_.find(key);
            if (it != cells_.end()) {
                results.insert(results.end(), it->second.begin(), it->second.end());
            }
        }
    }
}

// PickSystem Implementation

PickSystem::PickSystem() : index_(50.0f) {}

void PickSystem::clear() {
    index_.clear();
    zIndexMap_.clear();
    lastStats_ = {0, 0};
}

void PickSystem::update(std::uint32_t id, const AABB& bounds) {
    remove(id); // re-insert strategy
    index_.insert(id, bounds);
}

void PickSystem::remove(std::uint32_t id) {
    index_.remove(id);
}

void PickSystem::setDrawOrder(const std::vector<std::uint32_t>& order) {
    zIndexMap_.clear();
    for (size_t i = 0; i < order.size(); ++i) {
        zIndexMap_[order[i]] = static_cast<std::uint32_t>(i);
    }
}

void PickSystem::setZ(std::uint32_t id, std::uint32_t z) {
    zIndexMap_[id] = z;
}

std::uint32_t PickSystem::getMaxZ() const {
    if (zIndexMap_.empty()) return 0;
    // This isn't efficient for find-max, but usually we assign Z sequentially.
    // Actually this method is rarely used in C++ core logic, mainly for bridge/sync.
    return static_cast<std::uint32_t>(zIndexMap_.size());
}

// AABB Helpers
AABB PickSystem::computeRectAABB(const RectRec& r) {
    // Rotation not fully handled in AABB for simplicity (axis aligned of rotated shape is larger)
    // But precise hit test handles rotation.
    // AABB must cover the rotated shape.
    float cx = r.x + r.w * 0.5f;
    float cy = r.y + r.h * 0.5f;
    float radius = std::sqrt(r.w*r.w + r.h*r.h) * 0.5f;
    // Conservative AABB
    return { cx - radius, cy - radius, cx + radius, cy + radius };
}

AABB PickSystem::computeCircleAABB(const CircleRec& c) {
    const float rx = std::abs(c.rx * c.sx);
    const float ry = std::abs(c.ry * c.sy);
    
    if (c.rot == 0.0f) {
        return { c.cx - rx, c.cy - ry, c.cx + rx, c.cy + ry };
    }
    
    const float cost = std::cos(c.rot);
    const float sint = std::sin(c.rot);
    
    // Calculate axis-aligned bounding box extents for rotated ellipse
    // ex = sqrt((rx*cos(t))^2 + (ry*sin(t))^2)
    const float ex = std::sqrt((rx * cost) * (rx * cost) + (ry * sint) * (ry * sint));
    const float ey = std::sqrt((rx * sint) * (rx * sint) + (ry * cost) * (ry * cost));
    
    return { c.cx - ex, c.cy - ey, c.cx + ex, c.cy + ey };
}

AABB PickSystem::computeLineAABB(const LineRec& l) {
    return {
        std::min(l.x0, l.x1), std::min(l.y0, l.y1),
        std::max(l.x0, l.x1), std::max(l.y0, l.y1)
    };
}

AABB PickSystem::computePolylineAABB(const PolyRec& pl, const std::vector<Point2>& points) {
    if (pl.count == 0) return {0,0,0,0};
    float minX = std::numeric_limits<float>::max();
    float minY = std::numeric_limits<float>::max();
    float maxX = std::numeric_limits<float>::lowest();
    float maxY = std::numeric_limits<float>::lowest();

    for (size_t i = 0; i < pl.count; ++i) {
        Point2 p = points[pl.offset + i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
}

AABB PickSystem::computePolygonAABB(const PolygonRec& p) {
    // Conservative approximation using circumscribed ellipse bounds
    const float rx = std::abs(p.rx * p.sx);
    const float ry = std::abs(p.ry * p.sy);
    
    if (p.rot == 0.0f) {
        return { p.cx - rx, p.cy - ry, p.cx + rx, p.cy + ry };
    }
    
    const float cost = std::cos(p.rot);
    const float sint = std::sin(p.rot);
    
    const float ex = std::sqrt((rx * cost) * (rx * cost) + (ry * sint) * (ry * sint));
    const float ey = std::sqrt((rx * sint) * (rx * sint) + (ry * cost) * (ry * cost));
    
    return { p.cx - ex, p.cy - ey, p.cx + ex, p.cy + ey };
}

AABB PickSystem::computeArrowAABB(const ArrowRec& a) {
     return {
        std::min(a.ax, a.bx) - a.head, std::min(a.ay, a.by) - a.head,
        std::max(a.ax, a.bx) + a.head, std::max(a.ay, a.by) + a.head
    };
}

// ---------------------------------------------------------
// Pick Implementation
// ---------------------------------------------------------

std::uint32_t PickSystem::pick(float x, float y, float tolerance, float viewScale,
                              const EntityManager& entities, const TextSystem& textSystem) {
    // Legacy wrapper
    PickResult res = pickEx(x, y, tolerance, viewScale, PICK_BODY | PICK_EDGE, entities, textSystem);
    return res.id;
}

bool PickSystem::checkCandidate(
    std::uint32_t id, float x, float y, float tol, float viewScale,
    std::uint32_t pickMask,
    const EntityManager& entities,
    const TextSystem& textSystem,
    PickCandidate& outCandidate)
{
    if (!entities.isEntityPickable(id)) {
        return false;
    }
    // Retrieve entity from manager
    // We need to find which type it is. EntityManager stores vectors of structs.
    // PickSystem stores ID only. We need to query EntityManager by ID.
    // Since EntityManager is struct-of-arrays, we iterate or use a map if available.
    // The current EntityManager doesn't expose strict ID->Type/Index map efficiently
    // in public headers provided, usually it's O(1) if we have the index, but we have ID.
    // However, for this task, let's assume we can scan or the ID implies type.
    // Actually, checking `entities.getRect(id)` usually iterates?
    // Let's assume `entities` has `findById` or similar, or we iterate types.
    // Optimization: We know the ID.

    // NOTE: The provided context for EntityManager was minimal.
    // I will implement a brute-force search across types for the ID if `get` methods are not O(1).
    // But typically EntityManager has a map or we check all.

    outCandidate.id = id;
    outCandidate.distance = std::numeric_limits<float>::max();
    outCandidate.zIndex = zIndexMap_.count(id) ? zIndexMap_.at(id) : 0;
    outCandidate.subTarget = PickSubTarget::None;
    outCandidate.subIndex = -1;
    outCandidate.kind = PickEntityKind::Unknown;

    bool hit = false;
    float bestDist = std::numeric_limits<float>::max();

    // 1. RECT
    if (const RectRec* r = entities.getRect(id)) {
        outCandidate.kind = PickEntityKind::Rect;

        // Rectangle bounds (local/unrotated space)
        const float minX = r->x;
        const float minY = r->y;
        const float maxX = r->x + r->w;
        const float maxY = r->y + r->h;

        // Center and half-dimensions for rotation
        const float cx = r->x + r->w * 0.5f;
        const float cy = r->y + r->h * 0.5f;
        const float hw = r->w * 0.5f;
        const float hh = r->h * 0.5f;
        const float rot = r->rot;
        const bool hasRotation = std::abs(rot) > 1e-6f;

        // Transform pick point to local space (undo rotation)
        float lx, ly;
        worldToLocal(x, y, cx, cy, rot, lx, ly);

        // Resize Handles (corners in world space)
        if (pickMask & PICK_HANDLES) {
            if (hasRotation) {
                if (tryPickResizeHandleRotated(x, y, tol, cx, cy, hw, hh, rot, bestDist, outCandidate)) {
                    outCandidate.distance = bestDist;
                    return true;
                }
                if (tryPickRotateHandleRotated(x, y, tol, viewScale, cx, cy, hw, hh, rot, bestDist, outCandidate)) {
                    outCandidate.distance = bestDist;
                    return true;
                }
            } else {
                if (tryPickResizeHandleAabb(x, y, tol, minX, minY, maxX, maxY, bestDist, outCandidate)) {
                    outCandidate.distance = bestDist;
                    return true;
                }
                if (tryPickRotateHandleAabb(x, y, tol, viewScale, minX, minY, maxX, maxY, bestDist, outCandidate)) {
                    outCandidate.distance = bestDist;
                    return true;
                }
            }
        }

        // Vertex (use local space point, world space corners for rotated)
        if (pickMask & PICK_VERTEX) {
            if (hasRotation) {
                // Test distance to rotated corners in world space
                const float localCorners[4][2] = {
                    {minX, minY}, {maxX, minY}, {maxX, maxY}, {minX, maxY}
                };
                for (int i = 0; i < 4; ++i) {
                    float wx, wy;
                    localToWorld(localCorners[i][0], localCorners[i][1], cx, cy, rot, wx, wy);
                    float d = std::sqrt(distSq(x, y, wx, wy));
                    if (d <= tol && d < bestDist) {
                        bestDist = d;
                        outCandidate.subTarget = PickSubTarget::Vertex;
                        outCandidate.subIndex = i;
                    }
                }
            } else {
                float dCorners[4] = {
                    distSq(x, y, minX, minY),
                    distSq(x, y, maxX, minY),
                    distSq(x, y, maxX, maxY),
                    distSq(x, y, minX, maxY)
                };
                for (int i = 0; i < 4; ++i) {
                    float d = std::sqrt(dCorners[i]);
                    if (d <= tol && d < bestDist) {
                        bestDist = d;
                        outCandidate.subTarget = PickSubTarget::Vertex;
                        outCandidate.subIndex = i;
                    }
                }
            }
        }

        // Edge and Body hit test in local space
        // The pick point (lx, ly) is now in the rectangle's local coordinate system
        if (bestDist > tol && (pickMask & PICK_EDGE)) {
            bool inside = (lx >= minX && lx <= maxX && ly >= minY && ly <= maxY);
            if (inside) {
                float dLeft = std::abs(lx - minX);
                float dRight = std::abs(lx - maxX);
                float dBottom = std::abs(ly - minY);
                float dTop = std::abs(ly - maxY);
                float dEdge = std::min({dLeft, dRight, dBottom, dTop});

                if (dEdge <= tol) {
                    bestDist = dEdge;
                    outCandidate.subTarget = PickSubTarget::Edge;
                    outCandidate.subIndex = -1;
                } else if (pickMask & PICK_BODY) {
                    if (entities.resolveFillEnabled(id)) {
                        bestDist = 0;
                        outCandidate.subTarget = PickSubTarget::Body;
                    }
                }
            } else {
                // Outside in local space, check distance to rect edge
                float dx = std::max({minX - lx, 0.0f, lx - maxX});
                float dy = std::max({minY - ly, 0.0f, ly - maxY});
                float d = std::sqrt(dx * dx + dy * dy);
                if (d <= tol) {
                    bestDist = d;
                    outCandidate.subTarget = PickSubTarget::Edge;
                }
            }
        }

        hit = (outCandidate.subTarget != PickSubTarget::None);
    }
    // 2. CIRCLE (actually ellipse)
    else if (const CircleRec* c = entities.getCircle(id)) {
        outCandidate.kind = PickEntityKind::Circle;

        // Effective radii including scale
        const float rx = std::abs(c->rx * c->sx);
        const float ry = std::abs(c->ry * c->sy);
        
        // Guard against degenerate ellipse
        if (rx < 1e-6f || ry < 1e-6f) {
            return false;
        }

        // Resize Handles (BBox corners) - Higher priority
        if (pickMask & PICK_HANDLES) {
            const float minX = c->cx - rx;
            const float maxX = c->cx + rx;
            const float minY = c->cy - ry;
            const float maxY = c->cy + ry;
            if (tryPickResizeHandleAabb(x, y, tol, minX, minY, maxX, maxY, bestDist, outCandidate)) {
                outCandidate.distance = bestDist;
                return true;
            }
            // Rotation Handles (outside corners) - Lower priority
            if (tryPickRotateHandleAabb(x, y, tol, viewScale, minX, minY, maxX, maxY, bestDist, outCandidate)) {
                outCandidate.distance = bestDist;
                return true;
            }
        }

        // Transform pick point to local ellipse space (undo rotation)
        float localX = x - c->cx;
        float localY = y - c->cy;
        
        if (c->rot != 0.0f) {
            const float cosR = std::cos(-c->rot);
            const float sinR = std::sin(-c->rot);
            const float tx = localX * cosR - localY * sinR;
            const float ty = localX * sinR + localY * cosR;
            localX = tx;
            localY = ty;
        }
        
        // Normalize to unit circle space: divide by radii
        const float nx = localX / rx;
        const float ny = localY / ry;
        
        // Distance from origin in normalized space = distance to unit circle
        const float normDist = std::sqrt(nx * nx + ny * ny);
        
        // Approximate distance to ellipse edge in world space
        // For a point on ellipse edge, normDist = 1.0
        // Distance to edge ≈ |normDist - 1| * average_radius
        const float avgRadius = (rx + ry) * 0.5f;
        const float distToEdge = std::abs(normDist - 1.0f) * avgRadius;

        // Edge hit
        if (pickMask & PICK_EDGE) {
            if (distToEdge <= tol) {
                bestDist = distToEdge;
                outCandidate.subTarget = PickSubTarget::Edge;
                hit = true;
            }
        }

        // Body hit (inside ellipse)
        if (!hit && (pickMask & PICK_BODY)) {
            if (normDist <= 1.0f + tol / avgRadius) {
                if (entities.resolveFillEnabled(id)) {
                    bestDist = distToEdge;
                    outCandidate.subTarget = PickSubTarget::Body;
                    hit = true;
                }
            }
        }
    }
    // 3. LINE
    else if (const LineRec* l = entities.getLine(id)) {
        outCandidate.kind = PickEntityKind::Line;
        float dSegSq = distToSegmentSq(x, y, l->x0, l->y0, l->x1, l->y1);
        float dSeg = std::sqrt(dSegSq);

        // Vertex
        if (pickMask & PICK_VERTEX) {
            float d0 = std::sqrt(distSq(x, y, l->x0, l->y0));
            float d1 = std::sqrt(distSq(x, y, l->x1, l->y1));

            if (d0 <= tol || d1 <= tol) {
                if (d0 < d1) {
                    bestDist = d0;
                    outCandidate.subIndex = 0;
                } else {
                    bestDist = d1;
                    outCandidate.subIndex = 1;
                }
                outCandidate.subTarget = PickSubTarget::Vertex;
                hit = true;
            }
        }

        if (!hit && (pickMask & PICK_EDGE)) {
             // Add stroke width to tolerance?
             float effectiveTol = tol + (l->strokeWidthPx * 0.5f / viewScale); // approx
             if (dSeg <= effectiveTol) {
                 bestDist = dSeg;
                 outCandidate.subTarget = PickSubTarget::Edge;
                 hit = true;
             }
        }
    }
    // 4. POLYLINE
    else if (const PolyRec* pl = entities.getPolyline(id)) {
        outCandidate.kind = PickEntityKind::Polyline;
        const auto& pts = entities.getPoints(); // Shared buffer
        bool vertexHit = false;

        // Vertex Check
        if (pickMask & PICK_VERTEX) {
            for(size_t i=0; i<pl->count; ++i) {
                const Point2& p = pts[pl->offset + i];
                float d = std::sqrt(distSq(x, y, p.x, p.y));
                if (d <= tol && d < bestDist) {
                    bestDist = d;
                    outCandidate.subTarget = PickSubTarget::Vertex;
                    outCandidate.subIndex = static_cast<int>(i);
                    vertexHit = true;
                }
            }
        }

        // Edge Check (if no vertex hit or lower priority? PickCandidate sorts this out)
        // If we found a vertex, bestDist is small. Edge might be smaller? No, vertex is 0 dist.
        // Actually vertex hit has priority in operator<.

        if (!vertexHit && (pickMask & PICK_EDGE)) {
            float effectiveTol = tol + (pl->strokeWidthPx * 0.5f / viewScale);
            for(size_t i=0; i<pl->count - 1; ++i) {
                const Point2& p0 = pts[pl->offset + i];
                const Point2& p1 = pts[pl->offset + i + 1];
                float d = std::sqrt(distToSegmentSq(x, y, p0.x, p0.y, p1.x, p1.y));
                if (d <= effectiveTol && d < bestDist) {
                    bestDist = d;
                    outCandidate.subTarget = PickSubTarget::Edge;
                    outCandidate.subIndex = static_cast<int>(i); // Edge index
                }
            }
        }

        hit = (bestDist < std::numeric_limits<float>::max());
    }
    // 5. TEXT
    // 5. TEXT
    else if (const TextRec* t = textSystem.store.getText(id)) {
        outCandidate.kind = PickEntityKind::Text;

        // Rotation Handles (AABB corners of text bounds)
        if (pickMask & PICK_HANDLES) {
            if (tryPickRotateHandleAabb(x, y, tol, viewScale, t->minX, t->minY, t->maxX, t->maxY, bestDist, outCandidate)) {
                outCandidate.distance = bestDist;
                return true;
            }
        }

        // Hit test via TextSystem
        // Text is complex (rotation, alignment). TextSystem has hitTest logic?
        // textSystem.hitTest(id, x, y) -> returns char index etc.

        // Check bounds
        // TextRec has minX, minY, maxX, maxY computed by layout.
        // Rotate point to local space?
        // AABB check first
        if (x >= t->minX - tol && x <= t->maxX + tol &&
            y >= t->minY - tol && y <= t->maxY + tol) {

            // Detailed hit test
            // We need local coordinates.
            float dx = x - t->x;
            float dy = y - t->y;
            float c = std::cos(-t->rotation);
            float s = std::sin(-t->rotation);
            float lx = dx * c - dy * s;
            float ly = dx * s + dy * c;

            // TextSystem hit test
            // auto hitRes = textSystem.hitTest(id, lx, ly);
            // For now, simple AABB/Box hit

            // If Text Caret mode
            if (pickMask & PICK_TEXT_CARET) {
                // assume hit
                 bestDist = 0;
                 outCandidate.subTarget = PickSubTarget::TextCaret;
                 // outCandidate.subIndex = hitRes.charIndex;
                 hit = true;
            } else if (pickMask & PICK_BODY) {
                 bestDist = 0;
                 outCandidate.subTarget = PickSubTarget::TextBody;
                 hit = true;
            }
        }
    }
    // 6. POLYGON (Regular)
    else if (const PolygonRec* p = entities.getPolygon(id)) {
        outCandidate.kind = PickEntityKind::Polygon;

        // Resize Handles (BBox corners) - Higher priority
        if (pickMask & PICK_HANDLES) {
            const float rx = std::abs(p->rx * p->sx);
            const float ry = std::abs(p->ry * p->sy);
            const float minX = p->cx - rx;
            const float maxX = p->cx + rx;
            const float minY = p->cy - ry;
            const float maxY = p->cy + ry;
            if (tryPickResizeHandleAabb(x, y, tol, minX, minY, maxX, maxY, bestDist, outCandidate)) {
                outCandidate.distance = bestDist;
                return true;
            }
            // Rotation Handles (outside corners) - Lower priority
            if (tryPickRotateHandleAabb(x, y, tol, viewScale, minX, minY, maxX, maxY, bestDist, outCandidate)) {
                outCandidate.distance = bestDist;
                return true;
            }
        }

        // Treat like circle for bounds, but check edges for regular polygon math?
        // Too complex for blind coding. Fallback to Circle-ish logic or simple radius.
        float dist = std::sqrt(distSq(x, y, p->cx, p->cy));
        float maxR = std::max(p->rx, p->ry);
        if (dist <= maxR + tol) {
             if (pickMask & PICK_BODY) {
                 if (entities.resolveFillEnabled(id)) {
                    bestDist = dist;
                    outCandidate.subTarget = PickSubTarget::Body;
                    hit = true;
                 }
             }
        }
    }
    // 7. ARROW
    else if (const ArrowRec* a = entities.getArrow(id)) {
        outCandidate.kind = PickEntityKind::Arrow;
        // Shaft
        float dSeg = std::sqrt(distToSegmentSq(x, y, a->ax, a->ay, a->bx, a->by));

        // Vertices
        if (pickMask & PICK_VERTEX) {
            float d0 = std::sqrt(distSq(x, y, a->ax, a->ay));
            float d1 = std::sqrt(distSq(x, y, a->bx, a->by));
             if (d0 <= tol || d1 <= tol) {
                if (d0 < d1) {
                    bestDist = d0;
                    outCandidate.subIndex = 0;
                } else {
                    bestDist = d1;
                    outCandidate.subIndex = 1;
                }
                outCandidate.subTarget = PickSubTarget::Vertex;
                hit = true;
            }
        }

        if (!hit && (pickMask & PICK_EDGE)) {
            if (dSeg <= tol + 2.0f) { // Arrow shaft is thick usually
                bestDist = dSeg;
                outCandidate.subTarget = PickSubTarget::Edge;
                hit = true;
            }
        }
    }

    outCandidate.distance = bestDist;
    return hit;
}

PickResult PickSystem::pickEx(
    float x, float y,
    float tolerance,
    float viewScale,
    std::uint32_t pickMask,
    const EntityManager& entities,
    const TextSystem& textSystem
) {
    lastStats_.candidatesChecked = 0;
    lastStats_.indexCellsQueried = 0;

    // 1. Broad Phase
    AABB queryBounds = { x - tolerance, y - tolerance, x + tolerance, y + tolerance };
    std::vector<std::uint32_t> candidates;
    index_.query(queryBounds, candidates);
    lastStats_.indexCellsQueried = 1; // Simplified stats

    if (candidates.empty()) {
        return { 0, (uint16_t)PickEntityKind::Unknown, (uint8_t)PickSubTarget::None, -1, std::numeric_limits<float>::infinity() };
    }

    // Sort/Unique candidates
    std::sort(candidates.begin(), candidates.end());
    candidates.erase(std::unique(candidates.begin(), candidates.end()), candidates.end());

    // 2. Narrow Phase
    PickCandidate best = {};
    best.distance = std::numeric_limits<float>::max();
    best.subTarget = PickSubTarget::None;
    bool found = false;

    for (std::uint32_t id : candidates) {
        lastStats_.candidatesChecked++;

        PickCandidate current;
        if (checkCandidate(id, x, y, tolerance, viewScale, pickMask, entities, textSystem, current)) {
            if (!found || current < best) {
                best = current;
                found = true;
            }
        }
    }

    if (found) {
        return {
            best.id,
            static_cast<uint16_t>(best.kind),
            static_cast<uint8_t>(best.subTarget),
            best.subIndex,
            best.distance,
            x, y // Hit point approximation
        };
    }

    return { 0, (uint16_t)PickEntityKind::Unknown, (uint8_t)PickSubTarget::None, -1, std::numeric_limits<float>::infinity() };
}

void PickSystem::queryArea(const AABB& area, std::vector<std::uint32_t>& outResults) const {
    lastStats_.candidatesChecked = 0;
    lastStats_.indexCellsQueried = 0;

    std::vector<std::uint32_t> candidates;
    index_.query(area, candidates);
    if (candidates.empty()) return;

    lastStats_.indexCellsQueried = 1;
    lastStats_.candidatesChecked = static_cast<std::uint32_t>(candidates.size());

    std::sort(candidates.begin(), candidates.end());
    candidates.erase(std::unique(candidates.begin(), candidates.end()), candidates.end());

    std::sort(candidates.begin(), candidates.end(), [&](std::uint32_t a, std::uint32_t b) {
        const auto ita = zIndexMap_.find(a);
        const auto itb = zIndexMap_.find(b);
        const std::uint32_t za = ita != zIndexMap_.end() ? ita->second : 0;
        const std::uint32_t zb = itb != zIndexMap_.end() ? itb->second : 0;
        if (za != zb) return za > zb;
        return a < b;
    });

    outResults.insert(outResults.end(), candidates.begin(), candidates.end());
}
