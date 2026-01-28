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
    recordTransformUpdate(
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

    const auto isApproximatelyCircle = [](float rx, float ry) noexcept {
        const float ax = std::abs(rx);
        const float ay = std::abs(ry);
        const float maxR = std::max(ax, ay);
        if (!std::isfinite(maxR) || maxR <= 1e-6f) return false;
        return std::abs(ax - ay) <= maxR * 1e-3f;
    };

    if (session_.mode == TransformMode::Move || session_.mode == TransformMode::EdgeDrag) {
        const bool shiftDown = (modifiers & kShiftMask) != 0;
        const bool altDown = (modifiers & kAltMask) != 0;
        const bool orthoActive = shiftDown || orthoOptions.persistentEnabled;

        if (dragStarted && altDown) {
            duplicateSelectionForDrag();
        }

        if (!orthoActive) {
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
            const bool multiSelection = session_.snapshots.size() > 1;
            if (multiSelection) {
                const float baseMinX = session_.baseMinX;
                const float baseMinY = session_.baseMinY;
                const float baseMaxX = session_.baseMaxX;
                const float baseMaxY = session_.baseMaxY;

                float anchorX = baseMinX;
                float anchorY = baseMinY;
                float handleX = baseMaxX;
                float handleY = baseMaxY;
                switch (handleIndex) {
                    case 0: // BL -> anchor TR
                        anchorX = baseMaxX; anchorY = baseMaxY;
                        handleX = baseMinX; handleY = baseMinY;
                        break;
                    case 1: // BR -> anchor TL
                        anchorX = baseMinX; anchorY = baseMaxY;
                        handleX = baseMaxX; handleY = baseMinY;
                        break;
                    case 2: // TR -> anchor BL
                        anchorX = baseMinX; anchorY = baseMinY;
                        handleX = baseMaxX; handleY = baseMaxY;
                        break;
                    case 3: // TL -> anchor BR
                        anchorX = baseMaxX; anchorY = baseMinY;
                        handleX = baseMinX; handleY = baseMaxY;
                        break;
                    default:
                        break;
                }

                const float baseDx = handleX - anchorX;
                const float baseDy = handleY - anchorY;
                float dx = worldX - anchorX;
                float dy = worldY - anchorY;

                const float absBaseDx = std::max(1e-6f, std::abs(baseDx));
                const float absBaseDy = std::max(1e-6f, std::abs(baseDy));
                const bool shiftDown = (modifiers & kShiftMask) != 0;
                if (shiftDown) {
                    const float aspect = absBaseDx / absBaseDy;
                    const float relX = std::abs(dx) / absBaseDx;
                    const float relY = std::abs(dy) / absBaseDy;
                    if (relX >= relY) {
                        dy = std::copysign(std::abs(dx) / std::max(1e-6f, aspect), dy);
                    } else {
                        dx = std::copysign(std::abs(dy) * aspect, dx);
                    }
                }

                auto clampScale = [](float s) noexcept {
                    if (!std::isfinite(s)) return 1.0f;
                    constexpr float kMinScale = 1e-4f;
                    if (std::abs(s) >= kMinScale) return s;
                    return std::copysign(kMinScale, s == 0.0f ? 1.0f : s);
                };

                float scaleX = (std::abs(baseDx) > 1e-6f) ? (dx / baseDx) : 1.0f;
                float scaleY = (std::abs(baseDy) > 1e-6f) ? (dy / baseDy) : 1.0f;
                scaleX = clampScale(scaleX);
                scaleY = clampScale(scaleY);

                const bool altDown = (modifiers & kAltMask) != 0;
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
                                const auto [newCx, newCy] = scalePoint(snapEntity.x, snapEntity.y);
                                float rxScale = scaleXAbs;
                                float ryScale = scaleYAbs;
                                if (isApproximatelyCircle(snapEntity.w, snapEntity.h) && !altDown) {
                                    const float uniformScale = std::max(rxScale, ryScale);
                                    rxScale = uniformScale;
                                    ryScale = uniformScale;
                                }
                                c.cx = newCx;
                                c.cy = newCy;
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
                                const auto [newCx, newCy] = scalePoint(snapEntity.x, snapEntity.y);
                                p.cx = newCx;
                                p.cy = newCy;
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
                        case EntityKind::Line: {
                            if (snapEntity.points.size() < 2) break;
                            const auto [x0, y0] = scalePoint(snapEntity.points[0].x, snapEntity.points[0].y);
                            const auto [x1, y1] = scalePoint(snapEntity.points[1].x, snapEntity.points[1].y);
                            for (auto& l : entityManager_.lines) {
                                if (l.id != entityId) continue;
                                l.x0 = x0;
                                l.y0 = y0;
                                l.x1 = x1;
                                l.y1 = y1;
                                pickSystem_.update(entityId, PickSystem::computeLineAABB(l));
                                refreshEntityRenderRange(entityId);
                                markEntityGeometryChanged(entityId);
                                updated = true;
                                break;
                            }
                            break;
                        }
                        case EntityKind::Arrow: {
                            if (snapEntity.points.size() < 2) break;
                            const auto [ax, ay] = scalePoint(snapEntity.points[0].x, snapEntity.points[0].y);
                            const auto [bx, by] = scalePoint(snapEntity.points[1].x, snapEntity.points[1].y);
                            for (auto& a : entityManager_.arrows) {
                                if (a.id != entityId) continue;
                                a.ax = ax;
                                a.ay = ay;
                                a.bx = bx;
                                a.by = by;
                                pickSystem_.update(entityId, PickSystem::computeArrowAABB(a));
                                refreshEntityRenderRange(entityId);
                                markEntityGeometryChanged(entityId);
                                updated = true;
                                break;
                            }
                            break;
                        }
                        case EntityKind::Polyline: {
                            for (auto& pl : entityManager_.polylines) {
                                if (pl.id != entityId) continue;
                                const std::uint32_t limit = std::min<std::uint32_t>(
                                    pl.count,
                                    static_cast<std::uint32_t>(snapEntity.points.size()));
                                for (std::uint32_t k = 0; k < limit; ++k) {
                                    const std::uint32_t pointIndex = pl.offset + k;
                                    if (pointIndex >= entityManager_.points.size()) break;
                                    const auto [px, py] = scalePoint(
                                        snapEntity.points[k].x,
                                        snapEntity.points[k].y);
                                    entityManager_.points[pointIndex].x = px;
                                    entityManager_.points[pointIndex].y = py;
                                }
                                pickSystem_.update(entityId, PickSystem::computePolylineAABB(pl, entityManager_.points));
                                refreshEntityRenderRange(entityId);
                                markEntityGeometryChanged(entityId);
                                updated = true;
                                break;
                            }
                            break;
                        }
                        case EntityKind::Text: {
                            TextRec* tr = textSystem_.store.getTextMutable(entityId);
                            if (!tr) break;
                            const auto [newX, newY] = scalePoint(snapEntity.x, snapEntity.y);
                            const float dxText = newX - snapEntity.x;
                            const float dyText = newY - snapEntity.y;
                            tr->x = newX;
                            tr->y = newY;
                            tr->minX += dxText;
                            tr->maxX += dxText;
                            tr->minY += dyText;
                            tr->maxY += dyText;
                            engine_.markTextQuadsDirty();
                            pickSystem_.update(entityId, {tr->minX, tr->minY, tr->maxX, tr->maxY});
                            refreshEntityRenderRange(entityId);
                            markEntityGeometryChanged(entityId);
                            updated = true;
                            break;
                        }
                        default:
                            break;
                    }
                }
            } else {
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

                        const bool altDown = (modifiers & kAltMask) != 0;
                        const bool circleUniformLocked =
                            it->second.kind == EntityKind::Circle &&
                            isApproximatelyCircle(halfW, halfH) &&
                            !altDown;
                        if (circleUniformLocked) {
                            const float absDx = std::abs(dx);
                            const float absDy = std::abs(dy);
                            if (absDx >= absDy) {
                                dy = std::copysign(absDx, dy);
                            } else {
                                dx = std::copysign(absDy, dx);
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
                        float w = std::max(1e-3f, maxX - minX);
                        float h = std::max(1e-3f, maxY - minY);

                        if (circleUniformLocked) {
                            const float uniformSize = std::max(w, h);
                            w = uniformSize;
                            h = uniformSize;
                        }

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
                                    c.cx = centerWorldX;
                                    c.cy = centerWorldY;
                                    c.rx = w * 0.5f;
                                    c.ry = h * 0.5f;
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
    } else if (session_.mode == TransformMode::Rotate) {
        if (updateRotate(worldX, worldY, modifiers)) {
            updated = true;
        }
    } else if (session_.mode == TransformMode::SideResize) {
        if (updateSideResize(worldX, worldY, modifiers)) {
            updated = true;
        }
    }

    if (updated) {
        engine_.state().generation++;
    }

    finalizeStats();
}
