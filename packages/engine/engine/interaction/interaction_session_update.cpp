#include "engine/interaction/interaction_session.h"
#include "engine/interaction/interaction_constants.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/history/history_manager.h"
#include "engine/core/util.h"
#include "engine/interaction/snap_solver.h"
#include "engine/text_system.h"
#include "engine/interaction/interaction_session_helpers.h"
#include <algorithm>
#include <cmath>
#include <utility>

namespace {
using interaction_session_detail::kShiftMask;
using interaction_session_detail::kAltMask;
using interaction_session_detail::kAxisLockMinDeltaPx;
using interaction_session_detail::kAxisLockEnterRatio;
using interaction_session_detail::kAxisLockSwitchRatio;
using interaction_session_detail::isSnapSuppressed;
using interaction_session_detail::screenToWorld;
} // namespace

void InteractionSession::updateTransform(
    float screenX,
    float screenY,
    float viewX,
    float viewY,
    float viewScale,
    float viewWidth,
    float viewHeight,
    std::uint32_t modifiers) {
    if (!session_.active) return;
    snapGuides_.clear();
    snapHits_.clear();

    const double t0 = emscripten_get_now();
    recordTransformUpdate(screenX, screenY, viewX, viewY, viewScale, viewWidth, viewHeight, snapOptions, modifiers);
    std::uint32_t snapCandidateCount = 0;
    std::uint32_t snapHitCount = 0;
    auto finalizeStats = [&]() {
        transformStats_.lastUpdateMs = static_cast<float>(emscripten_get_now() - t0);
        transformStats_.lastSnapCandidateCount = snapCandidateCount;
        transformStats_.lastSnapHitCount = snapHitCount;
    };

    const float screenDx = screenX - session_.startScreenX;
    const float screenDy = screenY - session_.startScreenY;
    const bool snapSuppressed = isSnapSuppressed(modifiers);
    bool updated = false;
    const std::uint32_t kGeometryChangeMask =
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry) |
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds);
    const auto markEntityGeometryChanged = [&](std::uint32_t entityId) {
        engine_.recordEntityChanged(entityId, kGeometryChangeMask);
    };

    bool dragStarted = false;
    if (!session_.dragging) {
        const float threshold = session_.dragThresholdPx;
        const float distSq = screenDx * screenDx + screenDy * screenDy;
        if (distSq < threshold * threshold) {
            finalizeStats();
            return;
        }
        session_.dragging = true;
        dragStarted = true;
    }

    float worldX = 0.0f;
    float worldY = 0.0f;
    screenToWorld(screenX, screenY, viewX, viewY, viewScale, worldX, worldY);

    if (!snapSuppressed) {
        applyGridSnap(worldX, worldY, snapOptions);
    }

    float totalDx = worldX - session_.startX;
    float totalDy = worldY - session_.startY;

    if (session_.mode == TransformMode::Move || session_.mode == TransformMode::EdgeDrag) {
        const bool shiftDown = (modifiers & kShiftMask) != 0;
        const bool altDown = (modifiers & kAltMask) != 0;

        if (dragStarted && altDown) {
            duplicateSelectionForDrag();
        }

        if (!shiftDown) {
            session_.axisLock = AxisLock::None;
        } else {
            const float absDx = std::abs(screenDx);
            const float absDy = std::abs(screenDy);
            const float maxDelta = std::max(absDx, absDy);
            if (maxDelta >= kAxisLockMinDeltaPx) {
                if (session_.axisLock == AxisLock::None) {
                    if (absDx >= absDy * kAxisLockEnterRatio) {
                        session_.axisLock = AxisLock::X;
                    } else if (absDy >= absDx * kAxisLockEnterRatio) {
                        session_.axisLock = AxisLock::Y;
                    }
                } else if (session_.axisLock == AxisLock::X) {
                    if (absDy >= absDx * kAxisLockSwitchRatio) {
                        session_.axisLock = AxisLock::Y;
                    }
                } else if (session_.axisLock == AxisLock::Y) {
                    if (absDx >= absDy * kAxisLockSwitchRatio) {
                        session_.axisLock = AxisLock::X;
                    }
                }
            }
        }

        if (session_.axisLock == AxisLock::X) {
            totalDy = 0.0f;
        } else if (session_.axisLock == AxisLock::Y) {
            totalDx = 0.0f;
        }

        const bool allowSnapX = !snapSuppressed && session_.axisLock != AxisLock::Y;
        const bool allowSnapY = !snapSuppressed && session_.axisLock != AxisLock::X;

        if (!snapSuppressed) {
            const SnapResult snapResult = computeObjectSnap(
                snapOptions,
                session_.initialIds,
                session_.baseMinX,
                session_.baseMinY,
                session_.baseMaxX,
                session_.baseMaxY,
                totalDx,
                totalDy,
                entityManager_,
                textSystem_,
                pickSystem_,
                viewScale,
                viewX,
                viewY,
                viewWidth,
                viewHeight,
                allowSnapX,
                allowSnapY,
                snapGuides_,
                snapCandidates_);

            snapCandidateCount = static_cast<std::uint32_t>(snapCandidates_.size());
            if (snapResult.hitCount > 0) {
                snapHits_.reserve(snapResult.hitCount);
                for (std::uint8_t i = 0; i < snapResult.hitCount; i++) {
                    snapHits_.push_back(snapResult.hits[i]);
                }
            }
            if (snapResult.snappedX && allowSnapX) {
                totalDx += snapResult.dx;
                snapHitCount++;
            }
            if (snapResult.snappedY && allowSnapY) {
                totalDy += snapResult.dy;
                snapHitCount++;
            }
        }

        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            auto it = entityManager_.entities.find(id);
            if (it == entityManager_.entities.end()) continue;

            if (it->second.kind == EntityKind::Rect) {
                for (auto& r : entityManager_.rects) {
                    if (r.id == id) {
                        r.x = snap.x + totalDx; r.y = snap.y + totalDy;
                        pickSystem_.update(id, PickSystem::computeRectAABB(r));
                        refreshEntityRenderRange(id);
                        markEntityGeometryChanged(id);
                        updated = true;
                        break;
                    }
                }
            } else if (it->second.kind == EntityKind::Circle) {
                for (auto& c : entityManager_.circles) {
                    if (c.id == id) {
                        c.cx = snap.x + totalDx; c.cy = snap.y + totalDy;
                        pickSystem_.update(id, PickSystem::computeCircleAABB(c));
                        refreshEntityRenderRange(id);
                        markEntityGeometryChanged(id);
                        updated = true;
                        break;
                    }
                }
            } else if (it->second.kind == EntityKind::Polygon) {
                for (auto& p : entityManager_.polygons) {
                    if (p.id == id) {
                        p.cx = snap.x + totalDx; p.cy = snap.y + totalDy;
                        pickSystem_.update(id, PickSystem::computePolygonAABB(p));
                        refreshEntityRenderRange(id);
                        markEntityGeometryChanged(id);
                        updated = true;
                        break;
                    }
                }
            } else if (it->second.kind == EntityKind::Text) {
                TextRec* tr = textSystem_.store.getTextMutable(id);
                if (tr) {
                    const float offsetMinX = tr->minX - tr->x;
                    const float offsetMinY = tr->minY - tr->y;
                    const float offsetMaxX = tr->maxX - tr->x;
                    const float offsetMaxY = tr->maxY - tr->y;
                    const float newX = snap.x + totalDx;
                    const float newY = snap.y + totalDy;
                    tr->x = newX; tr->y = newY;
                    tr->minX = newX + offsetMinX;
                    tr->minY = newY + offsetMinY;
                    tr->maxX = newX + offsetMaxX;
                    tr->maxY = newY + offsetMaxY;
                    engine_.markTextQuadsDirty();
                    pickSystem_.update(id, {tr->minX, tr->minY, tr->maxX, tr->maxY});
                    markEntityGeometryChanged(id);
                    updated = true;
                }
            } else if (it->second.kind == EntityKind::Line) {
                if (snap.points.size() >= 2) {
                    for (auto& l : entityManager_.lines) {
                        if (l.id == id) {
                            l.x0 = snap.points[0].x + totalDx; l.y0 = snap.points[0].y + totalDy;
                            l.x1 = snap.points[1].x + totalDx; l.y1 = snap.points[1].y + totalDy;
                            pickSystem_.update(id, PickSystem::computeLineAABB(l));
                            refreshEntityRenderRange(id);
                            markEntityGeometryChanged(id);
                            updated = true;
                            break;
                        }
                    }
                }
            } else if (it->second.kind == EntityKind::Arrow) {
                if (snap.points.size() >= 2) {
                    for (auto& a : entityManager_.arrows) {
                        if (a.id == id) {
                            a.ax = snap.points[0].x + totalDx; a.ay = snap.points[0].y + totalDy;
                            a.bx = snap.points[1].x + totalDx; a.by = snap.points[1].y + totalDy;
                            pickSystem_.update(id, PickSystem::computeArrowAABB(a));
                            refreshEntityRenderRange(id);
                            markEntityGeometryChanged(id);
                            updated = true;
                            break;
                        }
                    }
                }
            } else if (it->second.kind == EntityKind::Polyline) {
                for (auto& pl : entityManager_.polylines) {
                    if (pl.id == id) {
                        for (std::uint32_t k = 0; k < pl.count && k < snap.points.size(); k++) {
                            if (pl.offset + k < entityManager_.points.size()) {
                                entityManager_.points[pl.offset + k].x = snap.points[k].x + totalDx;
                                entityManager_.points[pl.offset + k].y = snap.points[k].y + totalDy;
                            }
                        }
                        pickSystem_.update(id, PickSystem::computePolylineAABB(pl, entityManager_.points));
                        refreshEntityRenderRange(id);
                        markEntityGeometryChanged(id);
                        updated = true;
                        break;
                    }
                }
            }
        }
    } else if (session_.mode == TransformMode::VertexDrag) {
        std::uint32_t id = session_.specificId;
        int32_t idx = session_.vertexIndex;
        const TransformSnapshot* snap = nullptr;
        for (const auto& s : session_.snapshots) { if (s.id == id) { snap = &s; break; } }

        if (snap && idx >= 0) {
            auto it = entityManager_.entities.find(id);
            if (it != entityManager_.entities.end()) {
                if (it->second.kind == EntityKind::Polyline) {
                    for (auto& pl : entityManager_.polylines) {
                        if (pl.id == id) {
                            if (static_cast<std::uint32_t>(idx) < pl.count && static_cast<std::uint32_t>(idx) < snap->points.size()) {
                                float vertexDx = totalDx;
                                float vertexDy = totalDy;
                                const bool shiftDown = (modifiers & kShiftMask) != 0;
                                if (shiftDown && snap->points.size() >= 2) {
                                    const std::int32_t lastIndex = static_cast<std::int32_t>(snap->points.size() - 1);
                                    std::int32_t anchorIndex = -1;
                                    if (idx == 0) {
                                        anchorIndex = 1;
                                    } else if (idx == lastIndex) {
                                        anchorIndex = lastIndex - 1;
                                    }
                                    if (anchorIndex >= 0 && anchorIndex < static_cast<std::int32_t>(snap->points.size())) {
                                        const Point2& anchor = snap->points[anchorIndex];
                                        const float vecX = worldX - anchor.x;
                                        const float vecY = worldY - anchor.y;
                                        const float len = std::sqrt(vecX * vecX + vecY * vecY);
                                        if (len > 1e-6f) {
                                            constexpr float kPi = 3.14159265358979323846f;
                                            constexpr float kStep = kPi * 0.25f;
                                            const float angle = std::atan2(vecY, vecX);
                                            const float snapped = std::round(angle / kStep) * kStep;
                                            const float snappedX = anchor.x + std::cos(snapped) * len;
                                            const float snappedY = anchor.y + std::sin(snapped) * len;
                                            const Point2& base = snap->points[idx];
                                            vertexDx = snappedX - base.x;
                                            vertexDy = snappedY - base.y;
                                        }
                                    }
                                }
                                float nx = snap->points[idx].x + vertexDx;
                                float ny = snap->points[idx].y + vertexDy;
                                entityManager_.points[pl.offset + idx].x = nx;
                                entityManager_.points[pl.offset + idx].y = ny;
                                pickSystem_.update(id, PickSystem::computePolylineAABB(pl, entityManager_.points));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                            }
                            break;
                        }
                    }
                } else if (it->second.kind == EntityKind::Line) {
                    const bool shiftDown = (modifiers & kShiftMask) != 0;
                    float lineDx = totalDx;
                    float lineDy = totalDy;
                    if (shiftDown && snap->points.size() >= 2 && (idx == 0 || idx == 1)) {
                        const Point2& anchor = snap->points[idx == 0 ? 1 : 0];
                        const float vecX = worldX - anchor.x;
                        const float vecY = worldY - anchor.y;
                        const float len = std::sqrt(vecX * vecX + vecY * vecY);
                        if (len > 1e-6f) {
                            constexpr float kPi = 3.14159265358979323846f;
                            constexpr float kStep = kPi * 0.25f;
                            const float angle = std::atan2(vecY, vecX);
                            const float snapped = std::round(angle / kStep) * kStep;
                            const float snappedX = anchor.x + std::cos(snapped) * len;
                            const float snappedY = anchor.y + std::sin(snapped) * len;
                            const Point2& base = snap->points[idx];
                            lineDx = snappedX - base.x;
                            lineDy = snappedY - base.y;
                        }
                    }
                    for (auto& l : entityManager_.lines) {
                        if (l.id == id) {
                            if (idx == 0 && snap->points.size() > 0) {
                                l.x0 = snap->points[0].x + lineDx; l.y0 = snap->points[0].y + lineDy;
                                pickSystem_.update(id, PickSystem::computeLineAABB(l));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                            } else if (idx == 1 && snap->points.size() > 1) {
                                l.x1 = snap->points[1].x + lineDx; l.y1 = snap->points[1].y + lineDy;
                                pickSystem_.update(id, PickSystem::computeLineAABB(l));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                            }
                            break;
                        }
                    }
                } else if (it->second.kind == EntityKind::Arrow) {
                    // Arrow vertex drag with shift angle snapping (same as Line)
                    const bool shiftDown = (modifiers & kShiftMask) != 0;
                    float arrowDx = totalDx;
                    float arrowDy = totalDy;
                    if (shiftDown && snap->points.size() >= 2 && (idx == 0 || idx == 1)) {
                        const Point2& anchor = snap->points[idx == 0 ? 1 : 0];
                        const float vecX = worldX - anchor.x;
                        const float vecY = worldY - anchor.y;
                        const float len = std::sqrt(vecX * vecX + vecY * vecY);
                        if (len > 1e-6f) {
                            constexpr float kPi = 3.14159265358979323846f;
                            constexpr float kStep = kPi * 0.25f;
                            const float angle = std::atan2(vecY, vecX);
                            const float snapped = std::round(angle / kStep) * kStep;
                            const float snappedX = anchor.x + std::cos(snapped) * len;
                            const float snappedY = anchor.y + std::sin(snapped) * len;
                            const Point2& base = snap->points[idx];
                            arrowDx = snappedX - base.x;
                            arrowDy = snappedY - base.y;
                        }
                    }
                    for (auto& a : entityManager_.arrows) {
                        if (a.id == id) {
                            if (idx == 0 && snap->points.size() > 0) {
                                a.ax = snap->points[0].x + arrowDx; a.ay = snap->points[0].y + arrowDy;
                                pickSystem_.update(id, PickSystem::computeArrowAABB(a));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                            } else if (idx == 1 && snap->points.size() > 1) {
                                a.bx = snap->points[1].x + arrowDx; a.by = snap->points[1].y + arrowDy;
                                pickSystem_.update(id, PickSystem::computeArrowAABB(a));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                            }
                            break;
                        }
                    }
                }
            }
        }
    } else if (session_.mode == TransformMode::Resize) {
        std::uint32_t id = session_.specificId;
        int32_t handleIndex = session_.vertexIndex;
        const TransformSnapshot* snap = nullptr;
        for (const auto& s : session_.snapshots) { if (s.id == id) { snap = &s; break; } }

        if (snap && handleIndex >= 0 && handleIndex <= 3) {
            auto it = entityManager_.entities.find(id);
            if (it != entityManager_.entities.end()) {
                bool valid = false;
                if (it->second.kind == EntityKind::Rect) {
                    valid = true;
                } else if (it->second.kind == EntityKind::Circle || it->second.kind == EntityKind::Polygon) {
                    valid = true;
                }

                if (valid) {
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
                    const float dxWorld = worldX - centerX;
                    const float dyWorld = worldY - centerY;
                    const float localX = dxWorld * cosR + dyWorld * sinR;
                    const float localY = -dxWorld * sinR + dyWorld * cosR;

                    float anchorX = 0.0f;
                    float anchorY = 0.0f;
                    if (session_.resizeAnchorValid) {
                        anchorX = session_.resizeAnchorX;
                        anchorY = session_.resizeAnchorY;
                    } else {
                        switch (handleIndex) {
                            case 0: anchorX = halfW; anchorY = halfH; break;
                            case 1: anchorX = -halfW; anchorY = halfH; break;
                            case 2: anchorX = -halfW; anchorY = -halfH; break;
                            case 3: anchorX = halfW; anchorY = -halfH; break;
                        }
                    }

                    float dx = localX - anchorX;
                    float dy = localY - anchorY;

                    const bool shiftDown = (modifiers & kShiftMask) != 0;
                    if (shiftDown) {
                        float baseW = session_.resizeAnchorValid ? session_.resizeBaseW : std::abs(halfW * 2.0f);
                        float baseH = session_.resizeAnchorValid ? session_.resizeBaseH : std::abs(halfH * 2.0f);
                        float aspect = session_.resizeAnchorValid
                            ? session_.resizeAspect
                            : ((baseW > 1e-6f && baseH > 1e-6f) ? (baseW / baseH) : 1.0f);

                        if (!std::isfinite(aspect) || aspect <= 1e-6f) {
                            aspect = 1.0f;
                        }

                        const float absDx = std::abs(dx);
                        const float absDy = std::abs(dy);
                        bool useX = false;
                        if (baseW > 1e-6f && baseH > 1e-6f) {
                            useX = (absDx / baseW) >= (absDy / baseH);
                        } else {
                            useX = absDx >= absDy;
                        }

                        if (useX) {
                            const float signY = (dy < 0.0f) ? -1.0f : 1.0f;
                            dy = signY * (absDx / aspect);
                        } else {
                            const float signX = (dx < 0.0f) ? -1.0f : 1.0f;
                            dx = signX * (absDy * aspect);
                        }
                    }

                    if (session_.resizeAnchorValid) {
                        const bool right = dx >= 0.0f;
                        const bool top = dy >= 0.0f;
                        int32_t nextHandle = 0;
                        if (right && top) nextHandle = 2;
                        else if (right && !top) nextHandle = 1;
                        else if (!right && top) nextHandle = 3;
                        else nextHandle = 0;
                        session_.vertexIndex = nextHandle;
                        handleIndex = nextHandle;
                    }

                    const float minX = std::min(anchorX, anchorX + dx);
                    const float maxX = std::max(anchorX, anchorX + dx);
                    const float minY = std::min(anchorY, anchorY + dy);
                    const float maxY = std::max(anchorY, anchorY + dy);
                    const float w = std::max(1e-3f, maxX - minX);
                    const float h = std::max(1e-3f, maxY - minY);
                    const float centerLocalX = (minX + maxX) * 0.5f;
                    const float centerLocalY = (minY + maxY) * 0.5f;
                    const float centerWorldX = centerX + centerLocalX * cosR - centerLocalY * sinR;
                    const float centerWorldY = centerY + centerLocalX * sinR + centerLocalY * cosR;

                    if (it->second.kind == EntityKind::Rect) {
                        for (auto& r : entityManager_.rects) {
                            if (r.id == id) {
                                r.x = centerWorldX - w * 0.5f; r.y = centerWorldY - h * 0.5f;
                                r.w = w; r.h = h;
                                pickSystem_.update(id, PickSystem::computeRectAABB(r));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                                break;
                            }
                        }
                    } else if (it->second.kind == EntityKind::Circle) {
                        for (auto& c : entityManager_.circles) {
                            if (c.id == id) {
                                c.cx = centerWorldX; c.cy = centerWorldY; c.rx = w * 0.5f; c.ry = h * 0.5f;
                                pickSystem_.update(id, PickSystem::computeCircleAABB(c));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                                break;
                            }
                        }
                    } else if (it->second.kind == EntityKind::Polygon) {
                        for (auto& p : entityManager_.polygons) {
                            if (p.id == id) {
                                p.cx = centerWorldX; p.cy = centerWorldY;
                                p.rx = w * 0.5f; p.ry = h * 0.5f;
                                // Note: Scale (sx, sy) can be negative to support flip transformations
                                // No longer normalizing to positive values to preserve flip state

                                pickSystem_.update(id, PickSystem::computePolygonAABB(p));
                                refreshEntityRenderRange(id);
                                markEntityGeometryChanged(id);
                                updated = true;
                                break;
                            }
                        }
                    }
                }
            }
        }
    } else if (session_.mode == TransformMode::Rotate) {
        // Calculate current angle from pivot to pointer
        float currentAngleDeg = std::atan2(worldY - session_.rotationPivotY, worldX - session_.rotationPivotX) * (180.0f / M_PI);

        // Calculate incremental delta from last frame (not from start)
        // This enables continuous rotation past ±180° without jumps
        float frameDelta = currentAngleDeg - session_.lastAngleDeg;
        
        // Unwrap the frame delta to handle crossing ±180°
        if (frameDelta > 180.0f) frameDelta -= 360.0f;
        if (frameDelta < -180.0f) frameDelta += 360.0f;
        
        // Accumulate the delta
        session_.accumulatedDeltaDeg += frameDelta;
        session_.lastAngleDeg = currentAngleDeg;

        // Apply shift snap (using centralized constant)
        const bool shiftDown = (modifiers & kShiftMask) != 0;
        float deltaAngle = session_.accumulatedDeltaDeg;
        if (shiftDown) {
            constexpr float snapDeg = interaction_constants::ROTATION_SNAP_DEGREES;
            deltaAngle = std::round(deltaAngle / snapDeg) * snapDeg;
        }

        // Helper function to normalize angle to -180..180 range
        auto normalizeAngle = [](float deg) -> float {
            float normalized = std::fmod(deg, 360.0f);
            if (normalized > 180.0f) normalized -= 360.0f;
            if (normalized <= -180.0f) normalized += 360.0f;
            return normalized;
        };

        // Helper function to rotate a point around pivot
        auto rotatePoint = [](float px, float py, float pivotX, float pivotY, float angleDeg) -> std::pair<float, float> {
            const float angleRad = angleDeg * (M_PI / 180.0f);
            const float cosA = std::cos(angleRad);
            const float sinA = std::sin(angleRad);
            const float dx = px - pivotX;
            const float dy = py - pivotY;
            return {
                pivotX + dx * cosA - dy * sinA,
                pivotY + dx * sinA + dy * cosA
            };
        };

        const float deltaAngleRad = deltaAngle * (M_PI / 180.0f);

        // Apply rotation to all entities
        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            auto it = entityManager_.entities.find(id);
            if (it == entityManager_.entities.end()) continue;

            // Update rotation for entities that support it
            if (it->second.kind == EntityKind::Rect) {
                for (auto& r : entityManager_.rects) {
                    if (r.id == id) {
                        // Update rotation
                        float newRotationRad = snap.rotation + deltaAngleRad;
                        r.rot = newRotationRad;

                        // For multi-select, also rotate position around group pivot
                        if (session_.snapshots.size() > 1) {
                            // Rotate the rect center around the group pivot, then recompute top-left
                            float centerX = snap.x + r.w / 2.0f;
                            float centerY = snap.y + r.h / 2.0f;
                            auto [newCenterX, newCenterY] = rotatePoint(centerX, centerY, session_.rotationPivotX, session_.rotationPivotY, deltaAngle);
                            r.x = newCenterX - r.w / 2.0f;
                            r.y = newCenterY - r.h / 2.0f;
                        }

                        pickSystem_.update(id, PickSystem::computeRectAABB(r));
                        refreshEntityRenderRange(id);
                        markEntityGeometryChanged(id);
                        updated = true;
                        break;
                    }
                }
            } else if (it->second.kind == EntityKind::Circle) {
                for (auto& c : entityManager_.circles) {
                    if (c.id == id) {
                        // Update rotation
                        float newRotationRad = snap.rotation + deltaAngleRad;
                        c.rot = newRotationRad;

                        // For multi-select, also rotate position around group pivot
                        if (session_.snapshots.size() > 1) {
                            auto [newCx, newCy] = rotatePoint(snap.x, snap.y, session_.rotationPivotX, session_.rotationPivotY, deltaAngle);
                            c.cx = newCx;
                            c.cy = newCy;
                        }

                        pickSystem_.update(id, PickSystem::computeCircleAABB(c));
                        refreshEntityRenderRange(id);
                        markEntityGeometryChanged(id);
                        updated = true;
                        break;
                    }
                }
            } else if (it->second.kind == EntityKind::Polygon) {
                for (auto& p : entityManager_.polygons) {
                    if (p.id == id) {
                        // Update rotation
                        float newRotationRad = snap.rotation + deltaAngleRad;
                        p.rot = newRotationRad;

                        // For multi-select, also rotate position around group pivot
                        if (session_.snapshots.size() > 1) {
                            auto [newCx, newCy] = rotatePoint(snap.x, snap.y, session_.rotationPivotX, session_.rotationPivotY, deltaAngle);
                            p.cx = newCx;
                            p.cy = newCy;
                        }

                        pickSystem_.update(id, PickSystem::computePolygonAABB(p));
                        refreshEntityRenderRange(id);
                        markEntityGeometryChanged(id);
                        updated = true;
                        break;
                    }
                }
            } else if (it->second.kind == EntityKind::Text) {
                TextRec* t = textSystem_.store.getTextMutable(id);
                if (t) {
                    // Update rotation
                    float newRotationRad = snap.rotation + deltaAngleRad;
                    t->rotation = newRotationRad;

                    // For multi-select, also rotate position around group pivot
                    if (session_.snapshots.size() > 1) {
                        auto [newX, newY] = rotatePoint(snap.x, snap.y, session_.rotationPivotX, session_.rotationPivotY, deltaAngle);
                        t->x = newX;
                        t->y = newY;
                    }

                    refreshEntityRenderRange(id);
                    markEntityGeometryChanged(id);
                    updated = true;
                }
            }
        }
    } else if (session_.mode == TransformMode::SideResize) {
        // Side resize: constrained to one axis (N/E/S/W)
        std::uint32_t id = session_.specificId;
        const int32_t sideIndex = session_.sideIndex;
        const TransformSnapshot* snap = nullptr;
        for (const auto& s : session_.snapshots) { if (s.id == id) { snap = &s; break; } }

        if (snap && sideIndex >= 0 && sideIndex <= 3 && session_.resizeAnchorValid) {
            auto it = entityManager_.entities.find(id);
            if (it != entityManager_.entities.end()) {
                bool valid = false;
                if (it->second.kind == EntityKind::Rect ||
                    it->second.kind == EntityKind::Circle ||
                    it->second.kind == EntityKind::Polygon) {
                    valid = true;
                }

                if (valid) {
                    // Calculate entity center and half-sizes from snapshot
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

                    // Check for symmetric resize (Alt modifier)
                    const bool altDown = (modifiers & kAltMask) != 0;

                    float newHalfW = halfW;
                    float newHalfH = halfH;
                    float newCenterLocalX = 0.0f;
                    float newCenterLocalY = 0.0f;

                    // sideIndex: 0=S (bottom), 1=E (right), 2=N (top), 3=W (left)
                    switch (sideIndex) {
                        case 0: { // South - resize height from bottom
                            if (altDown) {
                                // Symmetric: expand both top and bottom
                                newHalfH = std::max(1e-3f, std::abs(localY));
                            } else {
                                // Asymmetric: anchor at top, resize from bottom
                                const float anchorY = -halfH;  // top edge
                                const float dy = localY - anchorY;
                                newHalfH = std::max(1e-3f, std::abs(dy) * 0.5f);
                                newCenterLocalY = anchorY + dy * 0.5f;
                            }
                            break;
                        }
                        case 1: { // East - resize width from right
                            if (altDown) {
                                newHalfW = std::max(1e-3f, std::abs(localX));
                            } else {
                                const float anchorX = -halfW;  // left edge
                                const float dx = localX - anchorX;
                                newHalfW = std::max(1e-3f, std::abs(dx) * 0.5f);
                                newCenterLocalX = anchorX + dx * 0.5f;
                            }
                            break;
                        }
                        case 2: { // North - resize height from top
                            if (altDown) {
                                newHalfH = std::max(1e-3f, std::abs(localY));
                            } else {
                                const float anchorY = halfH;  // bottom edge
                                const float dy = localY - anchorY;
                                newHalfH = std::max(1e-3f, std::abs(dy) * 0.5f);
                                newCenterLocalY = anchorY + dy * 0.5f;
                            }
                            break;
                        }
                        case 3: { // West - resize width from left
                            if (altDown) {
                                newHalfW = std::max(1e-3f, std::abs(localX));
                            } else {
                                const float anchorX = halfW;  // right edge
                                const float dx = localX - anchorX;
                                newHalfW = std::max(1e-3f, std::abs(dx) * 0.5f);
                                newCenterLocalX = anchorX + dx * 0.5f;
                            }
                            break;
                        }
                    }

                    // Transform new center back to world space
                    const float newCenterWorldX = centerX + newCenterLocalX * cosR - newCenterLocalY * sinR;
                    const float newCenterWorldY = centerY + newCenterLocalX * sinR + newCenterLocalY * cosR;
                    const float newW = newHalfW * 2.0f;
                    const float newH = newHalfH * 2.0f;

                    // Apply to entity
                    if (it->second.kind == EntityKind::Rect) {
                        for (auto& r : entityManager_.rects) {
                            if (r.id == id) {
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
                        }
                    } else if (it->second.kind == EntityKind::Circle) {
                        for (auto& c : entityManager_.circles) {
                            if (c.id == id) {
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
                        }
                    } else if (it->second.kind == EntityKind::Polygon) {
                        for (auto& p : entityManager_.polygons) {
                            if (p.id == id) {
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
                    }
                }
            }
        }
    }

    if (updated) {
        engine_.state().generation++;
    }

    finalizeStats();
}
