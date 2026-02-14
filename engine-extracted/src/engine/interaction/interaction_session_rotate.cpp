#include "engine/interaction/interaction_session.h"
#include "engine/interaction/interaction_constants.h"
#include "engine/interaction/interaction_session_helpers.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/text_system.h"
#include <cmath>
#include <utility>

using interaction_session_detail::kShiftMask;

bool InteractionSession::updateRotate(float worldX, float worldY, std::uint32_t modifiers) {
    const std::uint32_t kGeometryChangeMask =
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) |
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds);
    const auto markEntityGeometryChanged = [&](std::uint32_t entityId) {
        engine_.recordEntityChanged(entityId, kGeometryChangeMask);
    };

    const float currentAngleDeg =
        std::atan2(worldY - session_.rotationPivotY, worldX - session_.rotationPivotX) *
        (180.0f / M_PI);

    float frameDelta = currentAngleDeg - session_.lastAngleDeg;
    if (frameDelta > 180.0f) frameDelta -= 360.0f;
    if (frameDelta < -180.0f) frameDelta += 360.0f;

    session_.accumulatedDeltaDeg += frameDelta;
    session_.lastAngleDeg = currentAngleDeg;

    float deltaAngleDeg = session_.accumulatedDeltaDeg;
    if ((modifiers & kShiftMask) != 0) {
        constexpr float snapDeg = interaction_constants::ROTATION_SNAP_DEGREES;
        deltaAngleDeg = std::round(deltaAngleDeg / snapDeg) * snapDeg;
    }

    const auto rotatePoint = [&](float px, float py) noexcept -> std::pair<float, float> {
        const float angleRad = deltaAngleDeg * (M_PI / 180.0f);
        const float cosA = std::cos(angleRad);
        const float sinA = std::sin(angleRad);
        const float dx = px - session_.rotationPivotX;
        const float dy = py - session_.rotationPivotY;
        return {
            session_.rotationPivotX + dx * cosA - dy * sinA,
            session_.rotationPivotY + dx * sinA + dy * cosA,
        };
    };

    const float deltaAngleRad = deltaAngleDeg * (M_PI / 180.0f);
    bool updated = false;

    for (const auto& snap : session_.snapshots) {
        const std::uint32_t id = snap.id;
        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Rect) {
            for (auto& r : entityManager_.rects) {
                if (r.id != id) continue;
                r.rot = snap.rotation + deltaAngleRad;
                if (session_.snapshots.size() > 1) {
                    const float centerX = snap.x + r.w * 0.5f;
                    const float centerY = snap.y + r.h * 0.5f;
                    const auto [newCenterX, newCenterY] = rotatePoint(centerX, centerY);
                    r.x = newCenterX - r.w * 0.5f;
                    r.y = newCenterY - r.h * 0.5f;
                }
                pickSystem_.update(id, PickSystem::computeRectAABB(r));
                refreshEntityRenderRange(id);
                markEntityGeometryChanged(id);
                updated = true;
                break;
            }
        } else if (it->second.kind == EntityKind::Circle) {
            for (auto& c : entityManager_.circles) {
                if (c.id != id) continue;
                c.rot = snap.rotation + deltaAngleRad;
                if (session_.snapshots.size() > 1) {
                    const auto [newCx, newCy] = rotatePoint(snap.x, snap.y);
                    c.cx = newCx;
                    c.cy = newCy;
                }
                pickSystem_.update(id, PickSystem::computeCircleAABB(c));
                refreshEntityRenderRange(id);
                markEntityGeometryChanged(id);
                updated = true;
                break;
            }
        } else if (it->second.kind == EntityKind::Polygon) {
            for (auto& p : entityManager_.polygons) {
                if (p.id != id) continue;
                p.rot = snap.rotation + deltaAngleRad;
                if (session_.snapshots.size() > 1) {
                    const auto [newCx, newCy] = rotatePoint(snap.x, snap.y);
                    p.cx = newCx;
                    p.cy = newCy;
                }
                pickSystem_.update(id, PickSystem::computePolygonAABB(p));
                refreshEntityRenderRange(id);
                markEntityGeometryChanged(id);
                updated = true;
                break;
            }
        } else if (it->second.kind == EntityKind::Text) {
            TextRec* t = textSystem_.store.getTextMutable(id);
            if (!t) continue;
            t->rotation = snap.rotation + deltaAngleRad;
            if (session_.snapshots.size() > 1) {
                const auto [newX, newY] = rotatePoint(snap.x, snap.y);
                t->x = newX;
                t->y = newY;
            }
            refreshEntityRenderRange(id);
            markEntityGeometryChanged(id);
            updated = true;
        }
    }

    return updated;
}

