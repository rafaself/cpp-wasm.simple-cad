// engine_upsert.cpp - Entity upsert operations for CadEngine
// This file provides implementations of all upsertXxx() methods.
// Separated from main engine.cpp to reduce file size per SRP guidelines.

#include "engine/engine.h"
#include "engine/internal/engine_state.h"

namespace {
    void initShapeStyleOverrides(EntityManager& em, std::uint32_t id, bool hasFill, bool hasStroke, float fillEnabled) {
        EntityStyleOverrides& overrides = em.ensureEntityStyleOverrides(id);
        overrides.colorMask = 0;
        overrides.enabledMask = 0;
        const std::uint8_t strokeBit = EntityManager::styleTargetMask(StyleTarget::Stroke);
        const std::uint8_t fillBit = EntityManager::styleTargetMask(StyleTarget::Fill);
        if (hasFill) {
            overrides.colorMask |= fillBit;
            overrides.enabledMask |= fillBit;
            overrides.fillEnabled = fillEnabled;
        }
        if (hasStroke) {
            overrides.colorMask |= strokeBit;
            overrides.enabledMask |= strokeBit;
        }
    }
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a) {
    upsertRect(id, x, y, w, h, r, g, b, a, r, g, b, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx, float elevationZ) {
    const bool historyStarted = beginHistoryEntry();
    state().renderDirty = true;
    state().snapshotDirty = true;
    trackNextEntityId(id);
    const auto it = state().entityManager_.entities.find(id);
    const bool isNew = (it == state().entityManager_.entities.end());
    const bool willChangeOrder = isNew || (it->second.kind != EntityKind::Rect);
    if (willChangeOrder) {
        markDrawOrderChange();
    }
    markEntityChange(id);
    state().entityManager_.upsertRect(id, x, y, w, h, r, g, b, a, sr, sg, sb, sa, strokeEnabled, strokeWidthPx, elevationZ);
    if (isNew) {
        initShapeStyleOverrides(state().entityManager_, id, true, true, a > 0.5f ? 1.0f : 0.0f);
    }

    RectRec rec{}; rec.x = x; rec.y = y; rec.w = w; rec.h = h;
    state().pickSystem_.update(id, PickSystem::computeRectAABB(rec));
    if (isNew) state().pickSystem_.setZ(id, state().pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Rect));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    }
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
    upsertLine(id, x0, y0, x1, y1, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx, float elevationZ) {
    const bool historyStarted = beginHistoryEntry();
    state().renderDirty = true;
    state().snapshotDirty = true;
    trackNextEntityId(id);
    const auto it = state().entityManager_.entities.find(id);
    const bool isNew = (it == state().entityManager_.entities.end());
    const bool willChangeOrder = isNew || (it->second.kind != EntityKind::Line);
    if (willChangeOrder) {
        markDrawOrderChange();
    }
    markEntityChange(id);
    state().entityManager_.upsertLine(id, x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx, elevationZ);
    if (isNew) {
        initShapeStyleOverrides(state().entityManager_, id, false, true, 0.0f);
    }

    LineRec rec{}; rec.x0 = x0; rec.y0 = y0; rec.x1 = x1; rec.y1 = y1;
    state().pickSystem_.update(id, PickSystem::computeLineAABB(rec));
    if (isNew) state().pickSystem_.setZ(id, state().pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Line));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    }
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
    upsertPolyline(id, offset, count, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx, float elevationZ) {
    const bool historyStarted = beginHistoryEntry();
    state().renderDirty = true;
    state().snapshotDirty = true;
    trackNextEntityId(id);
    const auto it = state().entityManager_.entities.find(id);
    const bool isNew = (it == state().entityManager_.entities.end());
    const bool willChangeOrder = isNew || (it->second.kind != EntityKind::Polyline);
    if (willChangeOrder) {
        markDrawOrderChange();
    }
    markEntityChange(id);
    state().entityManager_.upsertPolyline(id, offset, count, r, g, b, a, enabled, strokeWidthPx, elevationZ);
    if (isNew) {
        initShapeStyleOverrides(state().entityManager_, id, false, true, 0.0f);
    }

    PolyRec rec{}; rec.offset = offset; rec.count = count;
    state().pickSystem_.update(id, PickSystem::computePolylineAABB(rec, state().entityManager_.points));
    if (isNew) state().pickSystem_.setZ(id, state().pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Polyline));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    }
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::upsertCircle(
    std::uint32_t id,
    float cx,
    float cy,
    float rx,
    float ry,
    float rot,
    float sx,
    float sy,
    float fillR,
    float fillG,
    float fillB,
    float fillA,
    float strokeR,
    float strokeG,
    float strokeB,
    float strokeA,
    float strokeEnabled,
    float strokeWidthPx
) {
    const bool historyStarted = beginHistoryEntry();
    state().renderDirty = true;
    state().snapshotDirty = true;
    trackNextEntityId(id);
    const auto it = state().entityManager_.entities.find(id);
    const bool isNew = (it == state().entityManager_.entities.end());
    const bool willChangeOrder = isNew || (it->second.kind != EntityKind::Circle);
    if (willChangeOrder) {
        markDrawOrderChange();
    }
    markEntityChange(id);
    state().entityManager_.upsertCircle(id, cx, cy, rx, ry, rot, sx, sy, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx, elevationZ);
    if (isNew) {
        initShapeStyleOverrides(state().entityManager_, id, true, true, fillA > 0.5f ? 1.0f : 0.0f);
    }

    CircleRec rec{}; rec.cx = cx; rec.cy = cy; rec.rx = rx; rec.ry = ry; rec.rot = rot; rec.sx = sx; rec.sy = sy;
    state().pickSystem_.update(id, PickSystem::computeCircleAABB(rec));
    if (isNew) state().pickSystem_.setZ(id, state().pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Circle));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    }
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::upsertPolygon(
    std::uint32_t id,
    float cx,
    float cy,
    float rx,
    float ry,
    float rot,
    float sx,
    float sy,
    std::uint32_t sides,
    float fillR,
    float fillG,
    float fillB,
    float fillA,
    float strokeR,
    float strokeG,
    float strokeB,
    float strokeA,
    float strokeEnabled,
    float strokeWidthPx
) {
    const bool historyStarted = beginHistoryEntry();
    state().renderDirty = true;
    state().snapshotDirty = true;
    trackNextEntityId(id);
    const auto it = state().entityManager_.entities.find(id);
    const bool isNew = (it == state().entityManager_.entities.end());
    const bool willChangeOrder = isNew || (it->second.kind != EntityKind::Polygon);
    if (willChangeOrder) {
        markDrawOrderChange();
    }
    markEntityChange(id);
    state().entityManager_.upsertPolygon(id, cx, cy, rx, ry, rot, sx, sy, sides, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx, elevationZ);
    if (isNew) {
        initShapeStyleOverrides(state().entityManager_, id, true, true, fillA > 0.5f ? 1.0f : 0.0f);
    }

    PolygonRec rec{}; rec.cx = cx; rec.cy = cy; rec.rx = rx; rec.ry = ry; rec.rot = rot; rec.sx = sx; rec.sy = sy; rec.sides = sides;
    state().pickSystem_.update(id, PickSystem::computePolygonAABB(rec));
    if (isNew) state().pickSystem_.setZ(id, state().pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Polygon));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    }
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::upsertArrow(
    std::uint32_t id,
    float ax,
    float ay,
    float bx,
    float by,
    float head,
    float strokeR,
    float strokeG,
    float strokeB,
    float strokeA,
    float strokeEnabled,
    float strokeWidthPx
) {
    const bool historyStarted = beginHistoryEntry();
    state().renderDirty = true;
    state().snapshotDirty = true;
    trackNextEntityId(id);
    const auto it = state().entityManager_.entities.find(id);
    const bool isNew = (it == state().entityManager_.entities.end());
    const bool willChangeOrder = isNew || (it->second.kind != EntityKind::Arrow);
    if (willChangeOrder) {
        markDrawOrderChange();
    }
    markEntityChange(id);
    state().entityManager_.upsertArrow(id, ax, ay, bx, by, head, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx, elevationZ);
    if (isNew) {
        initShapeStyleOverrides(state().entityManager_, id, false, true, 0.0f);
    }

    ArrowRec rec{}; rec.ax = ax; rec.ay = ay; rec.bx = bx; rec.by = by; rec.head = head;
    state().pickSystem_.update(id, PickSystem::computeArrowAABB(rec));
    if (isNew) state().pickSystem_.setZ(id, state().pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Arrow));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    }
    if (historyStarted) commitHistoryEntry();
}
