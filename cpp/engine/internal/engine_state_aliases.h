#pragma once

#include "engine/internal/engine_state.h"

// These aliases bridge the new EngineState pImpl to legacy member names.
// They are intended for internal translation units that implement CadEngine
// methods or friend utilities. Always pair with engine_state_aliases_undef.h
// to avoid leaking macros.
#define entityManager_ state_->entityManager_
#define textSystem_ state_->textSystem_
#define pickSystem_ state_->pickSystem_
#define viewScale state_->viewScale
#define viewX state_->viewX
#define viewY state_->viewY
#define viewWidth state_->viewWidth
#define viewHeight state_->viewHeight
#define triangleVertices state_->triangleVertices
#define lineVertices state_->lineVertices
#define renderRanges_ state_->renderRanges_
#define snapshotBytes state_->snapshotBytes
#define textQuadsDirty_ state_->textQuadsDirty_
#define renderDirty state_->renderDirty
#define snapshotDirty state_->snapshotDirty
#define generation state_->generation
#define rebuildAllGeometryCount_ state_->rebuildAllGeometryCount_
#define pendingFullRebuild_ state_->pendingFullRebuild_
#define lastLoadMs state_->lastLoadMs
#define lastRebuildMs state_->lastRebuildMs
#define lastApplyMs state_->lastApplyMs
#define selectionManager_ state_->selectionManager_
#define nextEntityId_ state_->nextEntityId_
#define nextLayerId_ state_->nextLayerId_
#define historyManager_ state_->historyManager_
#define eventQueue_ state_->eventQueue_
#define eventHead_ state_->eventHead_
#define eventTail_ state_->eventTail_
#define eventCount_ state_->eventCount_
#define eventOverflowed_ state_->eventOverflowed_
#define eventOverflowGeneration_ state_->eventOverflowGeneration_
#define eventBuffer_ state_->eventBuffer_
#define pendingEntityChanges_ state_->pendingEntityChanges_
#define pendingEntityCreates_ state_->pendingEntityCreates_
#define pendingEntityDeletes_ state_->pendingEntityDeletes_
#define pendingLayerChanges_ state_->pendingLayerChanges_
#define pendingDocMask_ state_->pendingDocMask_
#define pendingSelectionChanged_ state_->pendingSelectionChanged_
#define pendingOrderChanged_ state_->pendingOrderChanged_
#define pendingHistoryChanged_ state_->pendingHistoryChanged_
#define selectionOutlinePrimitives_ state_->selectionOutlinePrimitives_
#define selectionOutlineData_ state_->selectionOutlineData_
#define selectionHandlePrimitives_ state_->selectionHandlePrimitives_
#define selectionHandleData_ state_->selectionHandleData_
#define snapGuidePrimitives_ state_->snapGuidePrimitives_
#define snapGuideData_ state_->snapGuideData_
#define lastError state_->lastError
#define interactionSession_ state_->interactionSession_
