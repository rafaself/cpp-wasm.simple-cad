#include "engine/interaction_session.h"
#include "engine/engine.h"
#include "engine/history_manager.h"
#include "engine/text_system.h"
#include <cmath>
#include <algorithm>
#include <cstring>

InteractionSession::InteractionSession(CadEngine& engine, EntityManager& entityManager, PickSystem& pickSystem, TextSystem& textSystem, HistoryManager& historyManager)
    : engine_(engine), entityManager_(entityManager), pickSystem_(pickSystem), textSystem_(textSystem), historyManager_(historyManager)
{
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

void InteractionSession::beginTransform(
    const std::uint32_t* ids, 
    std::uint32_t idCount, 
    TransformMode mode, 
    std::uint32_t specificId, 
    int32_t vertexIndex, 
    float startX, 
    float startY
) {
    if (session_.active) return;
    
    session_.active = true;
    session_.mode = mode;
    session_.initialIds.clear();
    session_.snapshots.clear();
    session_.specificId = specificId;
    session_.vertexIndex = vertexIndex;
    session_.startX = startX;
    session_.startY = startY;

    std::vector<std::uint32_t> activeIds;

    if (mode != TransformMode::Move && specificId != 0) {
        if (!entityManager_.isEntityPickable(specificId)) {
            session_.active = false;
            return;
        }
        activeIds.push_back(specificId);
    } else if (!engine_.selectionManager_.isEmpty()) {
        activeIds = engine_.selectionManager_.getOrdered();
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
    }
}

void InteractionSession::updateTransform(float worldX, float worldY) {
    if (!session_.active) return;

    // Apply Snapping
    if (snapOptions.enabled && snapOptions.gridEnabled && snapOptions.gridSize > 0.0001f) {
        float s = snapOptions.gridSize;
        worldX = std::round(worldX / s) * s;
        worldY = std::round(worldY / s) * s;
    }

    bool updated = false;
    float totalDx = worldX - session_.startX;
    float totalDy = worldY - session_.startY;
    
    if (session_.mode == TransformMode::Move) {
        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            auto it = entityManager_.entities.find(id);
            if (it == entityManager_.entities.end()) continue;
             
            if (it->second.kind == EntityKind::Rect) {
                  for (auto& r : entityManager_.rects) { 
                      if (r.id == id) { 
                          r.x = snap.x + totalDx; r.y = snap.y + totalDy; 
                          refreshEntityRenderRange(id); updated = true; break; 
                      } 
                  }
            } else if (it->second.kind == EntityKind::Circle) {
                  for (auto& c : entityManager_.circles) { 
                      if (c.id == id) { 
                          c.cx = snap.x + totalDx; c.cy = snap.y + totalDy; 
                          refreshEntityRenderRange(id); updated = true; break; 
                      } 
                  }
            } else if (it->second.kind == EntityKind::Polygon) {
                  for (auto& p : entityManager_.polygons) { 
                      if (p.id == id) { 
                          p.cx = snap.x + totalDx; p.cy = snap.y + totalDy; 
                          refreshEntityRenderRange(id); updated = true; break; 
                      } 
                  }
            } else if (it->second.kind == EntityKind::Text) {
                  TextRec* tr = textSystem_.store.getTextMutable(id); 
                  if (tr) {
                       tr->x = snap.x + totalDx; tr->y = snap.y + totalDy;
                       engine_.textQuadsDirty_ = true;
                       float minX, minY, maxX, maxY;
                       if (textSystem_.getBounds(id, minX, minY, maxX, maxY)) {
                           pickSystem_.update(id, {minX, minY, maxX, maxY});
                       }
                       updated = true;
                   }
            } else if (it->second.kind == EntityKind::Line) {
                 if (snap.points.size() >= 2) {
                     for (auto& l : entityManager_.lines) { 
                         if (l.id == id) { 
                             l.x0 = snap.points[0].x + totalDx; l.y0 = snap.points[0].y + totalDy; 
                             l.x1 = snap.points[1].x + totalDx; l.y1 = snap.points[1].y + totalDy; 
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
                                  float nx = snap->points[idx].x + totalDx;
                                  float ny = snap->points[idx].y + totalDy;
                                  entityManager_.points[pl.offset + idx].x = nx;
                                  entityManager_.points[pl.offset + idx].y = ny;
                                  refreshEntityRenderRange(id); updated = true;
                              }
                              break;
                          }
                      }
                 } else if (it->second.kind == EntityKind::Line) {
                      for (auto& l : entityManager_.lines) {
                          if (l.id == id) {
                              if (idx == 0 && snap->points.size() > 0) {
                                  l.x0 = snap->points[0].x + totalDx; l.y0 = snap->points[0].y + totalDy;
                                  refreshEntityRenderRange(id); updated = true;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  l.x1 = snap->points[1].x + totalDx; l.y1 = snap->points[1].y + totalDy;
                                  refreshEntityRenderRange(id); updated = true;
                              }
                              break;
                          }
                      }
                 } else if (it->second.kind == EntityKind::Arrow) {
                      for (auto& a : entityManager_.arrows) {
                          if (a.id == id) {
                              if (idx == 0 && snap->points.size() > 0) {
                                  a.ax = snap->points[0].x + totalDx; a.ay = snap->points[0].y + totalDy;
                                  refreshEntityRenderRange(id); updated = true;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  a.bx = snap->points[1].x + totalDx; a.by = snap->points[1].y + totalDy;
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
        const int32_t handleIndex = session_.vertexIndex;
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
                    float anchorX = 0, anchorY = 0;
                    switch (handleIndex) {
                        case 0: anchorX = origMaxX; anchorY = origMaxY; break;
                        case 1: anchorX = origMinX; anchorY = origMaxY; break;
                        case 2: anchorX = origMinX; anchorY = origMinY; break;
                        case 3: anchorX = origMaxX; anchorY = origMinY; break;
                    }

                    const float minX = std::min(anchorX, worldX);
                    const float maxX = std::max(anchorX, worldX);
                    const float minY = std::min(anchorY, worldY);
                    const float maxY = std::max(anchorY, worldY);
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
                                p.cx = (minX + maxX) * 0.5f; p.cy = (minY + maxY) * 0.5f; p.rx = w * 0.5f; p.ry = h * 0.5f;
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
        engine_.generation++;
    }
}

void InteractionSession::commitTransform() {
    if (!session_.active) return;
    
    commitResultIds.clear();
    commitResultOpCodes.clear();
    commitResultPayloads.clear();
    
    std::uint32_t n = static_cast<std::uint32_t>(session_.snapshots.size());
    commitResultIds.reserve(n);
    commitResultOpCodes.reserve(n);
    commitResultPayloads.reserve(n * 4);
    
    // ... Fill commit buffers (simplified copy from engine.cpp) ...
    // Since this buffer logic is identical and long, I'll copy the core parts
    if (session_.mode == TransformMode::Move) {
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

    if (!historyManager_.isSuppressed() && !session_.snapshots.empty() && !historyManager_.isTransactionActive()) {
        HistoryEntry entry{};
        entry.nextIdBefore = engine_.nextEntityId_;
        entry.nextIdAfter = engine_.nextEntityId_;
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
            historyManager_.pushHistoryEntry(std::move(entry));
        }
    }

    session_ = SessionState{};
    engine_.snapshotDirty = true;
    if (engine_.pendingFullRebuild_) {
        engine_.renderDirty = true;
    }
}

void InteractionSession::cancelTransform() {
    if (!session_.active) return;
    
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
             if (tr) { tr->x = snap.x; tr->y = snap.y; engine_.textQuadsDirty_ = true;
                 float minX, minY, maxX, maxY;
                 if (textSystem_.getBounds(id, minX, minY, maxX, maxY)) { pickSystem_.update(id, {minX, minY, maxX, maxY}); }
             }
        } else if (it->second.kind == EntityKind::Polyline) {
             for (auto& pl : entityManager_.polylines) { if (pl.id == id) {
                 for (std::uint32_t k = 0; k < pl.count && k < snap.points.size(); k++) {
                     entityManager_.points[pl.offset + k] = snap.points[k];
                 }
                 break;
             }}
        } else if (it->second.kind == EntityKind::Line) {
            for (auto& l : entityManager_.lines) { if (l.id == id && snap.points.size() >= 2) {
                l.x0 = snap.points[0].x; l.y0 = snap.points[0].y; l.x1 = snap.points[1].x; l.y1 = snap.points[1].y; break;
            }}
        } else if (it->second.kind == EntityKind::Arrow) {
            for (auto& a : entityManager_.arrows) { if (a.id == id && snap.points.size() >= 2) {
                a.ax = snap.points[0].x; a.ay = snap.points[0].y; a.bx = snap.points[1].x; a.by = snap.points[1].y; break;
            }}
        }
        refreshEntityRenderRange(id);
    }

    session_ = SessionState{};
    engine_.renderDirty = true;
}

// Draft Implementation

void InteractionSession::beginDraft(const BeginDraftPayload& p) {
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
    engine_.renderDirty = true;
}

void InteractionSession::updateDraft(float x, float y) {
    if (!draft_.active) return;
    draft_.currentX = x;
    draft_.currentY = y;
    engine_.renderDirty = true;
}

void InteractionSession::appendDraftPoint(float x, float y) {
    if (!draft_.active) return;
    draft_.points.push_back({x, y});
    draft_.currentX = x; 
    draft_.currentY = y;
    engine_.renderDirty = true;
}

std::uint32_t InteractionSession::commitDraft() {
    if (!draft_.active) return 0;
    
    const std::uint32_t id = engine_.allocateEntityId();
    
    // Delegate creation to engine methods (simplest integration)
    // Or call entityManager directly? Creating entities via Engine methods handles history/recording automatically.
    // It's better to use CadEngine public methods for upserting, to keep things consistent.
    
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
             if (draft_.points.size() < 2) break; // Need at least 2 points
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

    draft_.active = false;
    draft_.points.clear();
    return id;
}

void InteractionSession::cancelDraft() {
    draft_.active = false;
    draft_.points.clear();
    engine_.renderDirty = true;
}

void InteractionSession::addDraftToBuffers(std::vector<float>& lineVertices) {
    if (!draft_.active) return;
    
    auto pushL = [&](float x0, float y0, float x1, float y1) {
        lineVertices.push_back(x0); lineVertices.push_back(y0); lineVertices.push_back(0); 
        lineVertices.push_back(draft_.strokeR); lineVertices.push_back(draft_.strokeG); lineVertices.push_back(draft_.strokeB); lineVertices.push_back(1.0f); 
    };
    
    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Line:
        case EntityKind::Arrow:
            pushL(draft_.startX, draft_.startY, draft_.currentX, draft_.currentY);
            break;
        case EntityKind::Rect:
        case EntityKind::Circle:
        case EntityKind::Polygon: {
             float x0 = std::min(draft_.startX, draft_.currentX);
             float y0 = std::min(draft_.startY, draft_.currentY);
             float w = std::abs(draft_.currentX - draft_.startX);
             float h = std::abs(draft_.currentY - draft_.startY);
             if (static_cast<EntityKind>(draft_.kind) == EntityKind::Rect) {
                  pushL(x0, y0, x0+w, y0);
                  pushL(x0+w, y0, x0+w, y0+h);
                  pushL(x0+w, y0+h, x0, y0+h);
                  pushL(x0, y0+h, x0, y0);
             } else {
                  pushL(x0, y0, x0+w, y0);
                  pushL(x0+w, y0, x0+w, y0+h);
                  pushL(x0+w, y0+h, x0, y0+h);
                  pushL(x0, y0+h, x0, y0);
             }
             break;
        }
        case EntityKind::Polyline: {
             if (draft_.points.empty()) break;
             for (size_t i = 0; i < draft_.points.size() - 1; ++i) {
                 pushL(draft_.points[i].x, draft_.points[i].y, draft_.points[i+1].x, draft_.points[i+1].y);
             }
             if (!draft_.points.empty()) {
                  pushL(draft_.points.back().x, draft_.points.back().y, draft_.currentX, draft_.currentY);
             }
             break;
        }
        default: break;
    }
}
