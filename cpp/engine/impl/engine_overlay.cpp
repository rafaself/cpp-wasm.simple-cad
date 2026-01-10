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

