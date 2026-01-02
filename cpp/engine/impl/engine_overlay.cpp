// CadEngine overlay methods - selection outline and handle generation
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"

CadEngine::OverlayBufferMeta CadEngine::getSelectionOutlineMeta() const {
    selectionOutlinePrimitives_.clear();
    selectionOutlineData_.clear();

    auto pushPrimitive = [&](OverlayKind kind, std::uint32_t count) {
        const std::uint32_t offset = static_cast<std::uint32_t>(selectionOutlineData_.size());
        selectionOutlinePrimitives_.push_back(OverlayPrimitive{
            static_cast<std::uint16_t>(kind),
            0,
            count,
            offset
        });
    };

    for (const std::uint32_t id : selectionManager_.getOrdered()) {
        if (!entityManager_.isEntityPickable(id)) continue;
        const auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Line) {
            if (it->second.index >= entityManager_.lines.size()) continue;
            const LineRec& l = entityManager_.lines[it->second.index];
            pushPrimitive(OverlayKind::Segment, 2);
            selectionOutlineData_.push_back(l.x0);
            selectionOutlineData_.push_back(l.y0);
            selectionOutlineData_.push_back(l.x1);
            selectionOutlineData_.push_back(l.y1);
            continue;
        }

        if (it->second.kind == EntityKind::Arrow) {
            if (it->second.index >= entityManager_.arrows.size()) continue;
            const ArrowRec& a = entityManager_.arrows[it->second.index];
            pushPrimitive(OverlayKind::Segment, 2);
            selectionOutlineData_.push_back(a.ax);
            selectionOutlineData_.push_back(a.ay);
            selectionOutlineData_.push_back(a.bx);
            selectionOutlineData_.push_back(a.by);
            continue;
        }

        if (it->second.kind == EntityKind::Polyline) {
            if (it->second.index >= entityManager_.polylines.size()) continue;
            const PolyRec& pl = entityManager_.polylines[it->second.index];
            if (pl.count < 2) continue;
            if (pl.offset + pl.count > entityManager_.points.size()) continue;
            pushPrimitive(OverlayKind::Polyline, pl.count);
            for (std::uint32_t k = 0; k < pl.count; ++k) {
                const Point2& pt = entityManager_.points[pl.offset + k];
                selectionOutlineData_.push_back(pt.x);
                selectionOutlineData_.push_back(pt.y);
            }
            continue;
        }

        const EntityAabb aabb = getEntityAabb(id);
        if (!aabb.valid) continue;
        pushPrimitive(OverlayKind::Polygon, 4);
        selectionOutlineData_.push_back(aabb.minX);
        selectionOutlineData_.push_back(aabb.minY);
        selectionOutlineData_.push_back(aabb.maxX);
        selectionOutlineData_.push_back(aabb.minY);
        selectionOutlineData_.push_back(aabb.maxX);
        selectionOutlineData_.push_back(aabb.maxY);
        selectionOutlineData_.push_back(aabb.minX);
        selectionOutlineData_.push_back(aabb.maxY);
    }

    return OverlayBufferMeta{
        generation,
        static_cast<std::uint32_t>(selectionOutlinePrimitives_.size()),
        static_cast<std::uint32_t>(selectionOutlineData_.size()),
        reinterpret_cast<std::uintptr_t>(selectionOutlinePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(selectionOutlineData_.data()),
    };
}

CadEngine::OverlayBufferMeta CadEngine::getSelectionHandleMeta() const {
    selectionHandlePrimitives_.clear();
    selectionHandleData_.clear();

    auto pushPrimitive = [&](std::uint32_t count) {
        const std::uint32_t offset = static_cast<std::uint32_t>(selectionHandleData_.size());
        selectionHandlePrimitives_.push_back(OverlayPrimitive{
            static_cast<std::uint16_t>(OverlayKind::Point),
            0,
            count,
            offset
        });
    };

    for (const std::uint32_t id : selectionManager_.getOrdered()) {
        if (!entityManager_.isEntityPickable(id)) continue;
        const auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Line) {
            if (it->second.index >= entityManager_.lines.size()) continue;
            const LineRec& l = entityManager_.lines[it->second.index];
            pushPrimitive(2);
            selectionHandleData_.push_back(l.x0);
            selectionHandleData_.push_back(l.y0);
            selectionHandleData_.push_back(l.x1);
            selectionHandleData_.push_back(l.y1);
            continue;
        }

        if (it->second.kind == EntityKind::Arrow) {
            if (it->second.index >= entityManager_.arrows.size()) continue;
            const ArrowRec& a = entityManager_.arrows[it->second.index];
            pushPrimitive(2);
            selectionHandleData_.push_back(a.ax);
            selectionHandleData_.push_back(a.ay);
            selectionHandleData_.push_back(a.bx);
            selectionHandleData_.push_back(a.by);
            continue;
        }

        if (it->second.kind == EntityKind::Polyline) {
            if (it->second.index >= entityManager_.polylines.size()) continue;
            const PolyRec& pl = entityManager_.polylines[it->second.index];
            if (pl.count < 2) continue;
            if (pl.offset + pl.count > entityManager_.points.size()) continue;
            pushPrimitive(pl.count);
            for (std::uint32_t k = 0; k < pl.count; ++k) {
                const Point2& pt = entityManager_.points[pl.offset + k];
                selectionHandleData_.push_back(pt.x);
                selectionHandleData_.push_back(pt.y);
            }
            continue;
        }

        const EntityAabb aabb = getEntityAabb(id);
        if (!aabb.valid) continue;
        pushPrimitive(4);
        // Handle order must match pick_system.cpp: 0=BL, 1=BR, 2=TR, 3=TL
        selectionHandleData_.push_back(aabb.minX);
        selectionHandleData_.push_back(aabb.minY);
        selectionHandleData_.push_back(aabb.maxX);
        selectionHandleData_.push_back(aabb.minY);
        selectionHandleData_.push_back(aabb.maxX);
        selectionHandleData_.push_back(aabb.maxY);
        selectionHandleData_.push_back(aabb.minX);
        selectionHandleData_.push_back(aabb.maxY);
    }

    return OverlayBufferMeta{
        generation,
        static_cast<std::uint32_t>(selectionHandlePrimitives_.size()),
        static_cast<std::uint32_t>(selectionHandleData_.size()),
        reinterpret_cast<std::uintptr_t>(selectionHandlePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(selectionHandleData_.data()),
    };
}

CadEngine::OverlayBufferMeta CadEngine::getSnapOverlayMeta() const {
    snapGuidePrimitives_.clear();
    snapGuideData_.clear();

    const auto& guides = interactionSession_.getSnapGuides();
    if (!guides.empty()) {
        snapGuidePrimitives_.reserve(guides.size());
        snapGuideData_.reserve(guides.size() * 4);
        for (const SnapGuide& guide : guides) {
            const std::uint32_t offset = static_cast<std::uint32_t>(snapGuideData_.size());
            snapGuidePrimitives_.push_back(OverlayPrimitive{
                static_cast<std::uint16_t>(OverlayKind::Segment),
                0,
                2,
                offset
            });
            snapGuideData_.push_back(guide.x0);
            snapGuideData_.push_back(guide.y0);
            snapGuideData_.push_back(guide.x1);
            snapGuideData_.push_back(guide.y1);
        }
    }

    return OverlayBufferMeta{
        generation,
        static_cast<std::uint32_t>(snapGuidePrimitives_.size()),
        static_cast<std::uint32_t>(snapGuideData_.size()),
        reinterpret_cast<std::uintptr_t>(snapGuidePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(snapGuideData_.data()),
    };
}

#include "engine/internal/engine_state_aliases_undef.h"
