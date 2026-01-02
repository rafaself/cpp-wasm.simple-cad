#include "engine/interaction/interaction_session.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/history/history_manager.h"
#include "engine/core/util.h"
#include "engine/interaction/snap_solver.h"
#include "engine/text_system.h"
#include <cmath>
#include <algorithm>
#include <cstring>

namespace {
    constexpr std::uint32_t kShiftMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift);
    constexpr std::uint32_t kCtrlMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Ctrl);
    constexpr std::uint32_t kAltMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Alt);
    constexpr std::uint32_t kMetaMask = static_cast<std::uint32_t>(CadEngine::SelectionModifier::Meta);
    constexpr float kAxisLockMinDeltaPx = 4.0f;
    constexpr float kAxisLockEnterRatio = 1.1f;
    constexpr float kAxisLockSwitchRatio = 1.2f;

    inline bool isSnapSuppressed(std::uint32_t modifiers) {
        return (modifiers & (kCtrlMask | kMetaMask)) != 0;
    }

    inline float normalizeViewScale(float viewScale) {
        return (viewScale > 1e-6f && std::isfinite(viewScale)) ? viewScale : 1.0f;
    }

    inline void screenToWorld(
        float screenX,
        float screenY,
        float viewX,
        float viewY,
        float viewScale,
        float& outX,
        float& outY) {
        const float scale = normalizeViewScale(viewScale);
        outX = (screenX - viewX) / scale;
        outY = -(screenY - viewY) / scale;
    }
}

InteractionSession::InteractionSession(CadEngine& engine, EntityManager& entityManager, PickSystem& pickSystem, TextSystem& textSystem, HistoryManager& historyManager)
    : engine_(engine), entityManager_(entityManager), pickSystem_(pickSystem), textSystem_(textSystem), historyManager_(historyManager)
{
    snapGuides_.reserve(2);
    snapCandidates_.reserve(128);
}

void InteractionSession::refreshEntityRenderRange(std::uint32_t id) {
    engine_.refreshEntityRenderRange(id);
}

EntitySnapshot InteractionSession::buildSnapshotFromTransform(const TransformSnapshot& snap) const {
    // This replicates CadEngine::buildSnapshotFromTransform logic.
    // Since we need it private here.
    EntitySnapshot out{};
    if (!historyManager_.captureEntitySnapshot(snap.id, out)) {
        return out;
    }

    switch (out.kind) {
        case EntityKind::Rect:
            out.rect.x = snap.x;
            out.rect.y = snap.y;
            out.rect.w = snap.w;
            out.rect.h = snap.h;
            break;
        case EntityKind::Circle:
            out.circle.cx = snap.x;
            out.circle.cy = snap.y;
            out.circle.rx = snap.w;
            out.circle.ry = snap.h;
            break;
        case EntityKind::Polygon:
            out.polygon.cx = snap.x;
            out.polygon.cy = snap.y;
            out.polygon.rx = snap.w;
            out.polygon.ry = snap.h;
            break;
        case EntityKind::Text:
            out.textHeader.x = snap.x;
            out.textHeader.y = snap.y;
            break;
        case EntityKind::Line:
            if (snap.points.size() >= 2) {
                out.line.x0 = snap.points[0].x;
                out.line.y0 = snap.points[0].y;
                out.line.x1 = snap.points[1].x;
                out.line.y1 = snap.points[1].y;
            }
            break;
        case EntityKind::Arrow:
            if (snap.points.size() >= 2) {
                out.arrow.ax = snap.points[0].x;
                out.arrow.ay = snap.points[0].y;
                out.arrow.bx = snap.points[1].x;
                out.arrow.by = snap.points[1].y;
            }
            break;
        case EntityKind::Polyline:
            out.points = snap.points;
            out.poly.count = static_cast<std::uint32_t>(out.points.size());
            out.poly.offset = 0;
            break;
        default:
            break;
    }

    return out;
}

bool InteractionSession::duplicateSelectionForDrag() {
    if (session_.duplicated || session_.snapshots.empty()) return false;

    std::vector<std::uint32_t> newIds;
    std::vector<TransformSnapshot> newSnaps;
    newIds.reserve(session_.snapshots.size());
    newSnaps.reserve(session_.snapshots.size());

    for (const auto& snap : session_.snapshots) {
        EntitySnapshot entitySnap{};
        if (!historyManager_.captureEntitySnapshot(snap.id, entitySnap)) {
            if (!newIds.empty()) {
                const bool prevSuppressed = historyManager_.isSuppressed();
                historyManager_.setSuppressed(true);
                for (const std::uint32_t id : newIds) {
                    engine_.deleteEntity(id);
                }
                historyManager_.setSuppressed(prevSuppressed);
                engine_.setNextEntityId(session_.nextEntityIdBefore);
            }
            return false;
        }

        const std::uint32_t newId = engine_.allocateEntityId();
        entitySnap.id = newId;
        historyManager_.applyEntitySnapshot(entitySnap, engine_);

        TransformSnapshot dupSnap = snap;
        dupSnap.id = newId;
        newSnaps.push_back(std::move(dupSnap));
        newIds.push_back(newId);
    }

    if (newIds.empty()) {
        return false;
    }

    session_.duplicated = true;
    session_.originalIds = session_.initialIds;
    session_.initialIds = std::move(newIds);
    session_.snapshots = std::move(newSnaps);

    engine_.setSelection(
        session_.initialIds.data(),
        static_cast<std::uint32_t>(session_.initialIds.size()),
        engine::protocol::SelectionMode::Replace);

    return true;
}

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
    screenToWorld(screenX, screenY, viewX, viewY, viewScale, session_.startX, session_.startY);
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
    transformStats_ = TransformStats{};
    snapGuides_.clear();
    {
        constexpr float kDragThresholdPx = 3.0f;
        session_.dragThresholdPx = kDragThresholdPx;
    }

    std::vector<std::uint32_t> activeIds;

    if (mode != TransformMode::Move && mode != TransformMode::EdgeDrag && specificId != 0) {
        if (!entityManager_.isEntityPickable(specificId)) {
            session_.active = false;
            return;
        }
        activeIds.push_back(specificId);
    } else if (!engine_.state().selectionManager_.isEmpty()) {
        activeIds = engine_.state().selectionManager_.getOrdered();
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

        if (it->second.kind == EntityKind::Rect) {
            for (const auto& r : entityManager_.rects) {
                if (r.id == id) { snap.x = r.x; snap.y = r.y; snap.w = r.w; snap.h = r.h; break; }
            }
        } else if (it->second.kind == EntityKind::Circle) {
             for (const auto& c : entityManager_.circles) {
                if (c.id == id) { snap.x = c.cx; snap.y = c.cy; snap.w = c.rx; snap.h = c.ry; break; }
            }
        } else if (it->second.kind == EntityKind::Polygon) {
             for (const auto& p : entityManager_.polygons) {
                if (p.id == id) { snap.x = p.cx; snap.y = p.cy; snap.w = p.rx; snap.h = p.ry; break; }
            }
        } else if (it->second.kind == EntityKind::Text) {
             const TextRec* tr = textSystem_.store.getText(id);
             if (tr) { snap.x = tr->x; snap.y = tr->y; }
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
            const CadEngine::EntityAabb aabb = engine_.getEntityAabb(id);
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
                float origMinX = 0.0f;
                float origMinY = 0.0f;
                float origMaxX = 0.0f;
                float origMaxY = 0.0f;
                bool valid = false;

                if (it->second.kind == EntityKind::Rect) {
                    origMinX = snap->x;
                    origMinY = snap->y;
                    origMaxX = snap->x + snap->w;
                    origMaxY = snap->y + snap->h;
                    valid = true;
                } else if (it->second.kind == EntityKind::Circle || it->second.kind == EntityKind::Polygon) {
                    origMinX = snap->x - snap->w;
                    origMaxX = snap->x + snap->w;
                    origMinY = snap->y - snap->h;
                    origMaxY = snap->y + snap->h;
                    valid = true;
                }

                if (valid) {
                    float anchorX = 0.0f;
                    float anchorY = 0.0f;
                    switch (session_.vertexIndex) {
                        case 0: anchorX = origMaxX; anchorY = origMaxY; break;
                        case 1: anchorX = origMinX; anchorY = origMaxY; break;
                        case 2: anchorX = origMinX; anchorY = origMinY; break;
                        case 3: anchorX = origMaxX; anchorY = origMinY; break;
                    }

                    const float baseW = std::abs(origMaxX - origMinX);
                    const float baseH = std::abs(origMaxY - origMinY);
                    session_.resizeBaseW = baseW;
                    session_.resizeBaseH = baseH;
                    session_.resizeAspect = (baseW > 1e-6f && baseH > 1e-6f) ? (baseW / baseH) : 1.0f;
                    session_.resizeAnchorX = anchorX;
                    session_.resizeAnchorY = anchorY;
                    session_.resizeAnchorValid = true;
                }
            }
        }
    }

    recordTransformBegin(screenX, screenY, viewX, viewY, viewScale, viewWidth, viewHeight, snapOptions, modifiers);

    session_.historyActive = engine_.beginHistoryEntry();
    if (session_.historyActive) {
        for (const std::uint32_t id : session_.initialIds) {
            engine_.markEntityChange(id);
        }
    }
}

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
                          refreshEntityRenderRange(id); updated = true; break; 
                      } 
                  }
            } else if (it->second.kind == EntityKind::Circle) {
                  for (auto& c : entityManager_.circles) { 
                      if (c.id == id) { 
                          c.cx = snap.x + totalDx; c.cy = snap.y + totalDy; 
                          pickSystem_.update(id, PickSystem::computeCircleAABB(c));
                          refreshEntityRenderRange(id); updated = true; break; 
                      } 
                  }
            } else if (it->second.kind == EntityKind::Polygon) {
                  for (auto& p : entityManager_.polygons) { 
                      if (p.id == id) { 
                          p.cx = snap.x + totalDx; p.cy = snap.y + totalDy; 
                          pickSystem_.update(id, PickSystem::computePolygonAABB(p));
                          refreshEntityRenderRange(id); updated = true; break; 
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
                      engine_.state().textQuadsDirty_ = true;
                      pickSystem_.update(id, {tr->minX, tr->minY, tr->maxX, tr->maxY});
                       updated = true;
                   }
            } else if (it->second.kind == EntityKind::Line) {
                 if (snap.points.size() >= 2) {
                     for (auto& l : entityManager_.lines) { 
                         if (l.id == id) { 
                             l.x0 = snap.points[0].x + totalDx; l.y0 = snap.points[0].y + totalDy; 
                             l.x1 = snap.points[1].x + totalDx; l.y1 = snap.points[1].y + totalDy; 
                             pickSystem_.update(id, PickSystem::computeLineAABB(l));
                             refreshEntityRenderRange(id); updated = true; break; 
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
                            refreshEntityRenderRange(id); updated = true; break;
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
                         refreshEntityRenderRange(id); updated = true; break;
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
                                  refreshEntityRenderRange(id); updated = true;
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
                                  refreshEntityRenderRange(id); updated = true;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  l.x1 = snap->points[1].x + lineDx; l.y1 = snap->points[1].y + lineDy;
                                  pickSystem_.update(id, PickSystem::computeLineAABB(l));
                                  refreshEntityRenderRange(id); updated = true;
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
                                  refreshEntityRenderRange(id); updated = true;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  a.bx = snap->points[1].x + arrowDx; a.by = snap->points[1].y + arrowDy;
                                  pickSystem_.update(id, PickSystem::computeArrowAABB(a));
                                  refreshEntityRenderRange(id); updated = true;
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
                float origMinX = 0, origMinY = 0, origMaxX = 0, origMaxY = 0;
                bool valid = false;
                if (it->second.kind == EntityKind::Rect) {
                    origMinX = snap->x; origMinY = snap->y; 
                    origMaxX = snap->x + snap->w; origMaxY = snap->y + snap->h;
                    valid = true;
                } else if (it->second.kind == EntityKind::Circle || it->second.kind == EntityKind::Polygon) {
                    origMinX = snap->x - snap->w; origMaxX = snap->x + snap->w;
                    origMinY = snap->y - snap->h; origMaxY = snap->y + snap->h;
                    valid = true;
                }

                if (valid) {
                    float anchorX = 0.0f;
                    float anchorY = 0.0f;
                    if (session_.resizeAnchorValid) {
                        anchorX = session_.resizeAnchorX;
                        anchorY = session_.resizeAnchorY;
                    } else {
                        switch (handleIndex) {
                            case 0: anchorX = origMaxX; anchorY = origMaxY; break;
                            case 1: anchorX = origMinX; anchorY = origMaxY; break;
                            case 2: anchorX = origMinX; anchorY = origMinY; break;
                            case 3: anchorX = origMaxX; anchorY = origMinY; break;
                        }
                    }

                    float dx = worldX - anchorX;
                    float dy = worldY - anchorY;

                    const bool shiftDown = (modifiers & kShiftMask) != 0;
                    if (shiftDown) {
                        float baseW = session_.resizeAnchorValid ? session_.resizeBaseW : std::abs(origMaxX - origMinX);
                        float baseH = session_.resizeAnchorValid ? session_.resizeBaseH : std::abs(origMaxY - origMinY);
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

                    if (it->second.kind == EntityKind::Rect) {
                        for (auto& r : entityManager_.rects) {
                            if (r.id == id) { 
                                r.x = minX; r.y = minY; r.w = w; r.h = h;
                                pickSystem_.update(id, PickSystem::computeRectAABB(r));
                                refreshEntityRenderRange(id); updated = true; break; 
                            }
                        }
                    } else if (it->second.kind == EntityKind::Circle) {
                        for (auto& c : entityManager_.circles) {
                            if (c.id == id) { 
                                c.cx = (minX + maxX) * 0.5f; c.cy = (minY + maxY) * 0.5f; c.rx = w * 0.5f; c.ry = h * 0.5f;
                                pickSystem_.update(id, PickSystem::computeCircleAABB(c));
                                refreshEntityRenderRange(id); updated = true; break; 
                            }
                        }
                    } else if (it->second.kind == EntityKind::Polygon) {
                        for (auto& p : entityManager_.polygons) {
                            if (p.id == id) {
                                p.cx = (minX + maxX) * 0.5f; p.cy = (minY + maxY) * 0.5f; 
                                p.rx = w * 0.5f; p.ry = h * 0.5f;
                                
                                // Flip detection: check if the bbox has been "flipped" relative to anchor
                                // Original center was at snap->x, snap->y
                                // If dx changed sign relative to originally being positive/negative from anchor
                                // we have a flip.
                                
                                // Simpler approach: check if minX/maxX crossed the anchor point
                                // When handle crosses anchor, the "direction" from anchor to current point reverses
                                const bool flippedHorizontally = dx < 0.0f; // Current handle is left of anchor (was right)
                                const bool flippedVertically = dy < 0.0f;   // Current handle is below anchor (was above)
                                
                                // But we need to know the ORIGINAL direction. 
                                // Original handle position relative to anchor determines initial direction.
                                // For resize, anchor is always opposite corner, so:
                                // - If initially dragging from right (handles 1,2), dx starts positive
                                // - If initially dragging from left (handles 0,3), dx starts negative
                                // The initial handleIndex tells us the original direction.
                                
                                // Get the ORIGINAL handleIndex from session start
                                // Since vertexIndex may have changed, we compute original direction from snap geometry
                                const float origCenterX = snap->x; // For Circle/Polygon, snap->x is cx
                                const float origCenterY = snap->y;
                                
                                // The anchor was computed from the OPPOSITE corner of original handle
                                // Anchor position is stored in session_.resizeAnchorX/Y
                                // Original handle was on the opposite side of anchor from current
                                
                                // Simply: if current bbox center is on opposite side of anchor from original center
                                const float newCenterX = (minX + maxX) * 0.5f;
                                const float newCenterY = (minY + maxY) * 0.5f;
                                
                                // Original: center was at origCenterX, anchor at anchorX
                                // If origCenterX was to the left of anchor (origCenterX < anchorX means handle was on left)
                                // and now newCenterX is to the right of anchor (newCenterX > anchorX) -> flipped
                                
                                // Actually even simpler: check if the vector from anchor to center changed direction
                                const float origDeltaX = origCenterX - anchorX;
                                const float origDeltaY = origCenterY - anchorY;
                                const float newDeltaX = newCenterX - anchorX;
                                const float newDeltaY = newCenterY - anchorY;
                                
                                // Flip if sign changed
                                const bool hFlip = (origDeltaX * newDeltaX) < 0.0f;
                                const bool vFlip = (origDeltaY * newDeltaY) < 0.0f;
                                
                                // Apply flips using scale sign
                                float newSx = std::abs(p.sx);
                                float newSy = std::abs(p.sy);
                                
                                if (hFlip) {
                                    newSx = -newSx;
                                }
                                if (vFlip) {
                                    newSy = -newSy;
                                }
                                
                                p.sx = newSx;
                                p.sy = newSy;
                                
                                pickSystem_.update(id, PickSystem::computePolygonAABB(p));
                                refreshEntityRenderRange(id); updated = true; break; 
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

void InteractionSession::commitTransform() {
    if (!session_.active) return;

    snapGuides_.clear();
    recordTransformCommit();
    
    commitResultIds.clear();
    commitResultOpCodes.clear();
    commitResultPayloads.clear();

    if (!session_.dragging) {
        if (session_.historyActive) {
            engine_.discardHistoryEntry();
        }
        session_ = SessionState{};
        return;
    }
    
    std::uint32_t n = static_cast<std::uint32_t>(session_.snapshots.size());
    commitResultIds.reserve(n);
    commitResultOpCodes.reserve(n);
    commitResultPayloads.reserve(n * 4);
    
    // ... Fill commit buffers (simplified copy from engine.cpp) ...
    // Since this buffer logic is identical and long, I'll copy the core parts
    if (session_.mode == TransformMode::Move || session_.mode == TransformMode::EdgeDrag) {
        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            float curX = 0, curY = 0;
            // ... Logic to read Current X/Y from entity ...
            auto it = entityManager_.entities.find(id);
            if (it == entityManager_.entities.end()) continue;
            
            if (it->second.kind == EntityKind::Rect) {
                  for (auto& r : entityManager_.rects) { if (r.id == id) { curX = r.x; curY = r.y; break; } }
             } else if (it->second.kind == EntityKind::Circle) {
                  for (auto& c : entityManager_.circles) { if (c.id == id) { curX = c.cx; curY = c.cy; break; } }
             } else if (it->second.kind == EntityKind::Text) {
                  const TextRec* tr = textSystem_.store.getText(id); if (tr) { curX = tr->x; curY = tr->y; }
             } else if (it->second.kind == EntityKind::Polygon) {
                   for (auto& p : entityManager_.polygons) { if (p.id == id) { curX = p.cx; curY = p.cy; break; } }
             } else if (it->second.kind == EntityKind::Line) {
                 for (auto& l : entityManager_.lines) { if (l.id == id) { curX = l.x0; curY = l.y0; break; } }
             } else if (it->second.kind == EntityKind::Arrow) {
                  for (auto& a : entityManager_.arrows) { if (a.id == id) { curX = a.ax; curY = a.ay; break; } }
             } else if (it->second.kind == EntityKind::Polyline) {
                  for (auto& pl : entityManager_.polylines) { 
                      if (pl.id == id && pl.count > 0) { 
                          curX = entityManager_.points[pl.offset].x; 
                          curY = entityManager_.points[pl.offset].y; 
                          break; 
                      } 
                  }
             }
             
             float origX = snap.points.empty() ? snap.x : snap.points[0].x;
             float origY = snap.points.empty() ? snap.y : snap.points[0].y;
             
             commitResultIds.push_back(id);
             commitResultOpCodes.push_back(static_cast<uint8_t>(TransformOpCode::MOVE));
             commitResultPayloads.push_back(curX - origX);
             commitResultPayloads.push_back(curY - origY);
             commitResultPayloads.push_back(0); commitResultPayloads.push_back(0);
        }
    } else if (session_.mode == TransformMode::Resize) {
        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            auto it = entityManager_.entities.find(id);
            if (it == entityManager_.entities.end()) continue;
            float outX=0,outY=0,outW=0,outH=0;
            // ... Logic to read values ...
             if (it->second.kind == EntityKind::Rect) {
                for (const auto& r : entityManager_.rects) { if(r.id==id){ outX=r.x; outY=r.y; outW=r.w; outH=r.h; break; } }
            } else if (it->second.kind == EntityKind::Circle) {
                for (const auto& c : entityManager_.circles) { if(c.id==id){ outX=c.cx; outY=c.cy; outW=c.rx*2; outH=c.ry*2; break; } }
            } else if (it->second.kind == EntityKind::Polygon) {
                for (const auto& p : entityManager_.polygons) { if(p.id==id){ outX=p.cx; outY=p.cy; outW=p.rx*2; outH=p.ry*2; break; } }
            }
            
            commitResultIds.push_back(id);
            commitResultOpCodes.push_back(static_cast<uint8_t>(TransformOpCode::RESIZE));
            commitResultPayloads.push_back(outX); commitResultPayloads.push_back(outY);
            commitResultPayloads.push_back(outW); commitResultPayloads.push_back(outH);
        }
    }
    // ... VertexDrag logic ... (same pattern)

    if (session_.historyActive) {
        engine_.commitHistoryEntry();
    } else if (!historyManager_.isSuppressed() && !session_.snapshots.empty() && !historyManager_.isTransactionActive()) {
        HistoryEntry entry{};
        entry.nextIdBefore = engine_.state().nextEntityId_;
        entry.nextIdAfter = engine_.state().nextEntityId_;
        for (const auto& snap : session_.snapshots) {
            HistoryEntry::EntityChange change{};
            change.id = snap.id;
            change.existedBefore = true;
            change.before = buildSnapshotFromTransform(snap);
            change.existedAfter = historyManager_.captureEntitySnapshot(snap.id, change.after);
            if (!change.existedBefore && !change.existedAfter) continue;
            entry.entities.push_back(std::move(change));
        }
        if (!entry.entities.empty()) {
            std::sort(entry.entities.begin(), entry.entities.end(), [](const HistoryEntry::EntityChange& a, const HistoryEntry::EntityChange& b) {
                return a.id < b.id;
            });
            engine_.pushHistoryEntry(std::move(entry));
        }
    }

    session_ = SessionState{};
    engine_.state().snapshotDirty = true;
    if (engine_.state().pendingFullRebuild_) {
        engine_.state().renderDirty = true;
    }
}

void InteractionSession::cancelTransform() {
    if (!session_.active) return;

    snapGuides_.clear();
    recordTransformCancel();

    if (session_.historyActive) {
        engine_.discardHistoryEntry();
    }

    if (session_.duplicated) {
        const bool prevSuppressed = historyManager_.isSuppressed();
        historyManager_.setSuppressed(true);
        for (const std::uint32_t id : session_.initialIds) {
            engine_.deleteEntity(id);
        }
        historyManager_.setSuppressed(prevSuppressed);
        engine_.setNextEntityId(session_.nextEntityIdBefore);

        engine_.setSelection(
            session_.originalIds.data(),
            static_cast<std::uint32_t>(session_.originalIds.size()),
            engine::protocol::SelectionMode::Replace);

        session_ = SessionState{};
        engine_.state().renderDirty = true;
        return;
    }

    for (const auto& snap : session_.snapshots) {
        std::uint32_t id = snap.id;
        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Rect) {
             for (auto& r : entityManager_.rects) { if (r.id == id) { r.x = snap.x; r.y = snap.y; r.w = snap.w; r.h = snap.h; pickSystem_.update(id, PickSystem::computeRectAABB(r)); break; } }
        } else if (it->second.kind == EntityKind::Circle) {
             for (auto& c : entityManager_.circles) { if (c.id == id) { c.cx = snap.x; c.cy = snap.y; c.rx = snap.w; c.ry = snap.h; pickSystem_.update(id, PickSystem::computeCircleAABB(c)); break; } }
        } else if (it->second.kind == EntityKind::Polygon) {
             for (auto& p : entityManager_.polygons) { if (p.id == id) { p.cx = snap.x; p.cy = snap.y; p.rx = snap.w; p.ry = snap.h; pickSystem_.update(id, PickSystem::computePolygonAABB(p)); break; } }
        } else if (it->second.kind == EntityKind::Text) {
             TextRec* tr = textSystem_.store.getTextMutable(id);
             if (tr) { 
                 const float offsetMinX = tr->minX - tr->x;
                 const float offsetMinY = tr->minY - tr->y;
                 const float offsetMaxX = tr->maxX - tr->x;
                 const float offsetMaxY = tr->maxY - tr->y;
                 tr->x = snap.x; tr->y = snap.y;
                 tr->minX = tr->x + offsetMinX;
                 tr->minY = tr->y + offsetMinY;
                 tr->maxX = tr->x + offsetMaxX;
                 tr->maxY = tr->y + offsetMaxY;
                 engine_.state().textQuadsDirty_ = true;
                 pickSystem_.update(id, {tr->minX, tr->minY, tr->maxX, tr->maxY});
             }
        } else if (it->second.kind == EntityKind::Polyline) {
             for (auto& pl : entityManager_.polylines) { if (pl.id == id) {
                 for (std::uint32_t k = 0; k < pl.count && k < snap.points.size(); k++) {
                     entityManager_.points[pl.offset + k] = snap.points[k];
                 }
                 pickSystem_.update(id, PickSystem::computePolylineAABB(pl, entityManager_.points));
                 break;
             }}
        } else if (it->second.kind == EntityKind::Line) {
            for (auto& l : entityManager_.lines) { if (l.id == id && snap.points.size() >= 2) {
                l.x0 = snap.points[0].x; l.y0 = snap.points[0].y; l.x1 = snap.points[1].x; l.y1 = snap.points[1].y;
                pickSystem_.update(id, PickSystem::computeLineAABB(l));
                break;
            }}
        } else if (it->second.kind == EntityKind::Arrow) {
            for (auto& a : entityManager_.arrows) { if (a.id == id && snap.points.size() >= 2) {
                a.ax = snap.points[0].x; a.ay = snap.points[0].y; a.bx = snap.points[1].x; a.by = snap.points[1].y;
                pickSystem_.update(id, PickSystem::computeArrowAABB(a));
                break;
            }}
        }
        refreshEntityRenderRange(id);
    }

    session_ = SessionState{};
    engine_.state().renderDirty = true;
}

// ==============================================================================
// Draft Implementation (Phantom Entity System)
// ==============================================================================
// The draft system now creates a real temporary entity (phantom) with a reserved ID
// that gets rendered by the normal render pipeline. This ensures consistent visuals
// between draft preview and final entity.

void InteractionSession::beginDraft(const BeginDraftPayload& p) {
    // Cancel any existing draft first
    if (draft_.active) {
        removePhantomEntity();
    }
    
    draft_.active = true;
    draft_.kind = p.kind;
    draft_.startX = p.x;
    draft_.startY = p.y;
    draft_.currentX = p.x;
    draft_.currentY = p.y;
    draft_.fillR = p.fillR; draft_.fillG = p.fillG; draft_.fillB = p.fillB; draft_.fillA = p.fillA;
    draft_.strokeR = p.strokeR; draft_.strokeG = p.strokeG; draft_.strokeB = p.strokeB; draft_.strokeA = p.strokeA;
    draft_.strokeEnabled = p.strokeEnabled;
    draft_.strokeWidthPx = p.strokeWidthPx;
    draft_.sides = p.sides;
    draft_.head = p.head;
    draft_.points.clear();
    
    if (p.kind == static_cast<std::uint32_t>(EntityKind::Polyline)) {
        draft_.points.push_back({p.x, p.y});
    }
    
    // Create the phantom entity for immediate visual feedback
    upsertPhantomEntity();
    engine_.state().renderDirty = true;
}

void InteractionSession::updateDraft(float x, float y, std::uint32_t modifiers) {
    if (!draft_.active) return;
    const bool shiftDown = (modifiers & kShiftMask) != 0;
    if (shiftDown) {
        auto snapAngle = [&](float anchorX, float anchorY) {
            const float vecX = x - anchorX;
            const float vecY = y - anchorY;
            const float len = std::sqrt(vecX * vecX + vecY * vecY);
            if (len <= 1e-6f) return;
            constexpr float kPi = 3.14159265358979323846f;
            constexpr float kStep = kPi * 0.25f;
            const float angle = std::atan2(vecY, vecX);
            const float snapped = std::round(angle / kStep) * kStep;
            x = anchorX + std::cos(snapped) * len;
            y = anchorY + std::sin(snapped) * len;
        };

        if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Line)) {
            snapAngle(draft_.startX, draft_.startY);
        } else if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Polyline) && !draft_.points.empty()) {
            const Point2& anchor = draft_.points.back();
            snapAngle(anchor.x, anchor.y);
        }
    }
    draft_.currentX = x;
    draft_.currentY = y;
    
    // Update the phantom entity to reflect new position
    upsertPhantomEntity();
    engine_.state().renderDirty = true;
}

void InteractionSession::appendDraftPoint(float x, float y, std::uint32_t modifiers) {
    if (!draft_.active) return;
    const bool shiftDown = (modifiers & kShiftMask) != 0;
    if (shiftDown && draft_.kind == static_cast<std::uint32_t>(EntityKind::Polyline) && !draft_.points.empty()) {
        const Point2& anchor = draft_.points.back();
        const float vecX = x - anchor.x;
        const float vecY = y - anchor.y;
        const float len = std::sqrt(vecX * vecX + vecY * vecY);
        if (len > 1e-6f) {
            constexpr float kPi = 3.14159265358979323846f;
            constexpr float kStep = kPi * 0.25f;
            const float angle = std::atan2(vecY, vecX);
            const float snapped = std::round(angle / kStep) * kStep;
            x = anchor.x + std::cos(snapped) * len;
            y = anchor.y + std::sin(snapped) * len;
        }
    }
    draft_.points.push_back({x, y});
    draft_.currentX = x; 
    draft_.currentY = y;
    
    // Update phantom entity with new point
    upsertPhantomEntity();
    engine_.state().renderDirty = true;
}

std::uint32_t InteractionSession::commitDraft() {
    if (!draft_.active) return 0;
    
    // Remove the phantom entity first
    removePhantomEntity();
    
    // Allocate a real entity ID
    const std::uint32_t id = engine_.allocateEntityId();
    
    // Create the final entity via CadEngine (which handles history)
    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Rect: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            if (w > 0.001f && h > 0.001f)
                engine_.upsertRect(id, x0, y0, w, h, draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Line:
            engine_.upsertLine(id, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        case EntityKind::Circle: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            if (w > 0.001f && h > 0.001f)
                engine_.upsertCircle(id, x0 + w/2, y0 + h/2, w/2, h/2, 0, 1, 1, draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Polygon: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            if (w > 0.001f && h > 0.001f) {
                float rot = (draft_.sides == 3) ? 3.14159f : 0.0f;
                engine_.upsertPolygon(id, x0 + w/2, y0 + h/2, w/2, h/2, rot, 1, 1, static_cast<std::uint32_t>(draft_.sides), draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            }
            break;
        }
        case EntityKind::Polyline: {
            if (draft_.points.size() < 2) break;
            std::uint32_t offset = static_cast<std::uint32_t>(entityManager_.points.size());
            for (const auto& p : draft_.points) {
                entityManager_.points.push_back({p.x, p.y});
            }
            engine_.upsertPolyline(id, offset, static_cast<std::uint32_t>(draft_.points.size()), draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Arrow: {
            engine_.upsertArrow(id, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY, draft_.head, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Text: break;
    }

    // If we just committed a polyline, the phantom entity points generated during draft
    // are now garbage (the new entity has its own fresh points).
    // We must compact to avoid leaking thousands of points in the active session.
    if (static_cast<EntityKind>(draft_.kind) == EntityKind::Polyline) {
        engine_.compactPolylinePoints();
    }

    // Auto-select the newly created entity
    engine_.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    draft_.active = false;
    draft_.points.clear();
    engine_.state().renderDirty = true;
    return id;
}

void InteractionSession::cancelDraft() {
    if (!draft_.active) return;
    
    removePhantomEntity();
    
    // If we cancelled a polyline, the phantom points are garbage.
    if (static_cast<EntityKind>(draft_.kind) == EntityKind::Polyline) {
        engine_.compactPolylinePoints();
    }
    
    draft_.active = false;
    draft_.points.clear();
    engine_.state().renderDirty = true;
}

void InteractionSession::appendDraftLineVertices(std::vector<float>& lineVertices) const {
    if (!draft_.active) return;

    const bool useStroke = draft_.strokeEnabled > 0.5f;
    const float r = useStroke ? draft_.strokeR : draft_.fillR;
    const float g = useStroke ? draft_.strokeG : draft_.fillG;
    const float b = useStroke ? draft_.strokeB : draft_.fillB;
    const float a = useStroke ? draft_.strokeA : draft_.fillA;
    if (!(a > 0.0f)) return;

    struct Segment {
        float x0;
        float y0;
        float x1;
        float y1;
    };

    std::vector<Segment> segments;
    segments.reserve(8); // small shapes cap; polyline will grow below as needed

    constexpr float pi = 3.14159265358979323846f;
    constexpr float twoPi = pi * 2.0f;

    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Line:
        case EntityKind::Arrow: {
            segments.push_back({draft_.startX, draft_.startY, draft_.currentX, draft_.currentY});
            break;
        }
        case EntityKind::Polyline: {
            if (draft_.points.empty()) {
                segments.push_back({draft_.startX, draft_.startY, draft_.currentX, draft_.currentY});
                break;
            }
            Point2 prev = draft_.points.front();
            for (std::size_t i = 1; i < draft_.points.size(); i++) {
                const Point2& curr = draft_.points[i];
                segments.push_back({prev.x, prev.y, curr.x, curr.y});
                prev = curr;
            }
            segments.push_back({prev.x, prev.y, draft_.currentX, draft_.currentY});
            break;
        }
        case EntityKind::Rect: {
            const float x0 = std::min(draft_.startX, draft_.currentX);
            const float y0 = std::min(draft_.startY, draft_.currentY);
            const float x1 = std::max(draft_.startX, draft_.currentX);
            const float y1 = std::max(draft_.startY, draft_.currentY);
            segments.push_back({x0, y0, x1, y0});
            segments.push_back({x1, y0, x1, y1});
            segments.push_back({x1, y1, x0, y1});
            segments.push_back({x0, y1, x0, y0});
            break;
        }
        case EntityKind::Polygon: {
            const std::uint32_t sides = std::max<std::uint32_t>(3u, static_cast<std::uint32_t>(draft_.sides));
            if (sides < 3) break;
            const float rx = std::abs(draft_.currentX - draft_.startX) * 0.5f;
            const float ry = std::abs(draft_.currentY - draft_.startY) * 0.5f;
            if (!(rx > 0.0f) || !(ry > 0.0f)) break;
            const float cx = (draft_.startX + draft_.currentX) * 0.5f;
            const float cy = (draft_.startY + draft_.currentY) * 0.5f;
            const float rot = (sides == 3) ? pi : 0.0f;

            Point2 first{};
            Point2 prev{};
            for (std::uint32_t i = 0; i < sides; ++i) {
                const float t =
                    (static_cast<float>(i) / static_cast<float>(sides)) * twoPi - (pi * 0.5f) + rot;
                const float x = cx + std::cos(t) * rx;
                const float y = cy + std::sin(t) * ry;
                const Point2 curr{x, y};
                if (i == 0) {
                    first = curr;
                } else {
                    segments.push_back({prev.x, prev.y, curr.x, curr.y});
                }
                prev = curr;
            }
            segments.push_back({prev.x, prev.y, first.x, first.y});
            break;
        }
        case EntityKind::Circle: {
            const float rx = std::abs(draft_.currentX - draft_.startX) * 0.5f;
            const float ry = std::abs(draft_.currentY - draft_.startY) * 0.5f;
            if (!(rx > 0.0f) || !(ry > 0.0f)) break;
            const float cx = (draft_.startX + draft_.currentX) * 0.5f;
            const float cy = (draft_.startY + draft_.currentY) * 0.5f;
            constexpr std::uint32_t segmentCount = 64;

            Point2 first{};
            Point2 prev{};
            for (std::uint32_t i = 0; i < segmentCount; ++i) {
                const float t = (static_cast<float>(i) / static_cast<float>(segmentCount)) * twoPi;
                const float x = cx + std::cos(t) * rx;
                const float y = cy + std::sin(t) * ry;
                const Point2 curr{x, y};
                if (i == 0) {
                    first = curr;
                } else {
                    segments.push_back({prev.x, prev.y, curr.x, curr.y});
                }
                prev = curr;
            }
            segments.push_back({prev.x, prev.y, first.x, first.y});
            break;
        }
        default:
            break;
    }

    if (segments.empty()) {
        return;
    }

    constexpr std::size_t floatsPerVertex = 7;
    lineVertices.reserve(lineVertices.size() + segments.size() * 2 * floatsPerVertex);

    auto pushVertex = [&](float x, float y) {
        lineVertices.push_back(x);
        lineVertices.push_back(y);
        lineVertices.push_back(0.0f);
        lineVertices.push_back(r);
        lineVertices.push_back(g);
        lineVertices.push_back(b);
        lineVertices.push_back(a);
    };

    for (const auto& seg : segments) {
        pushVertex(seg.x0, seg.y0);
        pushVertex(seg.x1, seg.y1);
    }
}

// ==============================================================================
// Phantom Entity Helpers
// ==============================================================================

void InteractionSession::upsertPhantomEntity() {
    if (!draft_.active) return;
    
    const std::uint32_t phantomId = DRAFT_ENTITY_ID;
    
    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Rect: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            // Always create, even if small (will be filtered at commit)
            entityManager_.upsertRect(phantomId, x0, y0, std::max(w, 0.1f), std::max(h, 0.1f), 
                draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA, 
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, 
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Line: {
            entityManager_.upsertLine(phantomId, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY, 
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, 
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Circle: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            entityManager_.upsertCircle(phantomId, x0 + w/2, y0 + h/2, std::max(w/2, 0.1f), std::max(h/2, 0.1f), 0, 1, 1,
                draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA,
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Polygon: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            float rot = (draft_.sides == 3) ? 3.14159f : 0.0f;
            entityManager_.upsertPolygon(phantomId, x0 + w/2, y0 + h/2, std::max(w/2, 0.1f), std::max(h/2, 0.1f), rot, 1, 1,
                static_cast<std::uint32_t>(draft_.sides),
                draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA,
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Polyline: {
            // For polyline, we need to handle the points specially
            // First, find and remove any existing phantom polyline points
            auto it = entityManager_.entities.find(phantomId);
            if (it != entityManager_.entities.end() && it->second.kind == EntityKind::Polyline) {
                // Remove old polyline - points will be orphaned but that's ok for phantom
            }
            
            // Calculate how many points we have (draft points + current cursor)
            size_t totalPoints = draft_.points.size() + 1; // +1 for current position
            if (totalPoints < 2) {
                totalPoints = 2; // Need at least 2 for a valid polyline
            }
            
            // Use a reserved area at the end of points for phantom
            // This is a simplification - in production you'd want proper point management
            std::uint32_t offset = static_cast<std::uint32_t>(entityManager_.points.size());
            for (const auto& p : draft_.points) {
                entityManager_.points.push_back({p.x, p.y});
            }
            // Add current cursor position
            entityManager_.points.push_back({draft_.currentX, draft_.currentY});
            
            entityManager_.upsertPolyline(phantomId, offset, static_cast<std::uint32_t>(totalPoints),
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Arrow: {
            entityManager_.upsertArrow(phantomId, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY,
                draft_.head, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Text: break;
    }
    
    // Remove phantom entity from draw order - it should not be included in normal draw order
    // (it's rendered separately, at the end, on top of all other entities)
    auto& drawOrder = entityManager_.drawOrderIds;
    for (auto it = drawOrder.begin(); it != drawOrder.end(); ++it) {
        if (*it == phantomId) {
            drawOrder.erase(it);
            break;
        }
    }
}

void InteractionSession::removePhantomEntity() {
    const std::uint32_t phantomId = DRAFT_ENTITY_ID;
    
    // Simply delete the phantom entity from the entity manager
    entityManager_.deleteEntity(phantomId);
    
    // Trigger a full rebuild since we removed an entity
    engine_.state().renderDirty = true;
}

DraftDimensions InteractionSession::getDraftDimensions() const {
    DraftDimensions dims{};
    dims.active = draft_.active;
    dims.kind = draft_.kind;
    
    if (!draft_.active) {
        return dims;
    }
    
    // Calculate bounding box based on entity kind
    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Rect:
        case EntityKind::Circle:
        case EntityKind::Polygon: {
            dims.minX = std::min(draft_.startX, draft_.currentX);
            dims.minY = std::min(draft_.startY, draft_.currentY);
            dims.maxX = std::max(draft_.startX, draft_.currentX);
            dims.maxY = std::max(draft_.startY, draft_.currentY);
            break;
        }
        case EntityKind::Line:
        case EntityKind::Arrow: {
            dims.minX = std::min(draft_.startX, draft_.currentX);
            dims.minY = std::min(draft_.startY, draft_.currentY);
            dims.maxX = std::max(draft_.startX, draft_.currentX);
            dims.maxY = std::max(draft_.startY, draft_.currentY);
            break;
        }
        case EntityKind::Polyline: {
            if (draft_.points.empty()) {
                dims.minX = dims.minY = dims.maxX = dims.maxY = 0;
            } else {
                dims.minX = dims.maxX = draft_.points[0].x;
                dims.minY = dims.maxY = draft_.points[0].y;
                for (const auto& p : draft_.points) {
                    dims.minX = std::min(dims.minX, p.x);
                    dims.minY = std::min(dims.minY, p.y);
                    dims.maxX = std::max(dims.maxX, p.x);
                    dims.maxY = std::max(dims.maxY, p.y);
                }
                // Include current cursor position
                dims.minX = std::min(dims.minX, draft_.currentX);
                dims.minY = std::min(dims.minY, draft_.currentY);
                dims.maxX = std::max(dims.maxX, draft_.currentX);
                dims.maxY = std::max(dims.maxY, draft_.currentY);
            }
            break;
        }
        default:
            break;
    }
    
    dims.width = dims.maxX - dims.minX;
    dims.height = dims.maxY - dims.minY;
    dims.centerX = (dims.minX + dims.maxX) / 2.0f;
    dims.centerY = (dims.minY + dims.maxY) / 2.0f;
    
    return dims;
}
