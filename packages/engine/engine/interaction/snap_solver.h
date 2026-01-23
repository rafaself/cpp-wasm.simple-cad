#pragma once

#include "engine/core/types.h"
#include "engine/entity/entity_manager.h"
#include "engine/interaction/pick_system.h"
#include "engine/text_system.h"
#include "engine/interaction/snap_types.h"

#include <vector>
#include <cstdint>

struct SnapResult {
    float dx{0.0f};
    float dy{0.0f};
    bool snappedX{false};
    bool snappedY{false};
    std::uint8_t hitCount{0};
    SnapHit hits[2]{};
};

SnapResult computeObjectSnap(
    const SnapOptions& options,
    const std::vector<std::uint32_t>& movingIds,
    float baseMinX,
    float baseMinY,
    float baseMaxX,
    float baseMaxY,
    float totalDx,
    float totalDy,
    const EntityManager& entityManager,
    TextSystem& textSystem,
    const PickSystem& pickSystem,
    float viewScale,
    float viewX,
    float viewY,
    float viewWidth,
    float viewHeight,
    bool allowSnapX,
    bool allowSnapY,
    std::vector<SnapGuide>& outGuides,
    std::vector<std::uint32_t>& candidatesScratch);
