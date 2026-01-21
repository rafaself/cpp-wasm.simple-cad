// engine_query.cpp - Query operations for CadEngine
// This file provides queryArea, queryMarquee, and getEntityAabb implementations.
// Separated from main engine.cpp to reduce file size per SRP guidelines.

#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include <cmath>
#include <limits>

namespace {
    constexpr float kPi = 3.14159265358979323846f;
    constexpr float kTwoPi = 2.0f * kPi;
    constexpr float kRadToDeg = 180.0f / kPi;
    constexpr float kDegToRad = kPi / 180.0f;

    // Normalize angle to -180..180 degrees
    inline float normalizeAngleDeg(float deg) {
        while (deg > 180.0f) deg -= 360.0f;
        while (deg < -180.0f) deg += 360.0f;
        return deg;
    }

    inline bool aabbIntersects(const AABB& a, const AABB& b) {
        if (a.maxX < b.minX) return false;
        if (a.minX > b.maxX) return false;
        if (a.maxY < b.minY) return false;
        if (a.minY > b.maxY) return false;
        return true;
    }

    inline bool aabbInside(const AABB& a, const AABB& container) {
        return a.minX >= container.minX && a.maxX <= container.maxX && a.minY >= container.minY && a.maxY <= container.maxY;
    }

    inline bool segmentIntersectsAabb(float x0, float y0, float x1, float y1, const AABB& r) {
        // Liang–Barsky line clipping for AABB intersection.
        float t0 = 0.0f;
        float t1 = 1.0f;
        const float dx = x1 - x0;
        const float dy = y1 - y0;

        auto clip = [&](float p, float q) -> bool {
            if (p == 0.0f) return q >= 0.0f;
            const float t = q / p;
            if (p < 0.0f) {
                if (t > t1) return false;
                if (t > t0) t0 = t;
            } else {
                if (t < t0) return false;
                if (t < t1) t1 = t;
            }
            return true;
        };

        if (!clip(-dx, x0 - r.minX)) return false;
        if (!clip( dx, r.maxX - x0)) return false;
        if (!clip(-dy, y0 - r.minY)) return false;
        if (!clip( dy, r.maxY - y0)) return false;
        return t0 <= t1;
    }

    inline AABB rectAabbExact(const RectRec& r) {
        return { r.x, r.y, r.x + r.w, r.y + r.h };
    }

    inline AABB ellipseAabbTight(const CircleRec& c) {
        const float rx = std::abs(c.rx * c.sx);
        const float ry = std::abs(c.ry * c.sy);
        const float rot = c.rot;
        const float cosR = rot ? std::cos(rot) : 1.0f;
        const float sinR = rot ? std::sin(rot) : 0.0f;
        const float ex = std::sqrt(rx * rx * cosR * cosR + ry * ry * sinR * sinR);
        const float ey = std::sqrt(rx * rx * sinR * sinR + ry * ry * cosR * cosR);
        return { c.cx - ex, c.cy - ey, c.cx + ex, c.cy + ey };
    }

    inline AABB polygonAabbTight(const PolygonRec& p) {
        const std::uint32_t sides = std::min<std::uint32_t>(1024u, std::max<std::uint32_t>(3u, p.sides));
        const float rot = p.rot;
        const float cosR = rot ? std::cos(rot) : 1.0f;
        const float sinR = rot ? std::sin(rot) : 0.0f;

        float minX = std::numeric_limits<float>::infinity();
        float minY = std::numeric_limits<float>::infinity();
        float maxX = -std::numeric_limits<float>::infinity();
        float maxY = -std::numeric_limits<float>::infinity();

        for (std::uint32_t i = 0; i < sides; i++) {
            const float t = (static_cast<float>(i) / static_cast<float>(sides)) * kTwoPi - kPi * 0.5f;
            const float dx = std::cos(t) * p.rx * p.sx;
            const float dy = std::sin(t) * p.ry * p.sy;
            const float x = p.cx + dx * cosR - dy * sinR;
            const float y = p.cy + dx * sinR + dy * cosR;
            minX = std::min(minX, x);
            minY = std::min(minY, y);
            maxX = std::max(maxX, x);
            maxY = std::max(maxY, y);
        }

        if (!std::isfinite(minX) || !std::isfinite(minY) || !std::isfinite(maxX) || !std::isfinite(maxY)) {
            return { p.cx, p.cy, p.cx, p.cy };
        }
        return { minX, minY, maxX, maxY };
    }
} // namespace

std::vector<std::uint32_t> CadEngine::queryArea(float minX, float minY, float maxX, float maxY) const {
    AABB area{
        std::min(minX, maxX),
        std::min(minY, maxY),
        std::max(minX, maxX),
        std::max(minY, maxY)
    };
    std::vector<std::uint32_t> out;
    state().pickSystem_.queryArea(area, out);
    if (out.empty()) return out;

    std::vector<std::uint32_t> filtered;
    filtered.reserve(out.size());
    for (const std::uint32_t id : out) {
        if (state().entityManager_.isEntityPickable(id)) {
            filtered.push_back(id);
        }
    }
    return filtered;
}

std::vector<std::uint32_t> CadEngine::queryMarquee(float minX, float minY, float maxX, float maxY, int mode) const {
    const AABB sel{
        std::min(minX, maxX),
        std::min(minY, maxY),
        std::max(minX, maxX),
        std::max(minY, maxY),
    };

    std::vector<std::uint32_t> candidates;
    state().pickSystem_.queryArea(sel, candidates);
    if (candidates.empty()) return {};

    std::vector<std::uint32_t> out;
    out.reserve(candidates.size());

    const bool window = mode == 0;

    for (const std::uint32_t id : candidates) {
        const auto it = state().entityManager_.entities.find(id);
        if (it == state().entityManager_.entities.end()) continue;
        if (!state().entityManager_.isEntityPickable(id)) continue;

        bool hit = false;
        switch (it->second.kind) {
            case EntityKind::Rect: {
                if (it->second.index >= state().entityManager_.rects.size()) break;
                const RectRec& r = state().entityManager_.rects[it->second.index];
                const AABB aabb = rectAabbExact(r);
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            case EntityKind::Circle: {
                if (it->second.index >= state().entityManager_.circles.size()) break;
                const CircleRec& c = state().entityManager_.circles[it->second.index];
                const AABB aabb = ellipseAabbTight(c);
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            case EntityKind::Polygon: {
                if (it->second.index >= state().entityManager_.polygons.size()) break;
                const PolygonRec& p = state().entityManager_.polygons[it->second.index];
                const AABB aabb = polygonAabbTight(p);
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            case EntityKind::Line: {
                if (it->second.index >= state().entityManager_.lines.size()) break;
                const LineRec& l = state().entityManager_.lines[it->second.index];
                if (window) {
                    hit = aabbInside(PickSystem::computeLineAABB(l), sel);
                } else {
                    hit = segmentIntersectsAabb(l.x0, l.y0, l.x1, l.y1, sel);
                }
                break;
            }
            case EntityKind::Polyline: {
                if (it->second.index >= state().entityManager_.polylines.size()) break;
                const PolyRec& pl = state().entityManager_.polylines[it->second.index];
                if (pl.count < 2) break;
                const std::uint32_t start = pl.offset;
                const std::uint32_t end = pl.offset + pl.count;
                if (end > state().entityManager_.points.size()) break;

                const AABB aabb = PickSystem::computePolylineAABB(pl, state().entityManager_.points);
                if (window) {
                    hit = aabbInside(aabb, sel);
                } else {
                    // CROSSING: true if any segment intersects selection rect.
                    for (std::uint32_t i = start; i + 1 < end; i++) {
                        const Point2& p0 = state().entityManager_.points[i];
                        const Point2& p1 = state().entityManager_.points[i + 1];
                        if (segmentIntersectsAabb(p0.x, p0.y, p1.x, p1.y, sel)) {
                            hit = true;
                            break;
                        }
                    }
                }
                break;
            }
            case EntityKind::Arrow: {
                if (it->second.index >= state().entityManager_.arrows.size()) break;
                const ArrowRec& a = state().entityManager_.arrows[it->second.index];
                if (window) {
                    hit = aabbInside(PickSystem::computeArrowAABB(a), sel);
                } else {
                    hit = segmentIntersectsAabb(a.ax, a.ay, a.bx, a.by, sel);
                }
                break;
            }
            case EntityKind::Text: {
                const TextRec* tr = state().textSystem_.store.getText(id);
                if (!tr) break;
                const AABB aabb{ tr->minX, tr->minY, tr->maxX, tr->maxY };
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            default:
                break;
        }

        if (hit) out.push_back(id);
    }

    return out;
}

engine::protocol::EntityAabb CadEngine::getEntityAabb(std::uint32_t entityId) const {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return engine::protocol::EntityAabb{0, 0, 0, 0, 0};

    switch (it->second.kind) {
        case EntityKind::Rect: {
            if (it->second.index >= state().entityManager_.rects.size()) break;
            const RectRec& r = state().entityManager_.rects[it->second.index];
            // Use actual rect bounds, not the conservative PickSystem AABB
            return engine::protocol::EntityAabb{r.x, r.y, r.x + r.w, r.y + r.h, 1};
        }
        case EntityKind::Circle: {
            if (it->second.index >= state().entityManager_.circles.size()) break;
            const CircleRec& c = state().entityManager_.circles[it->second.index];
            // Return unrotated bounds (consistent with Rect)
            // Frontend applies rotation transform for OBB display
            const float rx = std::abs(c.rx * c.sx);
            const float ry = std::abs(c.ry * c.sy);
            return engine::protocol::EntityAabb{c.cx - rx, c.cy - ry, c.cx + rx, c.cy + ry, 1};
        }
        case EntityKind::Polygon: {
            if (it->second.index >= state().entityManager_.polygons.size()) break;
            const PolygonRec& p = state().entityManager_.polygons[it->second.index];
            const AABB aabb = PickSystem::computePolygonAABB(p);
            return engine::protocol::EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Line: {
            if (it->second.index >= state().entityManager_.lines.size()) break;
            const LineRec& l = state().entityManager_.lines[it->second.index];
            const AABB aabb = PickSystem::computeLineAABB(l);
            return engine::protocol::EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Polyline: {
            if (it->second.index >= state().entityManager_.polylines.size()) break;
            const PolyRec& pl = state().entityManager_.polylines[it->second.index];
            if (pl.count < 2) break;
            const AABB aabb = PickSystem::computePolylineAABB(pl, state().entityManager_.points);
            return engine::protocol::EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Arrow: {
            if (it->second.index >= state().entityManager_.arrows.size()) break;
            const ArrowRec& a = state().entityManager_.arrows[it->second.index];
            const AABB aabb = PickSystem::computeArrowAABB(a);
            return engine::protocol::EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Text: {
            float minX = 0.0f, minY = 0.0f, maxX = 0.0f, maxY = 0.0f;
            if (state().textSystem_.getBounds(entityId, minX, minY, maxX, maxY)) {
                return engine::protocol::EntityAabb{minX, minY, maxX, maxY, 1};
            }
            return engine::protocol::EntityAabb{0, 0, 0, 0, 0};
        }
        default:
            break;
    }

    return engine::protocol::EntityAabb{0, 0, 0, 0, 0};
}

engine::protocol::EntityAabb CadEngine::getSelectionBounds() const {
    const auto& ids = state().selectionManager_.getOrdered();
    if (ids.empty()) return engine::protocol::EntityAabb{0, 0, 0, 0, 0};

    bool has = false;
    float minX = 0.0f;
    float minY = 0.0f;
    float maxX = 0.0f;
    float maxY = 0.0f;

    for (const std::uint32_t id : ids) {
        const engine::protocol::EntityAabb aabb = getEntityAabb(id);
        if (!aabb.valid) continue;
        if (!has) {
            minX = aabb.minX;
            minY = aabb.minY;
            maxX = aabb.maxX;
            maxY = aabb.maxY;
            has = true;
            continue;
        }
        minX = std::min(minX, aabb.minX);
        minY = std::min(minY, aabb.minY);
        maxX = std::max(maxX, aabb.maxX);
        maxY = std::max(maxY, aabb.maxY);
    }

    if (!has) return engine::protocol::EntityAabb{0, 0, 0, 0, 0};
    return engine::protocol::EntityAabb{minX, minY, maxX, maxY, 1};
}

engine::protocol::EntityTransform CadEngine::getEntityTransform(std::uint32_t entityId) const {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) {
        return engine::protocol::EntityTransform{0, 0, 0, 0, 0, 0, 0};
    }

    // Get AABB for center position calculation
    const engine::protocol::EntityAabb aabb = getEntityAabb(entityId);
    if (!aabb.valid) {
        return engine::protocol::EntityTransform{0, 0, 0, 0, 0, 0, 0};
    }

    // Calculate center of AABB
    const float centerX = (aabb.minX + aabb.maxX) * 0.5f;
    const float centerY = (aabb.minY + aabb.maxY) * 0.5f;

    switch (it->second.kind) {
        case EntityKind::Rect: {
            if (it->second.index >= state().entityManager_.rects.size()) break;
            const RectRec& r = state().entityManager_.rects[it->second.index];
            // Rect supports rotation, local size = w, h
            const float rotDeg = normalizeAngleDeg(r.rot * kRadToDeg);
            return engine::protocol::EntityTransform{centerX, centerY, r.w, r.h, rotDeg, 1, 1};
        }
        case EntityKind::Circle: {
            if (it->second.index >= state().entityManager_.circles.size()) break;
            const CircleRec& c = state().entityManager_.circles[it->second.index];
            // Local size = diameter * scale (unrotated dimensions)
            const float width = std::abs(c.rx * 2.0f * c.sx);
            const float height = std::abs(c.ry * 2.0f * c.sy);
            const float rotDeg = normalizeAngleDeg(c.rot * kRadToDeg);
            return engine::protocol::EntityTransform{centerX, centerY, width, height, rotDeg, 1, 1};
        }
        case EntityKind::Polygon: {
            if (it->second.index >= state().entityManager_.polygons.size()) break;
            const PolygonRec& p = state().entityManager_.polygons[it->second.index];
            // Local size = diameter * scale (unrotated dimensions)
            const float width = std::abs(p.rx * 2.0f * p.sx);
            const float height = std::abs(p.ry * 2.0f * p.sy);
            const float rotDeg = normalizeAngleDeg(p.rot * kRadToDeg);
            return engine::protocol::EntityTransform{centerX, centerY, width, height, rotDeg, 1, 1};
        }
        case EntityKind::Line: {
            if (it->second.index >= state().entityManager_.lines.size()) break;
            const LineRec& l = state().entityManager_.lines[it->second.index];
            // For lines, return length in width field and height=0
            const float dx = l.x1 - l.x0;
            const float dy = l.y1 - l.y0;
            const float length = std::sqrt(dx * dx + dy * dy);
            return engine::protocol::EntityTransform{centerX, centerY, length, 0.0f, 0.0f, 0, 1};
        }
        case EntityKind::Polyline: {
            if (it->second.index >= state().entityManager_.polylines.size()) break;
            // Polylines don't have rotation, use AABB dimensions
            const float width = aabb.maxX - aabb.minX;
            const float height = aabb.maxY - aabb.minY;
            return engine::protocol::EntityTransform{centerX, centerY, width, height, 0.0f, 0, 1};
        }
        case EntityKind::Arrow: {
            if (it->second.index >= state().entityManager_.arrows.size()) break;
            const ArrowRec& a = state().entityManager_.arrows[it->second.index];
            // For arrows, return length in width field and height=0
            const float dx = a.bx - a.ax;
            const float dy = a.by - a.ay;
            const float length = std::sqrt(dx * dx + dy * dy);
            return engine::protocol::EntityTransform{centerX, centerY, length, 0.0f, 0.0f, 0, 1};
        }
        case EntityKind::Text: {
            const TextRec* tr = state().textSystem_.store.getText(entityId);
            if (!tr) break;
            const float width = tr->maxX - tr->minX;
            const float height = tr->maxY - tr->minY;
            const float rotDeg = normalizeAngleDeg(tr->rotation * kRadToDeg);
            return engine::protocol::EntityTransform{centerX, centerY, width, height, rotDeg, 1, 1};
        }
        default:
            break;
    }

    return engine::protocol::EntityTransform{0, 0, 0, 0, 0, 0, 0};
}

bool CadEngine::tryGetEntityGeomZ(std::uint32_t entityId, float& outZ) const {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return false;

    switch (it->second.kind) {
        case EntityKind::Rect:
            if (it->second.index >= state().entityManager_.rects.size()) return false;
            outZ = state().entityManager_.rects[it->second.index].elevationZ;
            return true;
        case EntityKind::Line:
            if (it->second.index >= state().entityManager_.lines.size()) return false;
            outZ = state().entityManager_.lines[it->second.index].elevationZ;
            return true;
        case EntityKind::Polyline:
            if (it->second.index >= state().entityManager_.polylines.size()) return false;
            outZ = state().entityManager_.polylines[it->second.index].elevationZ;
            return true;
        case EntityKind::Circle:
            if (it->second.index >= state().entityManager_.circles.size()) return false;
            outZ = state().entityManager_.circles[it->second.index].elevationZ;
            return true;
        case EntityKind::Polygon:
            if (it->second.index >= state().entityManager_.polygons.size()) return false;
            outZ = state().entityManager_.polygons[it->second.index].elevationZ;
            return true;
        case EntityKind::Arrow:
            if (it->second.index >= state().entityManager_.arrows.size()) return false;
            outZ = state().entityManager_.arrows[it->second.index].elevationZ;
            return true;
        case EntityKind::Text: {
            const TextRec* tr = state().textSystem_.store.getText(entityId);
            if (!tr) return false;
            outZ = tr->elevationZ;
            return true;
        }
        default:
            return false;
    }
}

bool CadEngine::setEntityGeomZ(std::uint32_t entityId, float z) {
    if (!std::isfinite(z)) {
        setError(EngineError::InvalidOperation);
        return false;
    }
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return false;

    const bool historyStarted = beginHistoryEntry();
    markEntityChange(entityId);
    bool updated = false;

    switch (it->second.kind) {
        case EntityKind::Rect:
            if (it->second.index >= state().entityManager_.rects.size()) break;
            state().entityManager_.rects[it->second.index].elevationZ = z;
            updated = true;
            break;
        case EntityKind::Line:
            if (it->second.index >= state().entityManager_.lines.size()) break;
            state().entityManager_.lines[it->second.index].elevationZ = z;
            updated = true;
            break;
        case EntityKind::Polyline:
            if (it->second.index >= state().entityManager_.polylines.size()) break;
            state().entityManager_.polylines[it->second.index].elevationZ = z;
            updated = true;
            break;
        case EntityKind::Circle:
            if (it->second.index >= state().entityManager_.circles.size()) break;
            state().entityManager_.circles[it->second.index].elevationZ = z;
            updated = true;
            break;
        case EntityKind::Polygon:
            if (it->second.index >= state().entityManager_.polygons.size()) break;
            state().entityManager_.polygons[it->second.index].elevationZ = z;
            updated = true;
            break;
        case EntityKind::Arrow:
            if (it->second.index >= state().entityManager_.arrows.size()) break;
            state().entityManager_.arrows[it->second.index].elevationZ = z;
            updated = true;
            break;
        case EntityKind::Text: {
            TextRec* tr = state().textSystem_.store.getTextMutable(entityId);
            if (!tr) break;
            tr->elevationZ = z;
            updated = true;
            break;
        }
        default:
            break;
    }

    if (!updated) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }

    state().snapshotDirty = true;
    recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry));
    if (historyStarted) commitHistoryEntry();
    state().generation++;
    return true;
}

void CadEngine::setEntityPosition(std::uint32_t entityId, float x, float y) {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return;

    // Get current AABB center
    const engine::protocol::EntityAabb aabb = getEntityAabb(entityId);
    if (!aabb.valid) return;

    const float currentCenterX = (aabb.minX + aabb.maxX) * 0.5f;
    const float currentCenterY = (aabb.minY + aabb.maxY) * 0.5f;
    const float deltaX = x - currentCenterX;
    const float deltaY = y - currentCenterY;

    // Begin history entry for undo
    beginHistoryEntry();

    switch (it->second.kind) {
        case EntityKind::Rect: {
            if (it->second.index >= state().entityManager_.rects.size()) break;
            RectRec& r = state().entityManager_.rects[it->second.index];
            r.x += deltaX;
            r.y += deltaY;
            state().pickSystem_.update(entityId, PickSystem::computeRectAABB(r));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Circle: {
            if (it->second.index >= state().entityManager_.circles.size()) break;
            CircleRec& c = state().entityManager_.circles[it->second.index];
            c.cx += deltaX;
            c.cy += deltaY;
            state().pickSystem_.update(entityId, PickSystem::computeCircleAABB(c));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Polygon: {
            if (it->second.index >= state().entityManager_.polygons.size()) break;
            PolygonRec& p = state().entityManager_.polygons[it->second.index];
            p.cx += deltaX;
            p.cy += deltaY;
            state().pickSystem_.update(entityId, PickSystem::computePolygonAABB(p));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Line: {
            if (it->second.index >= state().entityManager_.lines.size()) break;
            LineRec& l = state().entityManager_.lines[it->second.index];
            l.x0 += deltaX;
            l.y0 += deltaY;
            l.x1 += deltaX;
            l.y1 += deltaY;
            state().pickSystem_.update(entityId, PickSystem::computeLineAABB(l));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Polyline: {
            if (it->second.index >= state().entityManager_.polylines.size()) break;
            PolyRec& pl = state().entityManager_.polylines[it->second.index];
            if (pl.count < 1) break;
            const std::uint32_t start = pl.offset;
            const std::uint32_t end = std::min(start + pl.count, static_cast<std::uint32_t>(state().entityManager_.points.size()));
            for (std::uint32_t i = start; i < end; ++i) {
                state().entityManager_.points[i].x += deltaX;
                state().entityManager_.points[i].y += deltaY;
            }
            state().pickSystem_.update(entityId, PickSystem::computePolylineAABB(pl, state().entityManager_.points));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Arrow: {
            if (it->second.index >= state().entityManager_.arrows.size()) break;
            ArrowRec& a = state().entityManager_.arrows[it->second.index];
            a.ax += deltaX;
            a.ay += deltaY;
            a.bx += deltaX;
            a.by += deltaY;
            state().pickSystem_.update(entityId, PickSystem::computeArrowAABB(a));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Text: {
            TextRec* tr = state().textSystem_.store.getTextMutable(entityId);
            if (!tr) break;
            tr->x += deltaX;
            tr->y += deltaY;
            tr->minX += deltaX;
            tr->minY += deltaY;
            tr->maxX += deltaX;
            tr->maxY += deltaY;
            state().pickSystem_.update(entityId, {tr->minX, tr->minY, tr->maxX, tr->maxY});
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        default:
            discardHistoryEntry();
            return;
    }

    commitHistoryEntry();
    state().generation++;
    rebuildRenderBuffers();
}

void CadEngine::setEntitySize(std::uint32_t entityId, float width, float height) {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return;

    // Clamp minimum size
    const float minSize = 1.0f;
    width = std::max(width, minSize);
    height = std::max(height, minSize);

    // Begin history entry for undo
    beginHistoryEntry();

    switch (it->second.kind) {
        case EntityKind::Rect: {
            if (it->second.index >= state().entityManager_.rects.size()) break;
            RectRec& r = state().entityManager_.rects[it->second.index];
            // Calculate center before resize
            const float centerX = r.x + r.w * 0.5f;
            const float centerY = r.y + r.h * 0.5f;
            // Update size, keeping center fixed
            r.w = width;
            r.h = height;
            r.x = centerX - width * 0.5f;
            r.y = centerY - height * 0.5f;
            state().pickSystem_.update(entityId, PickSystem::computeRectAABB(r));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Circle: {
            if (it->second.index >= state().entityManager_.circles.size()) break;
            CircleRec& c = state().entityManager_.circles[it->second.index];
            // Adjust base radii to match new width/height, keeping scale factors
            if (std::abs(c.sx) > 1e-6f) c.rx = width / (2.0f * std::abs(c.sx));
            if (std::abs(c.sy) > 1e-6f) c.ry = height / (2.0f * std::abs(c.sy));
            state().pickSystem_.update(entityId, PickSystem::computeCircleAABB(c));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Polygon: {
            if (it->second.index >= state().entityManager_.polygons.size()) break;
            PolygonRec& p = state().entityManager_.polygons[it->second.index];
            // Adjust base radii to match new width/height, keeping scale factors
            if (std::abs(p.sx) > 1e-6f) p.rx = width / (2.0f * std::abs(p.sx));
            if (std::abs(p.sy) > 1e-6f) p.ry = height / (2.0f * std::abs(p.sy));
            state().pickSystem_.update(entityId, PickSystem::computePolygonAABB(p));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        // Line, Polyline, Arrow, Text: resizing not supported via this API
        // They would require complex point recalculation
        default:
            discardHistoryEntry();
            return;
    }

    commitHistoryEntry();
    state().generation++;
    rebuildRenderBuffers();
}

void CadEngine::setEntityRotation(std::uint32_t entityId, float rotationDeg) {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return;

    // Normalize rotation to -180..180
    rotationDeg = normalizeAngleDeg(rotationDeg);
    const float rotationRad = rotationDeg * kDegToRad;

    // Begin history entry for undo
    beginHistoryEntry();

    switch (it->second.kind) {
        case EntityKind::Rect: {
            if (it->second.index >= state().entityManager_.rects.size()) break;
            RectRec& r = state().entityManager_.rects[it->second.index];
            r.rot = rotationRad;
            state().pickSystem_.update(entityId, PickSystem::computeRectAABB(r));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Circle: {
            if (it->second.index >= state().entityManager_.circles.size()) break;
            CircleRec& c = state().entityManager_.circles[it->second.index];
            c.rot = rotationRad;
            state().pickSystem_.update(entityId, PickSystem::computeCircleAABB(c));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Polygon: {
            if (it->second.index >= state().entityManager_.polygons.size()) break;
            PolygonRec& p = state().entityManager_.polygons[it->second.index];
            p.rot = rotationRad;
            state().pickSystem_.update(entityId, PickSystem::computePolygonAABB(p));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Text: {
            TextRec* tr = state().textSystem_.store.getTextMutable(entityId);
            if (!tr) break;
            tr->rotation = rotationRad;
            // Note: Text bounds don't change with rotation in current implementation
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        // Line, Polyline, Arrow: rotation not supported
        default:
            discardHistoryEntry();
            return;
    }

    commitHistoryEntry();
    state().generation++;
    rebuildRenderBuffers();
}

void CadEngine::setEntityLength(std::uint32_t entityId, float length) {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return;

    // Clamp minimum length
    const float minLength = 1.0f;
    length = std::max(length, minLength);

    // Begin history entry for undo
    beginHistoryEntry();

    switch (it->second.kind) {
        case EntityKind::Line: {
            if (it->second.index >= state().entityManager_.lines.size()) break;
            LineRec& l = state().entityManager_.lines[it->second.index];

            // Calculate current center and angle
            const float centerX = (l.x0 + l.x1) * 0.5f;
            const float centerY = (l.y0 + l.y1) * 0.5f;
            const float dx = l.x1 - l.x0;
            const float dy = l.y1 - l.y0;
            const float angle = std::atan2(dy, dx);

            // Calculate new endpoints with new length, keeping center and angle
            const float halfLength = length * 0.5f;
            l.x0 = centerX - halfLength * std::cos(angle);
            l.y0 = centerY - halfLength * std::sin(angle);
            l.x1 = centerX + halfLength * std::cos(angle);
            l.y1 = centerY + halfLength * std::sin(angle);

            state().pickSystem_.update(entityId, PickSystem::computeLineAABB(l));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Arrow: {
            if (it->second.index >= state().entityManager_.arrows.size()) break;
            ArrowRec& a = state().entityManager_.arrows[it->second.index];

            // Calculate current center and angle
            const float centerX = (a.ax + a.bx) * 0.5f;
            const float centerY = (a.ay + a.by) * 0.5f;
            const float dx = a.bx - a.ax;
            const float dy = a.by - a.ay;
            const float angle = std::atan2(dy, dx);

            // Calculate new endpoints with new length, keeping center and angle
            const float halfLength = length * 0.5f;
            a.ax = centerX - halfLength * std::cos(angle);
            a.ay = centerY - halfLength * std::sin(angle);
            a.bx = centerX + halfLength * std::cos(angle);
            a.by = centerY + halfLength * std::sin(angle);

            state().pickSystem_.update(entityId, PickSystem::computeArrowAABB(a));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        // Other entity types don't support length
        default:
            discardHistoryEntry();
            return;
    }

    commitHistoryEntry();
    state().generation++;
    rebuildRenderBuffers();
}

void CadEngine::setEntityScale(std::uint32_t entityId, float scaleX, float scaleY) {
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) return;

    // Begin history entry for undo
    beginHistoryEntry();

    switch (it->second.kind) {
        case EntityKind::Rect: {
            if (it->second.index >= state().entityManager_.rects.size()) break;
            RectRec& r = state().entityManager_.rects[it->second.index];
            r.sx = scaleX;
            r.sy = scaleY;
            state().pickSystem_.update(entityId, PickSystem::computeRectAABB(r));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Circle: {
            if (it->second.index >= state().entityManager_.circles.size()) break;
            CircleRec& c = state().entityManager_.circles[it->second.index];
            c.sx = scaleX;
            c.sy = scaleY;
            state().pickSystem_.update(entityId, PickSystem::computeCircleAABB(c));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        case EntityKind::Polygon: {
            if (it->second.index >= state().entityManager_.polygons.size()) break;
            PolygonRec& p = state().entityManager_.polygons[it->second.index];
            p.sx = scaleX;
            p.sy = scaleY;
            state().pickSystem_.update(entityId, PickSystem::computePolygonAABB(p));
            recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
            break;
        }
        // Line, Polyline, Arrow, Text: scaling not supported
        default:
            discardHistoryEntry();
            return;
    }

    commitHistoryEntry();
    state().generation++;
    rebuildRenderBuffers();
}
