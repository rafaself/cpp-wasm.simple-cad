#include "engine/interaction/interaction_session.h"
#include "engine/interaction/interaction_session_helpers.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>

using interaction_session_detail::kAltMask;

bool InteractionSession::updateSideResize(float worldX, float worldY, std::uint32_t modifiers) {
    const int32_t sideIndex = session_.sideIndex;
    if (sideIndex < 0 || sideIndex > 3 || !session_.resizeAnchorValid) return false;

    const std::uint32_t kGeometryChangeMask =
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) |
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds);
    const auto markEntityGeometryChanged = [&](std::uint32_t entityId) {
        engine_.recordEntityChanged(entityId, kGeometryChangeMask);
    };

    const auto isApproximatelyCircle = [](float rx, float ry) noexcept {
        const float ax = std::abs(rx);
        const float ay = std::abs(ry);
        const float maxR = std::max(ax, ay);
        if (!std::isfinite(maxR) || maxR <= 1e-6f) return false;
        return std::abs(ax - ay) <= maxR * 1e-3f;
    };

    const bool multiSelection = session_.snapshots.size() > 1;
    const bool altDown = (modifiers & kAltMask) != 0;
    bool updated = false;

    if (multiSelection) {
        const float baseMinX = session_.baseMinX;
        const float baseMinY = session_.baseMinY;
        const float baseMaxX = session_.baseMaxX;
        const float baseMaxY = session_.baseMaxY;
        const float baseW = std::max(1e-6f, baseMaxX - baseMinX);
        const float baseH = std::max(1e-6f, baseMaxY - baseMinY);
        const float centerX = (baseMinX + baseMaxX) * 0.5f;
        const float centerY = (baseMinY + baseMaxY) * 0.5f;

        float anchorX = centerX;
        float anchorY = centerY;
        float baseDx = baseW;
        float baseDy = baseH;

        switch (sideIndex) {
            case 0:  // South -> anchor at North (top edge)
                anchorY = altDown ? centerY : baseMinY;
                baseDy = altDown ? (baseMaxY - centerY) : (baseMaxY - baseMinY);
                break;
            case 1:  // East -> anchor at West (left edge)
                anchorX = altDown ? centerX : baseMinX;
                baseDx = altDown ? (baseMaxX - centerX) : (baseMaxX - baseMinX);
                break;
            case 2:  // North -> anchor at South (bottom edge)
                anchorY = altDown ? centerY : baseMaxY;
                baseDy = altDown ? (baseMinY - centerY) : (baseMinY - baseMaxY);
                break;
            case 3:  // West -> anchor at East (right edge)
                anchorX = altDown ? centerX : baseMaxX;
                baseDx = altDown ? (baseMinX - centerX) : (baseMinX - baseMaxX);
                break;
            default:
                break;
        }

        auto clampScale = [](float s) noexcept {
            if (!std::isfinite(s)) return 1.0f;
            constexpr float kMinScale = 1e-4f;
            if (std::abs(s) >= kMinScale) return s;
            return std::copysign(kMinScale, s == 0.0f ? 1.0f : s);
        };

        float scaleX = 1.0f;
        float scaleY = 1.0f;
        if (sideIndex == 0 || sideIndex == 2) {
            const float dy = worldY - anchorY;
            const float denom = (std::abs(baseDy) > 1e-6f) ? baseDy : std::copysign(1e-6f, baseDy);
            scaleY = clampScale(dy / denom);
        } else {
            const float dx = worldX - anchorX;
            const float denom = (std::abs(baseDx) > 1e-6f) ? baseDx : std::copysign(1e-6f, baseDx);
            scaleX = clampScale(dx / denom);
        }

        const float scaleXAbs = std::abs(scaleX);
        const float scaleYAbs = std::abs(scaleY);

        auto scalePoint = [&](float px, float py) noexcept -> std::pair<float, float> {
            return {
                anchorX + (px - anchorX) * scaleX,
                anchorY + (py - anchorY) * scaleY,
            };
        };

        for (const auto& snapEntity : session_.snapshots) {
            const std::uint32_t entityId = snapEntity.id;
            auto entIt = entityManager_.entities.find(entityId);
            if (entIt == entityManager_.entities.end()) continue;

            switch (entIt->second.kind) {
                case EntityKind::Rect: {
                    for (auto& r : entityManager_.rects) {
                        if (r.id != entityId) continue;
                        const float snapCenterX = snapEntity.x + snapEntity.w * 0.5f;
                        const float snapCenterY = snapEntity.y + snapEntity.h * 0.5f;
                        const auto [newCenterX, newCenterY] = scalePoint(snapCenterX, snapCenterY);
                        const float newW = std::max(1e-3f, snapEntity.w * scaleXAbs);
                        const float newH = std::max(1e-3f, snapEntity.h * scaleYAbs);
                        r.x = newCenterX - newW * 0.5f;
                        r.y = newCenterY - newH * 0.5f;
                        r.w = newW;
                        r.h = newH;
                        pickSystem_.update(entityId, PickSystem::computeRectAABB(r));
                        refreshEntityRenderRange(entityId);
                        markEntityGeometryChanged(entityId);
                        updated = true;
                        break;
                    }
                    break;
                }
                case EntityKind::Circle: {
                    for (auto& c : entityManager_.circles) {
                        if (c.id != entityId) continue;
                        const auto [newCenterX, newCenterY] = scalePoint(snapEntity.x, snapEntity.y);
                        const bool nearCircle = isApproximatelyCircle(snapEntity.w, snapEntity.h);
                        float rxScale = scaleXAbs;
                        float ryScale = scaleYAbs;
                        if (nearCircle && !altDown) {
                            const float uniformScale = (sideIndex == 0 || sideIndex == 2) ? scaleYAbs : scaleXAbs;
                            rxScale = uniformScale;
                            ryScale = uniformScale;
                        }
                        c.cx = newCenterX;
                        c.cy = newCenterY;
                        c.rx = std::max(1e-3f, snapEntity.w * rxScale);
                        c.ry = std::max(1e-3f, snapEntity.h * ryScale);
                        pickSystem_.update(entityId, PickSystem::computeCircleAABB(c));
                        refreshEntityRenderRange(entityId);
                        markEntityGeometryChanged(entityId);
                        updated = true;
                        break;
                    }
                    break;
                }
                case EntityKind::Polygon: {
                    for (auto& p : entityManager_.polygons) {
                        if (p.id != entityId) continue;
                        const auto [newCenterX, newCenterY] = scalePoint(snapEntity.x, snapEntity.y);
                        p.cx = newCenterX;
                        p.cy = newCenterY;
                        p.rx = std::max(1e-3f, snapEntity.w * scaleXAbs);
                        p.ry = std::max(1e-3f, snapEntity.h * scaleYAbs);
                        pickSystem_.update(entityId, PickSystem::computePolygonAABB(p));
                        refreshEntityRenderRange(entityId);
                        markEntityGeometryChanged(entityId);
                        updated = true;
                        break;
                    }
                    break;
                }
                default:
                    break;
            }
        }

        return updated;
    }

    const std::uint32_t id = session_.specificId;
    const TransformSnapshot* snap = nullptr;
    for (const auto& s : session_.snapshots) {
        if (s.id == id) {
            snap = &s;
            break;
        }
    }

    if (!snap) return false;

    auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end()) return false;

    bool valid = false;
    if (it->second.kind == EntityKind::Rect || it->second.kind == EntityKind::Circle ||
        it->second.kind == EntityKind::Polygon) {
        valid = true;
    }
    if (!valid) return false;

    float centerX = 0.0f;
    float centerY = 0.0f;
    float halfW = 0.0f;
    float halfH = 0.0f;

    if (it->second.kind == EntityKind::Rect) {
        centerX = snap->x + snap->w * 0.5f;
        centerY = snap->y + snap->h * 0.5f;
        halfW = snap->w * 0.5f;
        halfH = snap->h * 0.5f;
    } else {
        centerX = snap->x;
        centerY = snap->y;
        halfW = snap->w;
        halfH = snap->h;
    }

    const float rot = snap->rotation;
    const float cosR = std::cos(rot);
    const float sinR = std::sin(rot);

    // Transform world point to local space
    const float dxWorld = worldX - centerX;
    const float dyWorld = worldY - centerY;
    const float localX = dxWorld * cosR + dyWorld * sinR;
    const float localY = -dxWorld * sinR + dyWorld * cosR;

    const bool nearCircle = it->second.kind == EntityKind::Circle && isApproximatelyCircle(halfW, halfH);
    const bool circleUniformLocked = nearCircle && !altDown;
    const bool symmetricResize = altDown && !nearCircle;

    float newHalfW = halfW;
    float newHalfH = halfH;
    float newCenterLocalX = 0.0f;
    float newCenterLocalY = 0.0f;

    // sideIndex: 0=S (bottom), 1=E (right), 2=N (top), 3=W (left)
    switch (sideIndex) {
        case 0: {  // South - resize height from bottom
            if (symmetricResize) {
                newHalfH = std::max(1e-3f, std::abs(localY));
            } else {
                const float anchorY = -halfH;  // top edge
                const float dy = localY - anchorY;
                newHalfH = std::max(1e-3f, std::abs(dy) * 0.5f);
                newCenterLocalY = anchorY + dy * 0.5f;
            }
            break;
        }
        case 1: {  // East - resize width from right
            if (symmetricResize) {
                newHalfW = std::max(1e-3f, std::abs(localX));
            } else {
                const float anchorX = -halfW;  // left edge
                const float dx = localX - anchorX;
                newHalfW = std::max(1e-3f, std::abs(dx) * 0.5f);
                newCenterLocalX = anchorX + dx * 0.5f;
            }
            break;
        }
        case 2: {  // North - resize height from top
            if (symmetricResize) {
                newHalfH = std::max(1e-3f, std::abs(localY));
            } else {
                const float anchorY = halfH;  // bottom edge
                const float dy = localY - anchorY;
                newHalfH = std::max(1e-3f, std::abs(dy) * 0.5f);
                newCenterLocalY = anchorY + dy * 0.5f;
            }
            break;
        }
        case 3: {  // West - resize width from left
            if (symmetricResize) {
                newHalfW = std::max(1e-3f, std::abs(localX));
            } else {
                const float anchorX = halfW;  // right edge
                const float dx = localX - anchorX;
                newHalfW = std::max(1e-3f, std::abs(dx) * 0.5f);
                newCenterLocalX = anchorX + dx * 0.5f;
            }
            break;
        }
        default:
            break;
    }

    if (circleUniformLocked) {
        const float uniformHalf = (sideIndex == 1 || sideIndex == 3) ? newHalfW : newHalfH;
        newHalfW = uniformHalf;
        newHalfH = uniformHalf;
    }

    // Transform new center back to world space
    const float newCenterWorldX = centerX + newCenterLocalX * cosR - newCenterLocalY * sinR;
    const float newCenterWorldY = centerY + newCenterLocalX * sinR + newCenterLocalY * cosR;
    const float newW = newHalfW * 2.0f;
    const float newH = newHalfH * 2.0f;

    if (it->second.kind == EntityKind::Rect) {
        for (auto& r : entityManager_.rects) {
            if (r.id != id) continue;
            r.x = newCenterWorldX - newHalfW;
            r.y = newCenterWorldY - newHalfH;
            r.w = newW;
            r.h = newH;
            pickSystem_.update(id, PickSystem::computeRectAABB(r));
            refreshEntityRenderRange(id);
            markEntityGeometryChanged(id);
            updated = true;
            break;
        }
    } else if (it->second.kind == EntityKind::Circle) {
        for (auto& c : entityManager_.circles) {
            if (c.id != id) continue;
            c.cx = newCenterWorldX;
            c.cy = newCenterWorldY;
            c.rx = newHalfW;
            c.ry = newHalfH;
            pickSystem_.update(id, PickSystem::computeCircleAABB(c));
            refreshEntityRenderRange(id);
            markEntityGeometryChanged(id);
            updated = true;
            break;
        }
    } else if (it->second.kind == EntityKind::Polygon) {
        for (auto& p : entityManager_.polygons) {
            if (p.id != id) continue;
            p.cx = newCenterWorldX;
            p.cy = newCenterWorldY;
            p.rx = newHalfW;
            p.ry = newHalfH;
            pickSystem_.update(id, PickSystem::computePolygonAABB(p));
            refreshEntityRenderRange(id);
            markEntityGeometryChanged(id);
            updated = true;
            break;
        }
    }

    return updated;
}
