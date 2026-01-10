// CadEngine overlay methods - selection outline and handle state().generation
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state.h"

engine::protocol::OverlayBufferMeta CadEngine::getSelectionOutlineMeta() const {
    state().selectionOutlinePrimitives_.clear();
    state().selectionOutlineData_.clear();

    auto pushPrimitive = [&](engine::protocol::OverlayKind kind, std::uint32_t count) {
        const std::uint32_t offset = static_cast<std::uint32_t>(state().selectionOutlineData_.size());
        state().selectionOutlinePrimitives_.push_back(engine::protocol::OverlayPrimitive{
            static_cast<std::uint16_t>(kind),
            0,
            count,
            offset
        });
    };

    for (const std::uint32_t id : state().selectionManager_.getOrdered()) {
        if (!state().entityManager_.isEntityPickable(id)) continue;
        const auto it = state().entityManager_.entities.find(id);
        if (it == state().entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Line) {
            if (it->second.index >= state().entityManager_.lines.size()) continue;
            const LineRec& l = state().entityManager_.lines[it->second.index];
            pushPrimitive(engine::protocol::OverlayKind::Segment, 2);
            state().selectionOutlineData_.push_back(l.x0);
            state().selectionOutlineData_.push_back(l.y0);
            state().selectionOutlineData_.push_back(l.x1);
            state().selectionOutlineData_.push_back(l.y1);
            continue;
        }

        if (it->second.kind == EntityKind::Arrow) {
            if (it->second.index >= state().entityManager_.arrows.size()) continue;
            const ArrowRec& a = state().entityManager_.arrows[it->second.index];
            pushPrimitive(engine::protocol::OverlayKind::Segment, 2);
            state().selectionOutlineData_.push_back(a.ax);
            state().selectionOutlineData_.push_back(a.ay);
            state().selectionOutlineData_.push_back(a.bx);
            state().selectionOutlineData_.push_back(a.by);
            continue;
        }

        if (it->second.kind == EntityKind::Polyline) {
            if (it->second.index >= state().entityManager_.polylines.size()) continue;
            const PolyRec& pl = state().entityManager_.polylines[it->second.index];
            if (pl.count < 2) continue;
            if (pl.offset + pl.count > state().entityManager_.points.size()) continue;
            pushPrimitive(engine::protocol::OverlayKind::Polyline, pl.count);
            for (std::uint32_t k = 0; k < pl.count; ++k) {
                const Point2& pt = state().entityManager_.points[pl.offset + k];
                state().selectionOutlineData_.push_back(pt.x);
                state().selectionOutlineData_.push_back(pt.y);
            }
            continue;
        }

        const engine::protocol::EntityAabb aabb = getEntityAabb(id);
        if (!aabb.valid) continue;
        pushPrimitive(engine::protocol::OverlayKind::Polygon, 4);
        state().selectionOutlineData_.push_back(aabb.minX);
        state().selectionOutlineData_.push_back(aabb.minY);
        state().selectionOutlineData_.push_back(aabb.maxX);
        state().selectionOutlineData_.push_back(aabb.minY);
        state().selectionOutlineData_.push_back(aabb.maxX);
        state().selectionOutlineData_.push_back(aabb.maxY);
        state().selectionOutlineData_.push_back(aabb.minX);
        state().selectionOutlineData_.push_back(aabb.maxY);
    }

    return engine::protocol::OverlayBufferMeta{
        state().generation,
        static_cast<std::uint32_t>(state().selectionOutlinePrimitives_.size()),
        static_cast<std::uint32_t>(state().selectionOutlineData_.size()),
        reinterpret_cast<std::uintptr_t>(state().selectionOutlinePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(state().selectionOutlineData_.data()),
    };
}

engine::protocol::OverlayBufferMeta CadEngine::getSelectionHandleMeta() const {
    state().selectionHandlePrimitives_.clear();
    state().selectionHandleData_.clear();

    auto pushPrimitive = [&](std::uint32_t count) {
        const std::uint32_t offset = static_cast<std::uint32_t>(state().selectionHandleData_.size());
        state().selectionHandlePrimitives_.push_back(engine::protocol::OverlayPrimitive{
            static_cast<std::uint16_t>(engine::protocol::OverlayKind::Point),
            0,
            count,
            offset
        });
    };

    for (const std::uint32_t id : state().selectionManager_.getOrdered()) {
        if (!state().entityManager_.isEntityPickable(id)) continue;
        const auto it = state().entityManager_.entities.find(id);
        if (it == state().entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Line) {
            if (it->second.index >= state().entityManager_.lines.size()) continue;
            const LineRec& l = state().entityManager_.lines[it->second.index];
            pushPrimitive(2);
            state().selectionHandleData_.push_back(l.x0);
            state().selectionHandleData_.push_back(l.y0);
            state().selectionHandleData_.push_back(l.x1);
            state().selectionHandleData_.push_back(l.y1);
            continue;
        }

        if (it->second.kind == EntityKind::Arrow) {
            if (it->second.index >= state().entityManager_.arrows.size()) continue;
            const ArrowRec& a = state().entityManager_.arrows[it->second.index];
            pushPrimitive(2);
            state().selectionHandleData_.push_back(a.ax);
            state().selectionHandleData_.push_back(a.ay);
            state().selectionHandleData_.push_back(a.bx);
            state().selectionHandleData_.push_back(a.by);
            continue;
        }

        if (it->second.kind == EntityKind::Polyline) {
            if (it->second.index >= state().entityManager_.polylines.size()) continue;
            const PolyRec& pl = state().entityManager_.polylines[it->second.index];
            if (pl.count < 2) continue;
            if (pl.offset + pl.count > state().entityManager_.points.size()) continue;
            pushPrimitive(pl.count);
            for (std::uint32_t k = 0; k < pl.count; ++k) {
                const Point2& pt = state().entityManager_.points[pl.offset + k];
                state().selectionHandleData_.push_back(pt.x);
                state().selectionHandleData_.push_back(pt.y);
            }
            continue;
        }

        const engine::protocol::EntityAabb aabb = getEntityAabb(id);
        if (!aabb.valid) continue;
        pushPrimitive(4);
        // Handle order must match pick_system.cpp: 0=BL, 1=BR, 2=TR, 3=TL
        state().selectionHandleData_.push_back(aabb.minX);
        state().selectionHandleData_.push_back(aabb.minY);
        state().selectionHandleData_.push_back(aabb.maxX);
        state().selectionHandleData_.push_back(aabb.minY);
        state().selectionHandleData_.push_back(aabb.maxX);
        state().selectionHandleData_.push_back(aabb.maxY);
        state().selectionHandleData_.push_back(aabb.minX);
        state().selectionHandleData_.push_back(aabb.maxY);
    }

    return engine::protocol::OverlayBufferMeta{
        state().generation,
        static_cast<std::uint32_t>(state().selectionHandlePrimitives_.size()),
        static_cast<std::uint32_t>(state().selectionHandleData_.size()),
        reinterpret_cast<std::uintptr_t>(state().selectionHandlePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(state().selectionHandleData_.data()),
    };
}

engine::protocol::OverlayBufferMeta CadEngine::getSnapOverlayMeta() const {
    state().snapGuidePrimitives_.clear();
    state().snapGuideData_.clear();

    const auto& guides = state().interactionSession_.getSnapGuides();
    if (!guides.empty()) {
        state().snapGuidePrimitives_.reserve(guides.size());
        state().snapGuideData_.reserve(guides.size() * 4);
        for (const SnapGuide& guide : guides) {
            const std::uint32_t offset = static_cast<std::uint32_t>(state().snapGuideData_.size());
            state().snapGuidePrimitives_.push_back(engine::protocol::OverlayPrimitive{
                static_cast<std::uint16_t>(engine::protocol::OverlayKind::Segment),
                0,
                2,
                offset
            });
            state().snapGuideData_.push_back(guide.x0);
            state().snapGuideData_.push_back(guide.y0);
            state().snapGuideData_.push_back(guide.x1);
            state().snapGuideData_.push_back(guide.y1);
        }
    }

    return engine::protocol::OverlayBufferMeta{
        state().generation,
        static_cast<std::uint32_t>(state().snapGuidePrimitives_.size()),
        static_cast<std::uint32_t>(state().snapGuideData_.size()),
        reinterpret_cast<std::uintptr_t>(state().snapGuidePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(state().snapGuideData_.data()),
    };
}

engine::protocol::OrientedHandleMeta CadEngine::getOrientedHandleMeta() const {
    engine::protocol::OrientedHandleMeta meta{};
    meta.generation = state().generation;
    meta.valid = 0;
    
    const auto& ordered = state().selectionManager_.getOrdered();
    if (ordered.empty()) {
        return meta;
    }
    
    // For multi-selection, return invalid (use getSelectionBounds instead)
    if (ordered.size() > 1) {
        return meta;
    }
    
    const std::uint32_t entityId = ordered[0];
    const auto it = state().entityManager_.entities.find(entityId);
    if (it == state().entityManager_.entities.end()) {
        return meta;
    }
    
    meta.entityId = entityId;
    
    // Get entity info based on kind
    float cx = 0, cy = 0;       // Center
    float hw = 0, hh = 0;       // Half-width, half-height
    float rotation = 0;         // Rotation in radians
    bool hasRotation = false;
    bool hasResizeHandles = true;
    
    const EntityKind kind = it->second.kind;
    
    switch (kind) {
        case EntityKind::Rect: {
            if (it->second.index >= state().entityManager_.rects.size()) return meta;
            const RectRec& r = state().entityManager_.rects[it->second.index];
            cx = r.x + r.w * 0.5f;
            cy = r.y + r.h * 0.5f;
            hw = r.w * 0.5f;
            hh = r.h * 0.5f;
            rotation = r.rot;
            hasRotation = true;
            break;
        }
        case EntityKind::Circle: {
            if (it->second.index >= state().entityManager_.circles.size()) return meta;
            const CircleRec& c = state().entityManager_.circles[it->second.index];
            cx = c.cx;
            cy = c.cy;
            hw = std::abs(c.rx * c.sx);
            hh = std::abs(c.ry * c.sy);
            rotation = c.rot;
            hasRotation = true;
            break;
        }
        case EntityKind::Polygon: {
            if (it->second.index >= state().entityManager_.polygons.size()) return meta;
            const PolygonRec& p = state().entityManager_.polygons[it->second.index];
            cx = p.cx;
            cy = p.cy;
            hw = std::abs(p.rx * p.sx);
            hh = std::abs(p.ry * p.sy);
            rotation = p.rot;
            hasRotation = true;
            break;
        }
        case EntityKind::Text: {
            // Text: get bounds from text system
            const auto bounds = getEntityAabb(entityId);
            if (!bounds.valid) return meta;
            cx = (bounds.minX + bounds.maxX) * 0.5f;
            cy = (bounds.minY + bounds.maxY) * 0.5f;
            hw = (bounds.maxX - bounds.minX) * 0.5f;
            hh = (bounds.maxY - bounds.minY) * 0.5f;
            // Text rotation from text store
            const auto* textRec = state().textSystem_.store.getText(entityId);
            if (textRec) {
                rotation = textRec->rotation;
                hasRotation = true;
            }
            // Text doesn't support resize handles (only rotate)
            hasResizeHandles = false;
            break;
        }
        case EntityKind::Line:
        case EntityKind::Arrow:
        case EntityKind::Polyline: {
            // These don't have corner handles, use vertex handles instead
            // Return invalid to indicate frontend should use getSelectionHandleMeta
            return meta;
        }
        default:
            return meta;
    }
    
    // Calculate rotated corners (OBB)
    // Local corners (relative to center):
    //   BL = (-hw, -hh), BR = (+hw, -hh), TR = (+hw, +hh), TL = (-hw, +hh)
    const float cosR = std::cos(rotation);
    const float sinR = std::sin(rotation);
    
    // Helper to rotate a local point around center
    auto rotatePoint = [cx, cy, cosR, sinR](float lx, float ly) -> std::pair<float, float> {
        const float wx = cx + lx * cosR - ly * sinR;
        const float wy = cy + lx * sinR + ly * cosR;
        return {wx, wy};
    };
    
    // Corners in order: BL, BR, TR, TL
    auto [blx, bly] = rotatePoint(-hw, -hh);
    auto [brx, bry] = rotatePoint(+hw, -hh);
    auto [trx, try_] = rotatePoint(+hw, +hh);
    auto [tlx, tly] = rotatePoint(-hw, +hh);
    
    meta.blX = blx; meta.blY = bly;  // BL
    meta.brX = brx; meta.brY = bry;  // BR
    meta.trX = trx; meta.trY = try_; // TR
    meta.tlX = tlx; meta.tlY = tly;  // TL
    
    // Rotate handle position: above top edge center, offset diagonally
    // Top edge center = midpoint of TL and TR
    const float topCenterX = (tlx + trx) * 0.5f;
    const float topCenterY = (tly + try_) * 0.5f;
    
    // Direction from center to top center (normalized)
    const float toTopX = topCenterX - cx;
    const float toTopY = topCenterY - cy;
    const float toTopLen = std::sqrt(toTopX * toTopX + toTopY * toTopY);
    
    if (toTopLen > 1e-6f) {
        // Offset in the direction from center to top
        // Note: viewScale will be applied in frontend
        const float offsetDist = 25.0f;  // Base offset in world units (will be scaled)
        meta.rotateHandleX = topCenterX + (toTopX / toTopLen) * offsetDist;
        meta.rotateHandleY = topCenterY + (toTopY / toTopLen) * offsetDist;
    } else {
        // Fallback: straight up
        meta.rotateHandleX = cx;
        meta.rotateHandleY = cy + hh + 25.0f;
    }
    
    meta.centerX = cx;
    meta.centerY = cy;
    meta.rotationRad = rotation;
    meta.hasRotateHandle = hasRotation ? 1 : 0;
    meta.hasResizeHandles = hasResizeHandles ? 1 : 0;
    meta.valid = 1;
    
    return meta;
}
