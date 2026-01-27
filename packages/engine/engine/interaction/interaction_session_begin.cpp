#include "engine/interaction/interaction_session.h"
#include "engine/interaction/interaction_constants.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/history/history_manager.h"
#include "engine/text_system.h"
#include "engine/interaction/interaction_session_helpers.h"
#include <algorithm>
#include <cmath>

void InteractionSession::beginTransform(
    const std::uint32_t* ids,
    std::uint32_t idCount,
    TransformMode mode,
    std::uint32_t specificId,
    int32_t vertexIndex,
    float screenX,
    float screenY,
    float viewX,
    float viewY,
    float viewScale,
    float viewWidth,
    float viewHeight,
    std::uint32_t modifiers
) {
    if (session_.active) return;

    session_.active = true;
    session_.mode = mode;
    session_.initialIds.clear();
    session_.snapshots.clear();
    session_.specificId = specificId;
    session_.vertexIndex = vertexIndex;
    session_.startScreenX = screenX;
    session_.startScreenY = screenY;
    interaction_session_detail::screenToWorld(screenX, screenY, viewX, viewY, viewScale, session_.startX, session_.startY);
    (void)viewWidth;
    (void)viewHeight;
    session_.dragging = false;
    session_.historyActive = false;
    session_.nextEntityIdBefore = engine_.state().nextEntityId_;
    session_.axisLock = AxisLock::None;
    session_.resizeAnchorValid = false;
    session_.resizeAnchorX = 0.0f;
    session_.resizeAnchorY = 0.0f;
    session_.resizeAspect = 1.0f;
    session_.resizeBaseW = 0.0f;
    session_.resizeBaseH = 0.0f;
    session_.duplicated = false;
    session_.originalIds.clear();
    session_.sideIndex = -1;
    session_.sideResizeSymmetric = false;
    transformStats_ = TransformStats{};
    snapGuides_.clear();
    session_.dragThresholdPx = interaction_constants::DRAG_THRESHOLD_PX;

    std::vector<std::uint32_t> activeIds;
    const auto& selectionOrdered = engine_.state().selectionManager_.getOrdered();
    const bool selectionHasMultiple = selectionOrdered.size() > 1;
    const bool idsHaveMultiple = ids && idCount > 1;

    // Group handles should operate on the whole selection for resize/rotate.
    if ((mode == TransformMode::Resize || mode == TransformMode::Rotate) &&
        (selectionHasMultiple || idsHaveMultiple)) {
        if (selectionHasMultiple) {
            activeIds = selectionOrdered;
        } else {
            activeIds.assign(ids, ids + idCount);
        }
    } else if (mode != TransformMode::Move && mode != TransformMode::EdgeDrag && mode != TransformMode::SideResize && specificId != 0) {
        if (!entityManager_.isEntityPickable(specificId)) {
            session_.active = false;
            return;
        }
        activeIds.push_back(specificId);
    } else if (mode == TransformMode::SideResize && specificId != 0) {
        // SideResize: use specificId, vertexIndex contains sideIndex (0=S, 1=E, 2=N, 3=W)
        if (!entityManager_.isEntityPickable(specificId)) {
            session_.active = false;
            return;
        }
        activeIds.push_back(specificId);
        session_.sideIndex = vertexIndex;  // Reuse vertexIndex for side handle index
    } else if (!selectionOrdered.empty()) {
        activeIds = selectionOrdered;
    } else if (ids && idCount > 0) {
        activeIds.assign(ids, ids + idCount);
    }

    session_.initialIds.reserve(activeIds.size());
    session_.snapshots.reserve(activeIds.size());

    for (const std::uint32_t id : activeIds) {
        if (!entityManager_.isEntityPickable(id)) continue;
        session_.initialIds.push_back(id);

        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        TransformSnapshot snap;
        snap.id = id;
        snap.x = 0.0f; snap.y = 0.0f; snap.w = 0.0f; snap.h = 0.0f;
        snap.rotation = 0.0f;

        if (it->second.kind == EntityKind::Rect) {
            for (const auto& r : entityManager_.rects) {
                if (r.id == id) {
                    snap.x = r.x;
                    snap.y = r.y;
                    snap.w = r.w;
                    snap.h = r.h;
                    snap.rotation = r.rot;
                    break;
                }
            }
        } else if (it->second.kind == EntityKind::Circle) {
            for (const auto& c : entityManager_.circles) {
                if (c.id == id) {
                    snap.x = c.cx;
                    snap.y = c.cy;
                    snap.w = c.rx;
                    snap.h = c.ry;
                    snap.rotation = c.rot;
                    break;
                }
            }
        } else if (it->second.kind == EntityKind::Polygon) {
            for (const auto& p : entityManager_.polygons) {
                if (p.id == id) {
                    snap.x = p.cx;
                    snap.y = p.cy;
                    snap.w = p.rx;
                    snap.h = p.ry;
                    snap.rotation = p.rot;
                    break;
                }
            }
        } else if (it->second.kind == EntityKind::Text) {
            const TextRec* tr = textSystem_.store.getText(id);
            if (tr) {
                snap.x = tr->x;
                snap.y = tr->y;
                snap.rotation = tr->rotation;
            }
        } else if (it->second.kind == EntityKind::Line) {
            for (const auto& l : entityManager_.lines) {
                if (l.id == id) {
                    snap.points.push_back({l.x0, l.y0});
                    snap.points.push_back({l.x1, l.y1});
                    break;
                }
            }
        } else if (it->second.kind == EntityKind::Polyline) {
            for (const auto& pl : entityManager_.polylines) {
                if (pl.id == id) {
                    for (std::uint32_t k = 0; k < pl.count; k++) {
                        if (pl.offset + k < entityManager_.points.size()) {
                            snap.points.push_back(entityManager_.points[pl.offset + k]);
                        }
                    }
                    break;
                }
            }
        } else if (it->second.kind == EntityKind::Arrow) {
            for (const auto& a : entityManager_.arrows) {
                if (a.id == id) {
                    snap.points.push_back({a.ax, a.ay});
                    snap.points.push_back({a.bx, a.by});
                    break;
                }
            }
        }

        session_.snapshots.push_back(std::move(snap));
    }

    if (session_.initialIds.empty()) {
        session_.active = false;
        return;
    }

    {
        bool hasBounds = false;
        float minX = 0.0f;
        float minY = 0.0f;
        float maxX = 0.0f;
        float maxY = 0.0f;
        for (const std::uint32_t id : session_.initialIds) {
            const engine::protocol::EntityAabb aabb = engine_.getEntityAabb(id);
            if (!aabb.valid) continue;
            if (!hasBounds) {
                minX = aabb.minX;
                minY = aabb.minY;
                maxX = aabb.maxX;
                maxY = aabb.maxY;
                hasBounds = true;
                continue;
            }
            minX = std::min(minX, aabb.minX);
            minY = std::min(minY, aabb.minY);
            maxX = std::max(maxX, aabb.maxX);
            maxY = std::max(maxY, aabb.maxY);
        }

        if (!hasBounds) {
            minX = session_.startX;
            minY = session_.startY;
            maxX = session_.startX;
            maxY = session_.startY;
        }

        session_.baseMinX = minX;
        session_.baseMinY = minY;
        session_.baseMaxX = maxX;
        session_.baseMaxY = maxY;
    }

    if (session_.mode == TransformMode::Resize && session_.specificId != 0 &&
        session_.vertexIndex >= 0 && session_.vertexIndex <= 3) {
        const TransformSnapshot* snap = nullptr;
        for (const auto& s : session_.snapshots) {
            if (s.id == session_.specificId) {
                snap = &s;
                break;
            }
        }
        if (snap) {
            auto it = entityManager_.entities.find(session_.specificId);
            if (it != entityManager_.entities.end()) {
                float halfW = 0.0f;
                float halfH = 0.0f;
                bool valid = false;

                if (it->second.kind == EntityKind::Rect) {
                    halfW = snap->w * 0.5f;
                    halfH = snap->h * 0.5f;
                    valid = true;
                } else if (it->second.kind == EntityKind::Circle || it->second.kind == EntityKind::Polygon) {
                    halfW = snap->w;
                    halfH = snap->h;
                    valid = true;
                }

                if (valid) {
                    float centerX = 0.0f;
                    float centerY = 0.0f;
                    float rotation = snap->rotation;

                    if (it->second.kind == EntityKind::Rect) {
                        centerX = snap->x + snap->w * 0.5f;
                        centerY = snap->y + snap->h * 0.5f;
                    } else {
                        centerX = snap->x;
                        centerY = snap->y;
                    }

                    const float baseW = std::max(1e-6f, halfW * 2.0f);
                    const float baseH = std::max(1e-6f, halfH * 2.0f);
                    session_.resizeBaseW = baseW;
                    session_.resizeBaseH = baseH;
                    session_.resizeAspect = (baseW > 1e-6f && baseH > 1e-6f) ? (baseW / baseH) : 1.0f;

                    const float dx = session_.startX - centerX;
                    const float dy = session_.startY - centerY;
                    const float cosR = std::cos(rotation);
                    const float sinR = std::sin(rotation);
                    const float localX = dx * cosR + dy * sinR;
                    const float localY = -dx * sinR + dy * cosR;
                    const bool handleRight = localX >= 0.0f;
                    const bool handleTop = localY >= 0.0f;
                    const float anchorX = handleRight ? -halfW : halfW;
                    const float anchorY = handleTop ? -halfH : halfH;

                    session_.resizeAnchorX = anchorX;
                    session_.resizeAnchorY = anchorY;
                    session_.resizeAnchorValid = true;
                }
            }
        }
    }

    if (session_.mode == TransformMode::Rotate) {
        // Calculate rotation pivot as center of selection bounds
        session_.rotationPivotX = (session_.baseMinX + session_.baseMaxX) * 0.5f;
        session_.rotationPivotY = (session_.baseMinY + session_.baseMaxY) * 0.5f;

        // Calculate start angle from pivot to initial pointer position
        float worldX = 0.0f;
        float worldY = 0.0f;
        interaction_session_detail::screenToWorld(screenX, screenY, viewX, viewY, viewScale, worldX, worldY);

        const float dx = worldX - session_.rotationPivotX;
        const float dy = worldY - session_.rotationPivotY;
        const float startAngle = std::atan2(dy, dx) * (180.0f / M_PI);
        session_.startAngleDeg = startAngle;
        session_.lastAngleDeg = startAngle;  // Initialize last angle for continuous tracking
        session_.accumulatedDeltaDeg = 0.0f;
    }

    if (session_.mode == TransformMode::SideResize && session_.specificId != 0 &&
        session_.sideIndex >= 0 && session_.sideIndex <= 3) {
        // Initialize side resize state
        const TransformSnapshot* snap = nullptr;
        for (const auto& s : session_.snapshots) {
            if (s.id == session_.specificId) {
                snap = &s;
                break;
            }
        }
        if (snap) {
            auto it = entityManager_.entities.find(session_.specificId);
            if (it != entityManager_.entities.end()) {
                float halfW = 0.0f;
                float halfH = 0.0f;
                bool valid = false;

                if (it->second.kind == EntityKind::Rect) {
                    halfW = snap->w * 0.5f;
                    halfH = snap->h * 0.5f;
                    valid = true;
                } else if (it->second.kind == EntityKind::Circle || it->second.kind == EntityKind::Polygon) {
                    halfW = snap->w;
                    halfH = snap->h;
                    valid = true;
                }

                if (valid) {
                    const float baseW = std::max(1e-6f, halfW * 2.0f);
                    const float baseH = std::max(1e-6f, halfH * 2.0f);
                    session_.resizeBaseW = baseW;
                    session_.resizeBaseH = baseH;
                    session_.resizeAspect = (baseW > 1e-6f && baseH > 1e-6f) ? (baseW / baseH) : 1.0f;
                    session_.resizeAnchorValid = true;

                    // Set anchor on opposite side
                    // sideIndex: 0=S, 1=E, 2=N, 3=W
                    // Anchor on opposite side in local space
                    switch (session_.sideIndex) {
                        case 0: // South -> anchor at North (top edge)
                            session_.resizeAnchorX = 0.0f;
                            session_.resizeAnchorY = -halfH;
                            break;
                        case 1: // East -> anchor at West (left edge)
                            session_.resizeAnchorX = -halfW;
                            session_.resizeAnchorY = 0.0f;
                            break;
                        case 2: // North -> anchor at South (bottom edge)
                            session_.resizeAnchorX = 0.0f;
                            session_.resizeAnchorY = halfH;
                            break;
                        case 3: // West -> anchor at East (right edge)
                            session_.resizeAnchorX = halfW;
                            session_.resizeAnchorY = 0.0f;
                            break;
                    }
                }
            }
        }
    }

    recordTransformBegin(
        screenX,
        screenY,
        viewX,
        viewY,
        viewScale,
        viewWidth,
        viewHeight,
        snapOptions,
        orthoOptions,
        modifiers);

    session_.historyActive = engine_.beginHistoryEntry();
    if (session_.historyActive) {
        for (const std::uint32_t id : session_.initialIds) {
            engine_.markEntityChange(id);
        }
    }
}
