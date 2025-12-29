#pragma once

#include "engine/core/types.h"
#include "engine/entity/entity_manager.h"
#include "engine/text_system.h"
#include "engine/interaction/pick_system.h"
#include "engine/history/history_manager.h"
#include "engine/entity/selection_manager.h"
#include "engine/interaction/interaction_session.h"
#include "engine/protocol/protocol_types.h"
#include "engine/render/render.h"

#include <cstddef>
#include <cstdint>
#include <unordered_map>
#include <unordered_set>
#include <vector>

class CadEngine;

struct EngineState {
    explicit EngineState(CadEngine& engine);

    EngineState(const EngineState&) = delete;
    EngineState& operator=(const EngineState&) = delete;

    EntityManager entityManager_;

    mutable TextSystem textSystem_;
    mutable PickSystem pickSystem_;

    float viewScale{1.0f};
    float viewX{0.0f};
    float viewY{0.0f};
    float viewWidth{0.0f};
    float viewHeight{0.0f};

    mutable std::vector<float> triangleVertices;
    mutable std::vector<float> lineVertices;
    mutable std::unordered_map<std::uint32_t, engine::RenderRange> renderRanges_{};
    mutable std::vector<std::uint8_t> snapshotBytes;
    mutable bool textQuadsDirty_{true};
    mutable bool renderDirty{false};
    mutable bool snapshotDirty{false};
    std::uint32_t generation{0};
    mutable std::uint32_t rebuildAllGeometryCount_{0};
    mutable bool pendingFullRebuild_{false};
    mutable float lastLoadMs{0.0f};
    mutable float lastRebuildMs{0.0f};
    float lastApplyMs{0.0f};
    SelectionManager selectionManager_;
    std::uint32_t nextEntityId_{1};
    std::uint32_t nextLayerId_{1};
    HistoryManager historyManager_;

    static constexpr std::size_t kMaxEvents = 2048;
    std::vector<engine::protocol::EngineEvent> eventQueue_{};
    std::size_t eventHead_{0};
    std::size_t eventTail_{0};
    std::size_t eventCount_{0};
    bool eventOverflowed_{false};
    std::uint32_t eventOverflowGeneration_{0};
    std::vector<engine::protocol::EngineEvent> eventBuffer_{};

    std::unordered_map<std::uint32_t, std::uint32_t> pendingEntityChanges_{};
    std::unordered_map<std::uint32_t, std::uint32_t> pendingEntityCreates_{};
    std::unordered_set<std::uint32_t> pendingEntityDeletes_{};
    std::unordered_map<std::uint32_t, std::uint32_t> pendingLayerChanges_{};
    std::uint32_t pendingDocMask_{0};
    bool pendingSelectionChanged_{false};
    bool pendingOrderChanged_{false};
    bool pendingHistoryChanged_{false};

    mutable std::vector<engine::protocol::OverlayPrimitive> selectionOutlinePrimitives_{};
    mutable std::vector<float> selectionOutlineData_{};
    mutable std::vector<engine::protocol::OverlayPrimitive> selectionHandlePrimitives_{};
    mutable std::vector<float> selectionHandleData_{};

    mutable EngineError lastError{EngineError::Ok};

    InteractionSession interactionSession_;
};
