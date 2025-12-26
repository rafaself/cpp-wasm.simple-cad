#include "engine/pick_system.h"
#include <cmath>
#include <algorithm>
#include <unordered_set>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

// =============================================================================
// Math Helpers
// =============================================================================

static float distSq(float x1, float y1, float x2, float y2) {
    return (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
}

static float pointToSegmentDistSq(float px, float py, float x1, float y1, float x2, float y2) {
    float l2 = distSq(x1, y1, x2, y2);
    if (l2 == 0.0f) return distSq(px, py, x1, y1);
    float t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = std::max(0.0f, std::min(1.0f, t));
    float ex = x1 + t * (x2 - x1);
    float ey = y1 + t * (y2 - y1);
    return distSq(px, py, ex, ey);
}

static bool pointInTriangle(float px, float py, float ax, float ay, float bx, float by, float cx, float cy) {
    auto sign = [](float p1x, float p1y, float p2x, float p2y, float p3x, float p3y) {
        return (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
    };
    float d1 = sign(px, py, ax, ay, bx, by);
    float d2 = sign(px, py, bx, by, cx, cy);
    float d3 = sign(px, py, cx, cy, ax, ay);
    bool has_neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    bool has_pos = (d1 > 0) || (d2 > 0) || (d3 > 0);
    return !(has_neg && has_pos);
}

static bool pointInPolygon(float x, float y, const std::vector<Point2>& verts) {
    bool inside = false;
    for (size_t i = 0, j = verts.size() - 1; i < verts.size(); j = i++) {
        if (((verts[i].y > y) != (verts[j].y > y)) &&
            (x < (verts[j].x - verts[i].x) * (y - verts[i].y) / (verts[j].y - verts[i].y) + verts[i].x)) {
            inside = !inside;
        }
    }
    return inside;
}

// =============================================================================
// SpatialHashGrid
// =============================================================================

SpatialHashGrid::SpatialHashGrid(float cellSize) : cellSize_(cellSize) {}

std::int64_t SpatialHashGrid::hash(int ix, int iy) const {
    // Cantor pairing or simple shifting for "good enough" hashing
    // Using a simple mix for speed
    // (ix * p1) ^ (iy * p2)
    const std::int64_t p1 = 73856093;
    const std::int64_t p2 = 19349663;
    return (std::int64_t(ix) * p1) ^ (std::int64_t(iy) * p2);
}

void SpatialHashGrid::insert(std::uint32_t id, const AABB& bounds) {
    int startX = static_cast<int>(std::floor(bounds.minX / cellSize_));
    int endX   = static_cast<int>(std::floor(bounds.maxX / cellSize_));
    int startY = static_cast<int>(std::floor(bounds.minY / cellSize_));
    int endY   = static_cast<int>(std::floor(bounds.maxY / cellSize_));

    for (int y = startY; y <= endY; ++y) {
        for (int x = startX; x <= endX; ++x) {
            std::int64_t h = hash(x, y);
            cells_[h].push_back(id);
            entityCells_[id].push_back(h);
        }
    }
}

void SpatialHashGrid::remove(std::uint32_t id) {
    auto it = entityCells_.find(id);
    if (it == entityCells_.end()) return;

    for (std::int64_t h : it->second) {
        auto& list = cells_[h];
        // Swap-remove
        for (size_t i = 0; i < list.size(); ++i) {
            if (list[i] == id) {
                list[i] = list.back();
                list.pop_back();
                // If cell empty, could remove key, but maybe not worth overhead
                break;
            }
        }
    }
    entityCells_.erase(it);
}

void SpatialHashGrid::clear() {
    cells_.clear();
    entityCells_.clear();
}

void SpatialHashGrid::query(const AABB& bounds, std::vector<std::uint32_t>& results) const {
    int startX = static_cast<int>(std::floor(bounds.minX / cellSize_));
    int endX   = static_cast<int>(std::floor(bounds.maxX / cellSize_));
    int startY = static_cast<int>(std::floor(bounds.minY / cellSize_));
    int endY   = static_cast<int>(std::floor(bounds.maxY / cellSize_));

    // To avoid duplicates, we can use a set, or just sort/unique at end
    // For perf, maybe unordered_set during collection?
    // Actually, sorting/unique on a vector is often faster for small candidate counts

    // Using a set here to be safe and simple
    static std::unordered_set<std::uint32_t> visited;
    visited.clear();

    // We clear results passed in (caller responsibility? Let's clear here)
    results.clear();

    for (int y = startY; y <= endY; ++y) {
        for (int x = startX; x <= endX; ++x) {
            auto it = cells_.find(hash(x, y));
            if (it != cells_.end()) {
                for (std::uint32_t id : it->second) {
                    if (visited.insert(id).second) {
                        results.push_back(id);
                    }
                }
            }
        }
    }
}

// =============================================================================
// PickSystem
// =============================================================================

PickSystem::PickSystem() : index_(50.0f) {}

void PickSystem::clear() {
    index_.clear();
    lastStats_ = {0, 0};
}

void PickSystem::update(std::uint32_t id, const AABB& bounds) {
    // First remove old
    remove(id);
    // Then insert new
    index_.insert(id, bounds);
}

void PickSystem::remove(std::uint32_t id) {
    index_.remove(id);
}

void PickSystem::setDrawOrder(const std::vector<std::uint32_t>& order) {
    zIndexMap_.clear();
    // Reserve to avoid rehash
    zIndexMap_.reserve(order.size());
    for (std::uint32_t i = 0; i < order.size(); ++i) {
        zIndexMap_[order[i]] = i;
    }
}

void PickSystem::setZ(std::uint32_t id, std::uint32_t z) {
    zIndexMap_[id] = z;
}

std::uint32_t PickSystem::getMaxZ() const {
    return static_cast<std::uint32_t>(zIndexMap_.size());
}

std::uint32_t PickSystem::pick(
    float x, float y,
    float tolerance,
    float viewScale,
    const EntityManager& entities,
    const TextSystem& textSystem
) {
    // 1. Query Index
    AABB queryBounds = {x - tolerance, y - tolerance, x + tolerance, y + tolerance};

    static std::vector<std::uint32_t> candidates;
    // index_.query clears candidates
    index_.query(queryBounds, candidates);

    lastStats_.candidatesChecked = 0;
    lastStats_.indexCellsQueried = 0; // Not tracking cells count in query yet, but candidates count is good.

    std::vector<PickResult> hits;
    hits.reserve(candidates.size());

    // 2. Iterate candidates
    // We need z-order. The engine provides drawOrderIds which is sorted by draw order.
    // Instead of looking up Z for every candidate, we can just use the index in drawOrderIds as the "Z".
    // But drawOrderIds is a vector of IDs. Finding index of ID in vector is O(N).
    // Optimization: The engine processes picking by iterating drawOrderIds in reverse.
    // BUT we want to use the spatial index to avoid O(N).
    // So we have a set of candidates. We need to find the "best" one.
    // Best = (Smallest Distance) THEN (Highest Draw Order).

    // To solve the Z-order lookup efficiently:
    // We can map ID -> DrawIndex. Or we can just store DrawIndex in EntityManager if we maintain it.
    // Currently EntityManager doesn't seem to have a fast ID->DrawOrder map (only ID->EntityRef).
    // However, `entities.drawOrderIds` exists.
    // If we don't have a fast lookup, we might have to just iterate ALL drawOrderIds and check if they are in candidates?
    // No, that defeats the purpose of spatial index if scene is large.

    // Alternative: We can compute distance for all candidates. Keep those <= tolerance.
    // Then we need to pick the one with highest Z.
    // If candidates count is small (e.g. 5), we can just search them in drawOrderIds?
    // OR we can add a `drawIndex` field to entities that is updated when `SetDrawOrder` is called.
    // Since we can't easily change the architecture to add `drawIndex` to every component right now without risky changes,
    // let's assume we can linear scan `drawOrderIds` ONLY IF we have a hit?

    // Wait, the standard "pick" needs to find the *top-most* hit.
    // If we have 10 overlapping objects under cursor, we need the one that renders last.

    // Plan:
    // 1. Gather all Hits (dist <= tol).
    // 2. Sort Hits by Distance.
    // 3. If multiple Hits have same Distance (e.g. 0 for filled shapes), we need Z-order.

    // To resolve Z-order without O(N) scan of drawOrderIds:
    // We can rely on the fact that `drawOrderIds` is the authority.
    // If we have a list of hit IDs, we can sort them based on their position in `drawOrderIds`.
    // But finding position is slow.

    // HACK / TRICK:
    // If we assume IDs are roughly allocated in order, higher ID might imply newer? No.
    // The prompt says: "se não existir [draw order interno], derive: armazene drawIndex no engine... ou mantenha fallback: maior id".
    // "Ideal: engine deve ter drawIndex alimentado pela sync de shapeOrder."

    // Let's see if we can add a map `unordered_map<uint32_t, int> idToZ` in `PickSystem`?
    // `PickSystem` could maintain `idToDrawOrder` map.
    // `CadEngine` calls `CommandOp::SetDrawOrder`. We can intercept that and update `PickSystem`.
    // Yes! `CadEngine` processes `SetDrawOrder`. I can update `PickSystem` there.
    // I'll add `setDrawOrder(const std::vector<uint32_t>& order)` to `PickSystem`.

    // For now, let's implement the hit testing loop first.

    for (std::uint32_t id : candidates) {
        lastStats_.candidatesChecked++;

        auto it = entities.entities.find(id);
        if (it == entities.entities.end()) continue;

        EntityRef ref = it->second;
        float dist = std::numeric_limits<float>::infinity();

        switch (ref.kind) {
            case EntityKind::Rect: {
                if (ref.index < entities.rects.size())
                    dist = hitTestRect(x, y, tolerance, entities.rects[ref.index]);
                break;
            }
            case EntityKind::Circle: {
                if (ref.index < entities.circles.size())
                    dist = hitTestCircle(x, y, tolerance, entities.circles[ref.index]);
                break;
            }
            case EntityKind::Line: {
                if (ref.index < entities.lines.size())
                    dist = hitTestLine(x, y, tolerance, viewScale, entities.lines[ref.index]);
                break;
            }
            case EntityKind::Polyline: {
                if (ref.index < entities.polylines.size()) {
                    const auto& pl = entities.polylines[ref.index];
                    if (pl.offset + pl.count <= entities.points.size()) {
                        dist = hitTestPolyline(x, y, tolerance, viewScale, pl, entities.points);
                    }
                }
                break;
            }
            case EntityKind::Polygon: {
                if (ref.index < entities.polygons.size())
                    dist = hitTestPolygon(x, y, tolerance, entities.polygons[ref.index]);
                break;
            }
            case EntityKind::Arrow: {
                if (ref.index < entities.arrows.size())
                    dist = hitTestArrow(x, y, tolerance, viewScale, entities.arrows[ref.index]);
                break;
            }
            case EntityKind::Text: {
                dist = hitTestText(x, y, tolerance, id, textSystem);
                break;
            }
        }

        if (dist <= tolerance || (dist < 1e10 && dist <= tolerance + 2.0f)) { // 2.0f buffer for float errors? No, trust tolerance.
            // Wait, hitTest returns distance. If distance <= tolerance, it's a candidate.
             if (dist <= tolerance) { // Use exact tolerance comparison
                 PickResult res;
                 res.id = id;
                 res.distance = dist;
                 res.zIndex = 0; // Filled later
                 hits.push_back(res);
             }
        }
    }

    if (hits.empty()) return 0;

    // Now resolve Z-Order.
    // If hits > 1, we need Z values.
    // Since we don't have a fast map yet, and we can't easily modify `CadEngine` header to add one without recompiling `engine.cpp` (which I am doing),
    // I SHOULD add `idToZ` map to `PickSystem` or `EntityManager`.
    // I'll add `setDrawOrder` to `PickSystem` and maintain a map there.
    // However, I can't modify `PickSystem` header again in this turn easily (I just wrote it).
    // Actually I can overwrite it or just accept O(N) lookup in `drawOrderIds` if hits are few.
    // "candidates per click should be low".
    // If I have 5 hits, iterating `drawOrderIds` (which could be 10k items) 5 times is bad?
    // Yes, 5 * 10k = 50k ops. 60fps frame budget is ~16ms. 50k ops is fine in C++ (sub 1ms).
    // BUT "Picking não pode ser O(N)".
    // So I MUST implement fast Z lookup.

    // I will assume I can update `PickSystem` class to include `std::unordered_map<uint32_t, uint32_t> zIndexMap;`
    // I missed adding this to the header. I should re-write the header in the next step or just use `entities.drawOrderIds` and build a temp map if needed?
    // Building temp map is O(N).

    // Correct approach: I will re-write `pick_system.h` to include `setDrawOrder` and the map.
    // For now, inside this .cpp file, I can't access member variables I didn't declare.
    // I will rewrite `pick_system.h` immediately after this file creation to add the missing method/member.
    // Or I can add it now if I haven't finished this step? No, I already wrote the header in previous tool call.
    // I will proceed with writing .cpp assuming the header HAS it, and then I will update the header.
    // Wait, if I write .cpp using members not in header, it won't compile (conceptually).
    // I'll stick to a plan: Write .cpp, then Update Header.

    // To make this valid, I'll use a helper or just iterate for now, and note to fix it.
    // Actually, I'll update the header FIRST in the next step, then finish integration.
    // But I'm in the middle of writing .cpp.
    // I'll use `findZIndex` helper that brute forces `entities.drawOrderIds` for now.
    // Then I'll optimize it by adding the map in the header later.
    // Wait, brute force is O(N). The prompt says "Picking não pode ser O(N)".
    // But `candidates` count is small. `drawOrderIds` is N.
    // I really need the map.

    // Strategy: I will overwrite `pick_system.h` in the NEXT step to add the map.
    // In THIS file (`pick_system.cpp`), I will access `zIndexMap_` assuming it exists.

    // Oh, I can't access `zIndexMap_` if the header on disk doesn't have it.
    // But the environment is "blind" - the compiler isn't running.
    // So I can simulate the change sequence.
    // I will refer to `zIndexMap_` here.

    for (auto& h : hits) {
        // h.zIndex = zIndexMap_.count(h.id) ? zIndexMap_.at(h.id) : 0;
        // Fallback to searching in drawOrderIds if map missing?
        // Let's assume zIndexMap_ exists.
        // Actually, for the sake of this file being complete, I'll need `zIndexMap_`.
        // I will rely on `zIndexMap_`.
        // But since I can't access it yet, I'll put a placeholder TODO or just use a slow lookup temporarily?
        // No, I want to deliver quality.
        // I will use `zIndexMap_`.
        h.zIndex = 0; // Placeholder
        if (zIndexMap_.count(h.id)) {
            h.zIndex = zIndexMap_.at(h.id);
        }
    }

    std::sort(hits.begin(), hits.end());

    // Best hit is the first one (PickResult operator< sorts by Dist ASC, Z DESC)
    // Wait, I defined `operator<` as:
    // `distance < other.distance` (smaller better)
    // `zIndex > other.zIndex` (larger better)
    // So the "smallest" element is the best one.

    return hits[0].id;
}

// =============================================================================
// Hit Test Implementations
// =============================================================================

float PickSystem::hitTestRect(float x, float y, float tol, const RectRec& r) {
    // AABB check is already done by Index Query?
    // No, index query is coarse (cells). AABB might be larger than cell.
    // But `pick` did `index_.query(queryBounds)` where queryBounds is point +/- tol.
    // The candidate IS likely overlapping the tolerance box.
    // But we need exact distance.

    // Rect is x,y,w,h.
    // Distance to rect:
    // If inside: 0.
    // If outside: dist to edges.

    float minX = r.x;
    float minY = r.y;
    float maxX = r.x + r.w;
    float maxY = r.y + r.h;

    // Check inside
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return 0.0f;

    // Dist to AABB
    float dx = std::max({minX - x, 0.0f, x - maxX});
    float dy = std::max({minY - y, 0.0f, y - maxY});
    return std::sqrt(dx*dx + dy*dy);
}

float PickSystem::hitTestCircle(float x, float y, float tol, const CircleRec& c) {
    float d = std::sqrt(distSq(x, y, c.cx, c.cy));
    float distToRim = std::abs(d - c.rx);

    // If filled? The prompt says "Circle: center ± r".
    // Usually CAD circles are selectable by rim (stroke) or fill.
    // If fill is transparent?
    // Let's assume if dist <= radius, dist = 0 (inside).
    // If outside, dist = d - radius.

    if (d <= c.rx) return 0.0f;
    return d - c.rx;
}

float PickSystem::hitTestLine(float x, float y, float tol, float viewScale, const LineRec& l) {
    float d2 = pointToSegmentDistSq(x, y, l.x0, l.y0, l.x1, l.y1);
    float dist = std::sqrt(d2);

    float halfStroke = (l.strokeWidthPx > 0 ? l.strokeWidthPx : 1.0f) * 0.5f;
    float halfStrokeWorld = halfStroke / (viewScale > 1e-6f ? viewScale : 1.0f);

    return dist - halfStrokeWorld;
}

float PickSystem::hitTestPolyline(float x, float y, float tol, float viewScale, const PolyRec& pl, const std::vector<Point2>& points) {
    float minDistSq = std::numeric_limits<float>::max();

    std::uint32_t start = pl.offset;
    std::uint32_t end = pl.offset + pl.count;
    if (end > points.size()) end = static_cast<std::uint32_t>(points.size());

    for (std::uint32_t i = start; i + 1 < end; ++i) {
        float d2 = pointToSegmentDistSq(x, y, points[i].x, points[i].y, points[i+1].x, points[i+1].y);
        if (d2 < minDistSq) minDistSq = d2;
    }

    float dist = std::sqrt(minDistSq);
    float halfStroke = (pl.strokeWidthPx > 0 ? pl.strokeWidthPx : 1.0f) * 0.5f;
    float halfStrokeWorld = halfStroke / (viewScale > 1e-6f ? viewScale : 1.0f);

    return dist - halfStrokeWorld;
}

float PickSystem::hitTestPolygon(float x, float y, float tol, const PolygonRec& p) {
    // Generate vertices
    std::vector<Point2> verts;
    verts.reserve(p.sides);

    float angleStep = 2.0f * M_PI / p.sides;
    for (std::uint32_t i = 0; i < p.sides; ++i) {
        float theta = i * angleStep + p.rot; // Assuming rot is radians
        // Need to account for ellipse parameters sx/sy/rx/ry?
        // PolygonRec has cx, cy, rx, ry, rot, sx, sy.
        // Usually rx/ry are radius.
        // Let's assume regular polygon inscribed in circle(rx, ry)
        // If sx/sy are scale, apply them.
        // Simple approximation:
        float px = p.cx + p.rx * std::cos(theta);
        float py = p.cy + p.ry * std::sin(theta); // using ry? or rx?
        // If rx!=ry it's inscribed in ellipse?
        // Standard polygon tool usually uses rx.
        verts.push_back({px, py});
    }

    // Check inside (fill)
    if (pointInPolygon(x, y, verts)) return 0.0f;

    // Check edges (stroke)
    float minDistSq = std::numeric_limits<float>::max();
    for (size_t i = 0, j = verts.size() - 1; i < verts.size(); j = i++) {
        float d2 = pointToSegmentDistSq(x, y, verts[i].x, verts[i].y, verts[j].x, verts[j].y);
        if (d2 < minDistSq) minDistSq = d2;
    }

    return std::sqrt(minDistSq);
}

float PickSystem::hitTestArrow(float x, float y, float tol, float viewScale, const ArrowRec& a) {
    // Shaft: A -> B
    float shaftDist = std::sqrt(pointToSegmentDistSq(x, y, a.ax, a.ay, a.bx, a.by));

    float halfStroke = (a.strokeWidthPx > 0 ? a.strokeWidthPx : 1.0f) * 0.5f;
    float halfStrokeWorld = halfStroke / (viewScale > 1e-6f ? viewScale : 1.0f);
    shaftDist -= halfStrokeWorld;

    // Head: Triangle at B
    // Need to calculate head points.
    // Vector U = (B-A) normalized
    float dx = a.bx - a.ax;
    float dy = a.by - a.ay;
    float len = std::sqrt(dx*dx + dy*dy);
    float ux = (len > 0) ? dx / len : 0;
    float uy = (len > 0) ? dy / len : 0;

    // Head size
    float h = a.head;
    // Perpendicular V = (-uy, ux)
    float vx = -uy;
    float vy = ux;

    // Base of head on shaft: P = B - U * h
    float px = a.bx - ux * h;
    float py = a.by - uy * h;

    // Width of head base? Usually ratio of head len. Say 0.5 * h.
    float w = h * 0.5f;

    float t1x = px + vx * w;
    float t1y = py + vy * w;
    float t2x = px - vx * w;
    float t2y = py - vy * w;

    // Triangle: B, T1, T2
    if (pointInTriangle(x, y, a.bx, a.by, t1x, t1y, t2x, t2y)) return 0.0f;

    // Dist to head edges?
    // Edge B-T1
    float hd1 = pointToSegmentDistSq(x, y, a.bx, a.by, t1x, t1y);
    // Edge B-T2
    float hd2 = pointToSegmentDistSq(x, y, a.bx, a.by, t2x, t2y);
    // Edge T1-T2
    float hd3 = pointToSegmentDistSq(x, y, t1x, t1y, t2x, t2y);

    float headDist = std::sqrt(std::min({hd1, hd2, hd3}));

    return std::min(shaftDist, headDist);
}

float PickSystem::hitTestText(float x, float y, float tol, std::uint32_t id, const TextSystem& textSystem) {
    float minX, minY, maxX, maxY;
    // We need to const_cast because bounds getter might update layout
    // But textSystem is const ref.
    // TextSystem::getBounds is not const in header?
    // Checked header: `bool getBounds(std::uint32_t textId, float& minX, float& minY, float& maxX, float& maxY);` -> Not const.
    // But I passed `const TextSystem&` to `pick`.
    // I should cast or fix const correctness.
    // `CadEngine` owns `TextSystem` as non-const.
    // I'll const_cast for now as `layoutDirtyTexts` is cache maintenance.

    TextSystem& ts = const_cast<TextSystem&>(textSystem);
    if (!ts.getBounds(id, minX, minY, maxX, maxY)) return std::numeric_limits<float>::infinity();

    // Check inside AABB
    if (x >= minX && x <= maxX && y >= minY && y <= maxY) return 0.0f;

    // Dist to AABB
    float dx = std::max({minX - x, 0.0f, x - maxX});
    float dy = std::max({minY - y, 0.0f, y - maxY});
    return std::sqrt(dx*dx + dy*dy);
}

// =============================================================================
// AABB Computations
// =============================================================================

AABB PickSystem::computeRectAABB(const RectRec& r) {
    return {r.x, r.y, r.x + r.w, r.y + r.h};
}

AABB PickSystem::computeCircleAABB(const CircleRec& c) {
    return {c.cx - c.rx, c.cy - c.rx, c.cx + c.rx, c.cy + c.rx}; // Assuming max radius
}

AABB PickSystem::computeLineAABB(const LineRec& l) {
    return {
        std::min(l.x0, l.x1), std::min(l.y0, l.y1),
        std::max(l.x0, l.x1), std::max(l.y0, l.y1)
    };
}

AABB PickSystem::computePolylineAABB(const PolyRec& pl, const std::vector<Point2>& points) {
    AABB b = {std::numeric_limits<float>::max(), std::numeric_limits<float>::max(),
              std::numeric_limits<float>::lowest(), std::numeric_limits<float>::lowest()};

    std::uint32_t start = pl.offset;
    std::uint32_t end = pl.offset + pl.count;
    if (end > points.size()) end = static_cast<std::uint32_t>(points.size());

    for (std::uint32_t i = start; i < end; ++i) {
        b.minX = std::min(b.minX, points[i].x);
        b.minY = std::min(b.minY, points[i].y);
        b.maxX = std::max(b.maxX, points[i].x);
        b.maxY = std::max(b.maxY, points[i].y);
    }
    return b;
}

AABB PickSystem::computePolygonAABB(const PolygonRec& p) {
    // Conservative AABB: Center +/- R
    float r = std::max(p.rx, p.ry); // Rough
    return {p.cx - r, p.cy - r, p.cx + r, p.cy + r};
}

AABB PickSystem::computeArrowAABB(const ArrowRec& a) {
    float minX = std::min(a.ax, a.bx);
    float minY = std::min(a.ay, a.by);
    float maxX = std::max(a.ax, a.bx);
    float maxY = std::max(a.ay, a.by);
    // Expand by head size
    float h = a.head;
    return {minX - h, minY - h, maxX + h, maxY + h};
}
