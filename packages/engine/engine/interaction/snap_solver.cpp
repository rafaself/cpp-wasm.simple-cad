#include "engine/interaction/snap_solver.h"

#include <algorithm>
#include <cmath>
#include <limits>

namespace {
    struct SnapAxisBest {
        bool snapped{false};
        float delta{0.0f};
        float guide{0.0f};
        float dist{std::numeric_limits<float>::infinity()};
        SnapTargetKind kind{SnapTargetKind::None};
        float pointX{0.0f};
        float pointY{0.0f};
        bool hasPoint{false};
    };

    inline bool isObjectSnapEnabled(const SnapOptions& options) {
        return options.enabled && (options.endpointEnabled || options.midpointEnabled || options.centerEnabled || options.nearestEnabled);
    }

    inline float toWorldTolerance(float tolerancePx, float viewScale) {
        const float px = tolerancePx > 0.0f ? tolerancePx : 10.0f;
        if (viewScale <= 1e-6f) return px;
        return px / viewScale;
    }

    inline bool isMovingId(std::uint32_t id, const std::vector<std::uint32_t>& movingIds) {
        for (const std::uint32_t mid : movingIds) {
            if (mid == id) return true;
        }
        return false;
    }

    inline void considerAxis(float candidate, float pointX, float pointY, SnapTargetKind kind, const float* targets, std::uint32_t count, float tol, SnapAxisBest& best) {
        for (std::uint32_t i = 0; i < count; i++) {
            const float target = targets[i];
            const float delta = candidate - target;
            const float dist = std::abs(delta);
            if (dist <= tol && dist < best.dist) {
                best.dist = dist;
                best.delta = delta;
                best.guide = candidate;
                best.snapped = true;
                best.kind = kind;
                best.pointX = pointX;
                best.pointY = pointY;
                best.hasPoint = kind != SnapTargetKind::None;
            }
        }
    }

    inline bool computeEntityAabb(std::uint32_t id, const EntityManager& em, TextSystem& ts, AABB& out) {
        const auto it = em.entities.find(id);
        if (it == em.entities.end()) return false;

        switch (it->second.kind) {
            case EntityKind::Rect: {
                if (it->second.index >= em.rects.size()) return false;
                const RectRec& r = em.rects[it->second.index];
                out = { r.x, r.y, r.x + r.w, r.y + r.h };
                return true;
            }
            case EntityKind::Circle: {
                if (it->second.index >= em.circles.size()) return false;
                const CircleRec& c = em.circles[it->second.index];
                out = PickSystem::computeCircleAABB(c);
                return true;
            }
            case EntityKind::Polygon: {
                if (it->second.index >= em.polygons.size()) return false;
                const PolygonRec& p = em.polygons[it->second.index];
                out = PickSystem::computePolygonAABB(p);
                return true;
            }
            case EntityKind::Line: {
                if (it->second.index >= em.lines.size()) return false;
                const LineRec& l = em.lines[it->second.index];
                out = PickSystem::computeLineAABB(l);
                return true;
            }
            case EntityKind::Polyline: {
                if (it->second.index >= em.polylines.size()) return false;
                const PolyRec& pl = em.polylines[it->second.index];
                if (pl.count < 2 || pl.offset + pl.count > em.points.size()) return false;
                out = PickSystem::computePolylineAABB(pl, em.points);
                return true;
            }
            case EntityKind::Arrow: {
                if (it->second.index >= em.arrows.size()) return false;
                const ArrowRec& a = em.arrows[it->second.index];
                out = PickSystem::computeArrowAABB(a);
                return true;
            }
            case EntityKind::Text: {
                float minX = 0.0f, minY = 0.0f, maxX = 0.0f, maxY = 0.0f;
                if (!ts.getBounds(id, minX, minY, maxX, maxY)) return false;
                out = { minX, minY, maxX, maxY };
                return true;
            }
            default:
                break;
        }
        return false;
    }

    inline void addEndpointCandidates(std::uint32_t id, const EntityManager& em, SnapAxisBest& bestX, SnapAxisBest& bestY, const float* targetsX, std::uint32_t countX, const float* targetsY, std::uint32_t countY, bool allowSnapX, bool allowSnapY, float tol) {
        if (const LineRec* l = em.getLine(id)) {
            if (allowSnapX) {
                considerAxis(l->x0, l->x0, l->y0, SnapTargetKind::Endpoint, targetsX, countX, tol, bestX);
                considerAxis(l->x1, l->x1, l->y1, SnapTargetKind::Endpoint, targetsX, countX, tol, bestX);
            }
            if (allowSnapY) {
                considerAxis(l->y0, l->x0, l->y0, SnapTargetKind::Endpoint, targetsY, countY, tol, bestY);
                considerAxis(l->y1, l->x1, l->y1, SnapTargetKind::Endpoint, targetsY, countY, tol, bestY);
            }
            return;
        }

        if (const ArrowRec* a = em.getArrow(id)) {
            if (allowSnapX) {
                considerAxis(a->ax, a->ax, a->ay, SnapTargetKind::Endpoint, targetsX, countX, tol, bestX);
                considerAxis(a->bx, a->bx, a->by, SnapTargetKind::Endpoint, targetsX, countX, tol, bestX);
            }
            if (allowSnapY) {
                considerAxis(a->ay, a->ax, a->ay, SnapTargetKind::Endpoint, targetsY, countY, tol, bestY);
                considerAxis(a->by, a->bx, a->by, SnapTargetKind::Endpoint, targetsY, countY, tol, bestY);
            }
            return;
        }

        if (const PolyRec* pl = em.getPolyline(id)) {
            if (pl->count < 1 || pl->offset + pl->count > em.points.size()) return;
            for (std::uint32_t i = 0; i < pl->count; i++) {
                const Point2& p = em.points[pl->offset + i];
                if (allowSnapX) {
                    considerAxis(p.x, p.x, p.y, SnapTargetKind::Endpoint, targetsX, countX, tol, bestX);
                }
                if (allowSnapY) {
                    considerAxis(p.y, p.x, p.y, SnapTargetKind::Endpoint, targetsY, countY, tol, bestY);
                }
            }
            return;
        }

        if (const PolygonRec* pg = em.getPolygon(id)) {
            const std::uint32_t sides = std::max<std::uint32_t>(3u, pg->sides);
            const float rot = pg->rot;
            const float cosR = rot ? std::cos(rot) : 1.0f;
            const float sinR = rot ? std::sin(rot) : 0.0f;
            constexpr float kBase = static_cast<float>(-M_PI) / 2.0f;

            for (std::uint32_t i = 0; i < sides; i++) {
                const float t = (static_cast<float>(i) / sides) * 2.0f * static_cast<float>(M_PI) + kBase;
                const float dx = std::cos(t) * pg->rx * pg->sx;
                const float dy = std::sin(t) * pg->ry * pg->sy;
                const float x = pg->cx + dx * cosR - dy * sinR;
                const float y = pg->cy + dx * sinR + dy * cosR;
                if (allowSnapX) {
                    considerAxis(x, x, y, SnapTargetKind::Endpoint, targetsX, countX, tol, bestX);
                }
                if (allowSnapY) {
                    considerAxis(y, x, y, SnapTargetKind::Endpoint, targetsY, countY, tol, bestY);
                }
            }
            return;
        }
    }

    inline void addMidpointCandidates(std::uint32_t id, const EntityManager& em, SnapAxisBest& bestX, SnapAxisBest& bestY, const float* targetsX, std::uint32_t countX, const float* targetsY, std::uint32_t countY, bool allowSnapX, bool allowSnapY, float tol) {
        if (const LineRec* l = em.getLine(id)) {
            const float mx = (l->x0 + l->x1) * 0.5f;
            const float my = (l->y0 + l->y1) * 0.5f;
            if (allowSnapX) {
                considerAxis(mx, mx, my, SnapTargetKind::Midpoint, targetsX, countX, tol, bestX);
            }
            if (allowSnapY) {
                considerAxis(my, mx, my, SnapTargetKind::Midpoint, targetsY, countY, tol, bestY);
            }
            return;
        }

        if (const ArrowRec* a = em.getArrow(id)) {
            const float mx = (a->ax + a->bx) * 0.5f;
            const float my = (a->ay + a->by) * 0.5f;
            if (allowSnapX) {
                considerAxis(mx, mx, my, SnapTargetKind::Midpoint, targetsX, countX, tol, bestX);
            }
            if (allowSnapY) {
                considerAxis(my, mx, my, SnapTargetKind::Midpoint, targetsY, countY, tol, bestY);
            }
            return;
        }

        if (const PolyRec* pl = em.getPolyline(id)) {
            if (pl->count < 2 || pl->offset + pl->count > em.points.size()) return;
            for (std::uint32_t i = 0; i + 1 < pl->count; i++) {
                const Point2& p0 = em.points[pl->offset + i];
                const Point2& p1 = em.points[pl->offset + i + 1];
                const float mx = (p0.x + p1.x) * 0.5f;
                const float my = (p0.y + p1.y) * 0.5f;
                if (allowSnapX) {
                    considerAxis(mx, mx, my, SnapTargetKind::Midpoint, targetsX, countX, tol, bestX);
                }
                if (allowSnapY) {
                    considerAxis(my, mx, my, SnapTargetKind::Midpoint, targetsY, countY, tol, bestY);
                }
            }
            return;
        }

        if (const PolygonRec* pg = em.getPolygon(id)) {
            const std::uint32_t sides = std::max<std::uint32_t>(3u, pg->sides);
            const float rot = pg->rot;
            const float cosR = rot ? std::cos(rot) : 1.0f;
            const float sinR = rot ? std::sin(rot) : 0.0f;
            constexpr float kBase = static_cast<float>(-M_PI) / 2.0f;

            float firstX = 0.0f;
            float firstY = 0.0f;
            float prevX = 0.0f;
            float prevY = 0.0f;
            bool hasPrev = false;

            for (std::uint32_t i = 0; i < sides; i++) {
                const float t = (static_cast<float>(i) / sides) * 2.0f * static_cast<float>(M_PI) + kBase;
                const float dx = std::cos(t) * pg->rx * pg->sx;
                const float dy = std::sin(t) * pg->ry * pg->sy;
                const float x = pg->cx + dx * cosR - dy * sinR;
                const float y = pg->cy + dx * sinR + dy * cosR;

                if (!hasPrev) {
                    firstX = x;
                    firstY = y;
                    prevX = x;
                    prevY = y;
                    hasPrev = true;
                    continue;
                }

                const float mx = (prevX + x) * 0.5f;
                const float my = (prevY + y) * 0.5f;
                if (allowSnapX) {
                    considerAxis(mx, mx, my, SnapTargetKind::Midpoint, targetsX, countX, tol, bestX);
                }
                if (allowSnapY) {
                    considerAxis(my, mx, my, SnapTargetKind::Midpoint, targetsY, countY, tol, bestY);
                }
                prevX = x;
                prevY = y;
            }

            if (hasPrev) {
                const float mx = (prevX + firstX) * 0.5f;
                const float my = (prevY + firstY) * 0.5f;
                if (allowSnapX) {
                    considerAxis(mx, mx, my, SnapTargetKind::Midpoint, targetsX, countX, tol, bestX);
                }
                if (allowSnapY) {
                    considerAxis(my, mx, my, SnapTargetKind::Midpoint, targetsY, countY, tol, bestY);
                }
            }
            return;
        }
    }
}

SnapResult computeObjectSnap(
    const SnapOptions& options,
    const std::vector<std::uint32_t>& movingIds,
    float baseMinX,
    float baseMinY,
    float baseMaxX,
    float baseMaxY,
    float totalDx,
    float totalDy,
    const EntityManager& entityManager,
    TextSystem& textSystem,
    const PickSystem& pickSystem,
    float viewScale,
    float viewX,
    float viewY,
    float viewWidth,
    float viewHeight,
    bool allowSnapX,
    bool allowSnapY,
    std::vector<SnapGuide>& outGuides,
    std::vector<std::uint32_t>& candidatesScratch) {
    SnapResult result;
    outGuides.clear();
    candidatesScratch.clear();

    if (!isObjectSnapEnabled(options) || (!allowSnapX && !allowSnapY)) {
        return result;
    }

    const float tol = toWorldTolerance(options.tolerancePx, viewScale);

    const float movedMinX = baseMinX + totalDx;
    const float movedMinY = baseMinY + totalDy;
    const float movedMaxX = baseMaxX + totalDx;
    const float movedMaxY = baseMaxY + totalDy;

    float targetXs[3] = { movedMinX, movedMaxX, 0.0f };
    float targetYs[3] = { movedMinY, movedMaxY, 0.0f };
    std::uint32_t targetXCount = 2;
    std::uint32_t targetYCount = 2;

    if (options.centerEnabled) {
        targetXs[targetXCount++] = (movedMinX + movedMaxX) * 0.5f;
        targetYs[targetYCount++] = (movedMinY + movedMaxY) * 0.5f;
    }

    AABB queryBounds{ movedMinX - tol, movedMinY - tol, movedMaxX + tol, movedMaxY + tol };
    if (candidatesScratch.capacity() < 128) {
        candidatesScratch.reserve(128);
    }
    pickSystem.queryArea(queryBounds, candidatesScratch);

    SnapAxisBest bestX;
    SnapAxisBest bestY;

    for (const std::uint32_t id : candidatesScratch) {
        if (isMovingId(id, movingIds)) continue;
        if (!entityManager.isEntityPickable(id)) continue;

        AABB aabb{};
        if (!computeEntityAabb(id, entityManager, textSystem, aabb)) continue;

        if (allowSnapX) {
            considerAxis(aabb.minX, aabb.minX, 0.0f, SnapTargetKind::None, targetXs, targetXCount, tol, bestX);
            considerAxis(aabb.maxX, aabb.maxX, 0.0f, SnapTargetKind::None, targetXs, targetXCount, tol, bestX);
        }
        if (allowSnapY) {
            considerAxis(aabb.minY, 0.0f, aabb.minY, SnapTargetKind::None, targetYs, targetYCount, tol, bestY);
            considerAxis(aabb.maxY, 0.0f, aabb.maxY, SnapTargetKind::None, targetYs, targetYCount, tol, bestY);
        }

        if (options.centerEnabled) {
            const float cx = (aabb.minX + aabb.maxX) * 0.5f;
            const float cy = (aabb.minY + aabb.maxY) * 0.5f;
            if (allowSnapX) {
                considerAxis(cx, cx, cy, SnapTargetKind::Center, targetXs, targetXCount, tol, bestX);
            }
            if (allowSnapY) {
                considerAxis(cy, cx, cy, SnapTargetKind::Center, targetYs, targetYCount, tol, bestY);
            }
        }

        if (options.endpointEnabled) {
            addEndpointCandidates(id, entityManager, bestX, bestY, targetXs, targetXCount, targetYs, targetYCount, allowSnapX, allowSnapY, tol);
        }

        if (options.midpointEnabled) {
            addMidpointCandidates(id, entityManager, bestX, bestY, targetXs, targetXCount, targetYs, targetYCount, allowSnapX, allowSnapY, tol);
        }
    }

    if (allowSnapX && bestX.snapped) {
        result.snappedX = true;
        result.dx = bestX.delta;
    }

    if (allowSnapY && bestY.snapped) {
        result.snappedY = true;
        result.dy = bestY.delta;
    }

    if (result.snappedX || result.snappedY) {
        auto pushHit = [&](const SnapAxisBest& best) {
            if (!best.hasPoint || best.kind == SnapTargetKind::None) return;
            if (result.hitCount >= 2) return;
            result.hits[result.hitCount++] = SnapHit{ best.kind, best.pointX, best.pointY };
        };

        const bool samePoint =
            bestX.hasPoint && bestY.hasPoint &&
            bestX.kind == bestY.kind &&
            std::abs(bestX.pointX - bestY.pointX) <= 1e-4f &&
            std::abs(bestX.pointY - bestY.pointY) <= 1e-4f;

        if (result.snappedX && result.snappedY && samePoint) {
            pushHit(bestX);
        } else {
            if (result.snappedX) {
                pushHit(bestX);
            }
            if (result.snappedY) {
                const bool duplicate =
                    result.hitCount > 0 &&
                    result.hits[0].kind == bestY.kind &&
                    std::abs(result.hits[0].x - bestY.pointX) <= 1e-4f &&
                    std::abs(result.hits[0].y - bestY.pointY) <= 1e-4f;
                if (!duplicate) {
                    pushHit(bestY);
                }
            }
        }
    }

    if (!result.snappedX && !result.snappedY) {
        return result;
    }

    float viewMinX = movedMinX;
    float viewMaxX = movedMaxX;
    float viewMinY = movedMinY;
    float viewMaxY = movedMaxY;

    if (viewScale > 1e-6f && viewWidth > 0.0f && viewHeight > 0.0f) {
        viewMinX = -viewX / viewScale;
        viewMinY = -viewY / viewScale;
        viewMaxX = (viewWidth - viewX) / viewScale;
        viewMaxY = (viewHeight - viewY) / viewScale;
    }

    if (result.snappedX) {
        outGuides.push_back(SnapGuide{ bestX.guide, viewMinY, bestX.guide, viewMaxY });
    }

    if (result.snappedY) {
        outGuides.push_back(SnapGuide{ viewMinX, bestY.guide, viewMaxX, bestY.guide });
    }

    return result;
}
