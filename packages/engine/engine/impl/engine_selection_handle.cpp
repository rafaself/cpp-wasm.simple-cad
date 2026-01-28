#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include <cmath>
#include <limits>
#include <vector>

namespace {
inline float distSq(float x1, float y1, float x2, float y2) {
    const float dx = x1 - x2;
    const float dy = y1 - y2;
    return dx * dx + dy * dy;
}

inline int subTargetPriority(PickSubTarget t) {
    switch (t) {
        case PickSubTarget::ResizeHandle:
            return 10;
        case PickSubTarget::RotateHandle:
            return 9;
        case PickSubTarget::Vertex:
        case PickSubTarget::TextCaret:
            return 8;
        case PickSubTarget::Edge:
            return 5;
        case PickSubTarget::Body:
        case PickSubTarget::TextBody:
            return 1;
        default:
            return 0;
    }
}

inline PickEntityKind toPickEntityKind(EntityKind kind) {
    switch (kind) {
        case EntityKind::Rect: return PickEntityKind::Rect;
        case EntityKind::Circle: return PickEntityKind::Circle;
        case EntityKind::Line: return PickEntityKind::Line;
        case EntityKind::Polyline: return PickEntityKind::Polyline;
        case EntityKind::Polygon: return PickEntityKind::Polygon;
        case EntityKind::Arrow: return PickEntityKind::Arrow;
        case EntityKind::Text: return PickEntityKind::Text;
        default: return PickEntityKind::Unknown;
    }
}
} // namespace

PickResult CadEngine::pickSelectionHandle(float x, float y, float tolerance) const noexcept {
    PickResult res{};
    res.id = 0;
    res.kind = static_cast<std::uint16_t>(PickEntityKind::Unknown);
    res.subTarget = static_cast<std::uint8_t>(PickSubTarget::None);
    res.subIndex = -1;
    res.distance = std::numeric_limits<float>::infinity();
    res.hitX = x;
    res.hitY = y;

    if (!std::isfinite(tolerance) || tolerance <= 0.0f) return res;

    const auto& selection = state().selectionManager_.getOrdered();
    if (selection.empty()) return res;

    const auto isSelected = [&](std::uint32_t id) {
        for (const std::uint32_t selId : selection) {
            if (selId == id) return true;
        }
        return false;
    };

    const engine::protocol::OrientedHandleMeta meta = getOrientedHandleMeta();
    if (meta.valid && meta.selectionCount > 0 && selection.size() == meta.selectionCount) {
        const std::uint32_t representativeId = selection.front();
        std::uint16_t representativeKind = static_cast<std::uint16_t>(PickEntityKind::Unknown);
        const auto kindIt = state().entityManager_.entities.find(representativeId);
        if (kindIt != state().entityManager_.entities.end()) {
            representativeKind = static_cast<std::uint16_t>(toPickEntityKind(kindIt->second.kind));
        }

        int bestPriority = 0;
        float bestDist = std::numeric_limits<float>::infinity();
        std::uint8_t bestSubTarget = static_cast<std::uint8_t>(PickSubTarget::None);
        int32_t bestSubIndex = -1;

        const auto considerHandle = [&](PickSubTarget subTarget, int32_t subIndex, float hx, float hy) {
            const float d = std::sqrt(distSq(x, y, hx, hy));
            if (d > tolerance) return;
            const int priority = subTargetPriority(subTarget);
            if (priority > bestPriority || (priority == bestPriority && d < bestDist)) {
                bestPriority = priority;
                bestDist = d;
                bestSubTarget = static_cast<std::uint8_t>(subTarget);
                bestSubIndex = subIndex;
            }
        };

        if (meta.hasResizeHandles) {
            considerHandle(PickSubTarget::ResizeHandle, 0, meta.blX, meta.blY);
            considerHandle(PickSubTarget::ResizeHandle, 1, meta.brX, meta.brY);
            considerHandle(PickSubTarget::ResizeHandle, 2, meta.trX, meta.trY);
            considerHandle(PickSubTarget::ResizeHandle, 3, meta.tlX, meta.tlY);
        }

        if (meta.hasSideHandles) {
            considerHandle(PickSubTarget::ResizeHandle, 4, meta.northX, meta.northY);
            considerHandle(PickSubTarget::ResizeHandle, 5, meta.eastX, meta.eastY);
            considerHandle(PickSubTarget::ResizeHandle, 6, meta.southX, meta.southY);
            considerHandle(PickSubTarget::ResizeHandle, 7, meta.westX, meta.westY);
        }

        if (meta.hasRotateHandle) {
            considerHandle(PickSubTarget::RotateHandle, 0, meta.rotateHandleX, meta.rotateHandleY);
        }

        if (bestPriority > 0) {
            res.id = representativeId;
            res.kind = representativeKind;
            res.subTarget = bestSubTarget;
            res.subIndex = bestSubIndex;
            res.distance = bestDist;
            return res;
        }
    }

    // Fallback for selection types without oriented handles (e.g., line/polygon grips).
    constexpr std::uint32_t kPickMaskHandles = 1u << 3;
    constexpr std::uint32_t kPickMaskVertex = 1u << 2;
    constexpr std::uint32_t kPickMaskEdge = 1u << 1;
    const std::uint32_t pickMask = kPickMaskHandles | kPickMaskVertex | kPickMaskEdge;

    std::vector<PickResult> candidates = state().pickSystem_.pickCandidates(
        x,
        y,
        tolerance,
        state().viewScale,
        pickMask,
        state().entityManager_,
        state().textSystem_);

    int bestPriority = 0;
    float bestDist = std::numeric_limits<float>::infinity();
    PickResult bestResult = res;

    for (const PickResult& candidate : candidates) {
        if (!isSelected(candidate.id)) continue;
        const PickSubTarget subTarget = static_cast<PickSubTarget>(candidate.subTarget);
        if (subTarget == PickSubTarget::Body || subTarget == PickSubTarget::TextBody) continue;

        const int priority = subTargetPriority(subTarget);
        if (priority == 0) continue;
        if (priority > bestPriority || (priority == bestPriority && candidate.distance < bestDist)) {
            bestPriority = priority;
            bestDist = candidate.distance;
            bestResult = candidate;
        }
    }

    if (bestPriority > 0) {
        return bestResult;
    }

    return res;
}
