#include "engine/internal/engine_state.h"

#include "engine/core/types.h"

EngineState::EngineState(CadEngine& engine)
    : selectionManager_(entityManager_),
      historyManager_(entityManager_, textSystem_),
      interactionSession_(engine, entityManager_, pickSystem_, textSystem_, historyManager_) {
    triangleVertices.reserve(defaultCapacityFloats);
    lineVertices.reserve(defaultLineCapacityFloats);
    renderScratchVertices_.reserve(256);
    renderScratchPoints_.reserve(64);
    snapshotBytes.reserve(defaultSnapshotCapacityBytes);
    eventQueue_.resize(kMaxEvents);
    eventBuffer_.reserve(kMaxEvents + 1);
    renderDirty = false;
    snapshotDirty = false;
    lastError = EngineError::Ok;
}
