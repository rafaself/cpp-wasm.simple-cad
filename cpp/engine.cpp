// engine.cpp now contains only a thin TU; public `CadEngine` lives in engine/engine.h
#include "engine/engine.h"
#include "engine/command/command_dispatch.h"
#include "engine/core/string_utils.h"
#include "engine/internal/engine_state_aliases.h"

// Implement CadEngine methods moved out of the header to keep the header small.

#include <cmath>
#include <algorithm>
#include <cstring>
#include <cstdio>  // For printf debugging
#include <limits>
#include <string_view>

// Import string_utils into anonymous namespace for local use
namespace {
    using EntityChange = HistoryEntry::EntityChange;
    using engine::logicalToByteIndex;
    using engine::byteToLogicalIndex;
    using engine::pointToSegmentDistanceSq;
    using engine::kDigestOffset;
    using engine::kDigestPrime;
    using engine::hashU32;
    using engine::hashBytes;
    using engine::canonicalizeF32;
    using engine::hashF32;

    bool isEntityVisibleForRenderThunk(void* ctx, std::uint32_t id) {
        const auto* engine = static_cast<const CadEngine*>(ctx);
        return engine ? engine->isEntityVisibleForRender(id) : true;
    }
}

// Constructor / destructor
CadEngine::CadEngine() : state_(std::make_unique<EngineState>(*this)) {}
CadEngine::~CadEngine() = default;

EngineState& CadEngine::state() noexcept {
    return *state_;
}

const EngineState& CadEngine::state() const noexcept {
    return *state_;
}

void CadEngine::clearError() const {
    lastError = EngineError::Ok;
}

void CadEngine::setError(EngineError err) const {
    lastError = err;
}

void CadEngine::setNextEntityId(std::uint32_t id) {
    nextEntityId_ = id;
}

std::uint32_t CadEngine::getSelectionGeneration() const noexcept {
    return selectionManager_.getGeneration();
}

bool CadEngine::isEntityVisibleForRender(std::uint32_t id) const noexcept {
    return entityManager_.isEntityVisible(id);
}

bool CadEngine::hasPendingEvents() const noexcept {
    // Check both flushed events (eventCount_) and pending events that haven't been flushed yet
    return eventCount_ > 0 
        || pendingDocMask_ != 0 
        || !pendingEntityChanges_.empty()
        || !pendingEntityCreates_.empty()
        || !pendingEntityDeletes_.empty()
        || !pendingLayerChanges_.empty()
        || pendingSelectionChanged_
        || pendingOrderChanged_
        || pendingHistoryChanged_
        || eventOverflowed_;
}

bool CadEngine::isTextQuadsDirty() const {
    return textQuadsDirty_;
}

void CadEngine::markTextQuadsDirty() const {
    textQuadsDirty_ = true;
}

bool CadEngine::isInteractionActive() const {
    return interactionSession_.isInteractionActive();
}

std::uint32_t CadEngine::getCommitResultCount() const {
    return static_cast<std::uint32_t>(interactionSession_.getCommitResultIds().size());
}

std::uintptr_t CadEngine::getCommitResultIdsPtr() const {
    return reinterpret_cast<std::uintptr_t>(interactionSession_.getCommitResultIds().data());
}

std::uintptr_t CadEngine::getCommitResultOpCodesPtr() const {
    return reinterpret_cast<std::uintptr_t>(interactionSession_.getCommitResultOpCodes().data());
}

std::uintptr_t CadEngine::getCommitResultPayloadsPtr() const {
    return reinterpret_cast<std::uintptr_t>(interactionSession_.getCommitResultPayloads().data());
}

void CadEngine::setTransformLogEnabled(bool enabled, std::uint32_t maxEntries, std::uint32_t maxIds) {
    interactionSession_.setTransformLogEnabled(enabled, maxEntries, maxIds);
}

void CadEngine::clearTransformLog() {
    interactionSession_.clearTransformLog();
}

bool CadEngine::replayTransformLog() {
    return interactionSession_.replayTransformLog();
}

bool CadEngine::isTransformLogOverflowed() const {
    return interactionSession_.isTransformLogOverflowed();
}

std::uint32_t CadEngine::getTransformLogCount() const {
    return static_cast<std::uint32_t>(interactionSession_.getTransformLogEntries().size());
}

std::uintptr_t CadEngine::getTransformLogPtr() const {
    return reinterpret_cast<std::uintptr_t>(interactionSession_.getTransformLogEntries().data());
}

std::uint32_t CadEngine::getTransformLogIdCount() const {
    return static_cast<std::uint32_t>(interactionSession_.getTransformLogIds().size());
}

std::uintptr_t CadEngine::getTransformLogIdsPtr() const {
    return reinterpret_cast<std::uintptr_t>(interactionSession_.getTransformLogIds().data());
}

void CadEngine::clear() noexcept {
    clearWorld();
    clearHistory();
    generation++;
}

std::uintptr_t CadEngine::allocBytes(std::uint32_t byteCount) {
    void* p = std::malloc(byteCount);
    return reinterpret_cast<std::uintptr_t>(p);
}

void CadEngine::freeBytes(std::uintptr_t ptr) {
    std::free(reinterpret_cast<void*>(ptr));
}

std::uint32_t CadEngine::allocateEntityId() {
    const std::uint32_t id = nextEntityId_;
    nextEntityId_ = (nextEntityId_ == std::numeric_limits<std::uint32_t>::max()) ? nextEntityId_ : (nextEntityId_ + 1);
    return id;
}

std::uint32_t CadEngine::allocateLayerId() {
    const std::uint32_t id = nextLayerId_;
    nextLayerId_ = (nextLayerId_ == std::numeric_limits<std::uint32_t>::max()) ? nextLayerId_ : (nextLayerId_ + 1);
    return id;
}

void CadEngine::reserveWorld(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints) {
    entityManager_.reserve(maxRects, maxLines, maxPolylines, maxPoints);

    triangleVertices.reserve(static_cast<std::size_t>(maxRects) * rectTriangleFloats);
    lineVertices.reserve(
        static_cast<std::size_t>(maxRects) * rectOutlineFloats +
        static_cast<std::size_t>(maxLines) * lineSegmentFloats +
        static_cast<std::size_t>(maxPoints) * 2 * 7
    );
}

// loadSnapshotFromPtr moved to engine_snapshot.cpp

void CadEngine::applyCommandBuffer(std::uintptr_t ptr, std::uint32_t byteCount) {
    clearError();
    const double t0 = emscripten_get_now();
    const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
    beginHistoryEntry();
    
    // Use the new dispatchCommand via a callback wrapper
    auto commandCallback = [](void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount) -> EngineError {
        return engine::dispatchCommand(reinterpret_cast<CadEngine*>(ctx), op, id, payload, payloadByteCount);
    };
    
    EngineError err = engine::parseCommandBuffer(src, byteCount, commandCallback, this);
    if (err != EngineError::Ok) {
        setError(err);
        discardHistoryEntry();
        return;
    }

    compactPolylinePoints();
    commitHistoryEntry();
    
    // Lazy rebuild
    renderDirty = true;
    snapshotDirty = true;
    generation++;

    const double t1 = emscripten_get_now();
    lastApplyMs = static_cast<float>(t1 - t0);
    lastLoadMs = 0.0f;
    lastRebuildMs = 0.0f;
}

std::uint32_t CadEngine::getVertexCount() const noexcept {
    if (renderDirty) rebuildRenderBuffers();
    return static_cast<std::uint32_t>(triangleVertices.size() / 7);
}

std::uintptr_t CadEngine::getVertexDataPtr() const noexcept {
    if (renderDirty) rebuildRenderBuffers();
    return reinterpret_cast<std::uintptr_t>(triangleVertices.data());
}

CadEngine::BufferMeta CadEngine::buildMeta(const std::vector<float>& buffer, std::size_t floatsPerVertex) const noexcept {
    const std::uint32_t vertexCount = static_cast<std::uint32_t>(buffer.size() / floatsPerVertex);
    const std::uint32_t capacityVertices = static_cast<std::uint32_t>(buffer.capacity() / floatsPerVertex);
    const std::uint32_t floatCount = static_cast<std::uint32_t>(buffer.size());
    return BufferMeta{generation, vertexCount, capacityVertices, floatCount, reinterpret_cast<std::uintptr_t>(buffer.data())};
}

CadEngine::BufferMeta CadEngine::getPositionBufferMeta() const noexcept { 
    if (renderDirty) rebuildRenderBuffers();
    return buildMeta(triangleVertices, 7); 
}
CadEngine::BufferMeta CadEngine::getLineBufferMeta() const noexcept { 
    if (renderDirty) rebuildRenderBuffers();
    return buildMeta(lineVertices, 7); 
}

CadEngine::ByteBufferMeta CadEngine::saveSnapshot() const noexcept {
    if (snapshotDirty) rebuildSnapshotBytes();
    return ByteBufferMeta{generation, static_cast<std::uint32_t>(snapshotBytes.size()), reinterpret_cast<std::uintptr_t>(snapshotBytes.data())};
}

CadEngine::ByteBufferMeta CadEngine::getSnapshotBufferMeta() const noexcept {
    return saveSnapshot();
}

CadEngine::EngineStats CadEngine::getStats() const noexcept {
    if (renderDirty) rebuildRenderBuffers();
    return EngineStats{
        generation,
        static_cast<std::uint32_t>(entityManager_.rects.size()),
        static_cast<std::uint32_t>(entityManager_.lines.size()),
        static_cast<std::uint32_t>(entityManager_.polylines.size()),
        static_cast<std::uint32_t>(entityManager_.points.size()),
        static_cast<std::uint32_t>(triangleVertices.size() / 7),
        static_cast<std::uint32_t>(lineVertices.size() / 7),
        rebuildAllGeometryCount_,
        lastLoadMs,
        lastRebuildMs,
        lastApplyMs,
        interactionSession_.getLastTransformUpdateMs(),
        interactionSession_.getLastSnapCandidateCount(),
        interactionSession_.getLastSnapHitCount()
    };
}

// Document digest moved to engine/engine_digest.cpp

CadEngine::HistoryMeta CadEngine::getHistoryMeta() const noexcept {
    return HistoryMeta{
        static_cast<std::uint32_t>(historyManager_.getHistorySize()),
        static_cast<std::uint32_t>(historyManager_.getCursor()),
        historyManager_.getGeneration(),
    };
}

bool CadEngine::canUndo() const noexcept {
    return historyManager_.canUndo();
}

bool CadEngine::canRedo() const noexcept {
    return historyManager_.canRedo();
}

void CadEngine::undo() {
    historyManager_.undo(*this);
}

void CadEngine::redo() {
    historyManager_.redo(*this);
}

std::vector<LayerRecord> CadEngine::getLayersSnapshot() const {
    return entityManager_.layerStore.snapshot();
}

std::string CadEngine::getLayerName(std::uint32_t layerId) const {
    return entityManager_.layerStore.getLayerName(layerId);
}

void CadEngine::setLayerProps(std::uint32_t layerId, std::uint32_t propsMask, std::uint32_t flagsValue, const std::string& name) {
    const bool historyStarted = beginHistoryEntry();
    if (propsMask != 0) {
        markLayerChange();
    }
    entityManager_.layerStore.ensureLayer(layerId);

    const std::uint32_t visiblePropMask = static_cast<std::uint32_t>(LayerPropMask::Visible);
    const std::uint32_t lockedPropMask = static_cast<std::uint32_t>(LayerPropMask::Locked);
    const std::uint32_t nameMask = static_cast<std::uint32_t>(LayerPropMask::Name);

    // Translate incoming flag bits (EngineLayerFlags layout) to LayerFlags while tolerating
    // the legacy LayerPropMask layout for backwards compatibility.
    const std::uint32_t visibleFlag = static_cast<std::uint32_t>(LayerFlags::Visible);
    const std::uint32_t lockedFlag = static_cast<std::uint32_t>(LayerFlags::Locked);
    const std::uint32_t visibleIncomingMask = visibleFlag | visiblePropMask;
    const std::uint32_t lockedIncomingMask = lockedFlag | lockedPropMask;

    std::uint32_t translatedMask = 0;
    std::uint32_t translatedValue = 0;
    if (propsMask & visiblePropMask) {
        translatedMask |= visibleFlag;
        if (flagsValue & visibleIncomingMask) {
            translatedValue |= visibleFlag;
        }
    }
    if (propsMask & lockedPropMask) {
        translatedMask |= lockedFlag;
        if (flagsValue & lockedIncomingMask) {
            translatedValue |= lockedFlag;
        }
    }

    bool visibilityChanged = false;
    bool lockedChanged = false;
    bool nameChanged = false;

    if (translatedMask != 0) {
        const std::uint32_t prevFlags = entityManager_.layerStore.getLayerFlags(layerId);
        entityManager_.layerStore.setLayerFlags(layerId, translatedMask, translatedValue);
        const std::uint32_t nextFlags = entityManager_.layerStore.getLayerFlags(layerId);
        visibilityChanged = ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(LayerFlags::Visible)) != 0;
        lockedChanged = ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(LayerFlags::Locked)) != 0;
    }

    if ((propsMask & nameMask) != 0) {
        const std::string prevName = entityManager_.layerStore.getLayerName(layerId);
        entityManager_.layerStore.setLayerName(layerId, name);
        nameChanged = prevName != name;
    }

    if (visibilityChanged) {
        renderDirty = true;
        textQuadsDirty_ = true;
    }

    if (visibilityChanged || lockedChanged) {
        selectionManager_.prune(*this);
    }

    const std::uint32_t changedMask =
        (visibilityChanged ? visiblePropMask : 0)
        | (lockedChanged ? lockedPropMask : 0)
        | (nameChanged ? nameMask : 0);

    if (changedMask != 0) {
        recordLayerChanged(layerId, changedMask);
        generation++;
    }
    if (historyStarted) commitHistoryEntry();
}

bool CadEngine::deleteLayer(std::uint32_t layerId) {
    const bool historyStarted = beginHistoryEntry();
    markLayerChange();
    const bool deleted = entityManager_.layerStore.deleteLayer(layerId);
    if (deleted) {
        renderDirty = true;
        textQuadsDirty_ = true;
        recordLayerChanged(
            layerId,
            static_cast<std::uint32_t>(LayerPropMask::Name)
            | static_cast<std::uint32_t>(LayerPropMask::Visible)
            | static_cast<std::uint32_t>(LayerPropMask::Locked)
        );
        generation++;
    }
    if (historyStarted) commitHistoryEntry();
    return deleted;
}

std::uint32_t CadEngine::getEntityFlags(std::uint32_t entityId) const {
    return entityManager_.getEntityFlags(entityId);
}

void CadEngine::setEntityFlags(std::uint32_t entityId, std::uint32_t flagsMask, std::uint32_t flagsValue) {
    const std::uint32_t prevFlags = entityManager_.getEntityFlags(entityId);
    const std::uint32_t nextFlags = (prevFlags & ~flagsMask) | (flagsValue & flagsMask);
    if (prevFlags == nextFlags) {
        return;
    }
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(entityId);
    entityManager_.setEntityFlags(entityId, flagsMask, flagsValue);
    if (((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Visible)) != 0) {
        renderDirty = true;
        textQuadsDirty_ = true;
    }
    if (((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Locked)) != 0 ||
        ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Visible)) != 0) {
        selectionManager_.prune(*this);
    }
    if (prevFlags != nextFlags) {
        recordEntityChanged(entityId, static_cast<std::uint32_t>(ChangeMask::Flags));
        generation++;
    }
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setEntityLayer(std::uint32_t entityId, std::uint32_t layerId) {
    const std::uint32_t prevLayer = entityManager_.getEntityLayer(entityId);
    if (prevLayer == layerId) {
        return;
    }
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(entityId);
    entityManager_.setEntityLayer(entityId, layerId);
    renderDirty = true;
    textQuadsDirty_ = true;
    selectionManager_.prune(*this);
    recordEntityChanged(entityId, static_cast<std::uint32_t>(ChangeMask::Layer));
    generation++;
    if (historyStarted) commitHistoryEntry();
}

std::uint32_t CadEngine::getEntityLayer(std::uint32_t entityId) const {
    return entityManager_.getEntityLayer(entityId);
}

std::uint32_t CadEngine::pick(float x, float y, float tolerance) const noexcept {
    return pickSystem_.pick(x, y, tolerance, viewScale, entityManager_, textSystem_);
}

PickResult CadEngine::pickEx(float x, float y, float tolerance, std::uint32_t pickMask) const noexcept {
    constexpr std::uint32_t kPickHandlesMask = 1u << 3;
    if ((pickMask & kPickHandlesMask) != 0) {
        const auto& selection = selectionManager_.getOrdered();
        if (selection.size() >= 1) {
            bool allowSelectionHandles = true;
            if (selection.size() == 1) {
                const std::uint32_t id = selection.front();
                const auto it = entityManager_.entities.find(id);
                if (it != entityManager_.entities.end()) {
                    const EntityKind kind = it->second.kind;
                    if (kind == EntityKind::Line || kind == EntityKind::Polyline || kind == EntityKind::Arrow) {
                        // Endpoint handles for line-like entities should resolve to vertex dragging.
                        allowSelectionHandles = false;
                    }
                }
            }

            if (allowSelectionHandles) {
                const EntityAabb bounds = getSelectionBounds();
                if (bounds.valid) {
                    const float corners[4][2] = {
                        {bounds.minX, bounds.minY},
                        {bounds.maxX, bounds.minY},
                        {bounds.maxX, bounds.maxY},
                        {bounds.minX, bounds.maxY},
                    };
                    float bestDist = std::numeric_limits<float>::infinity();
                    int bestIndex = -1;
                    for (int i = 0; i < 4; ++i) {
                        const float dx = x - corners[i][0];
                        const float dy = y - corners[i][1];
                        const float dist = std::sqrt(dx * dx + dy * dy);
                        if (dist <= tolerance && dist < bestDist) {
                            bestDist = dist;
                            bestIndex = i;
                        }
                    }

                    if (bestIndex >= 0) {
                        return {
                            selection.front(),
                            static_cast<std::uint16_t>(PickEntityKind::Unknown),
                            static_cast<std::uint8_t>(PickSubTarget::ResizeHandle),
                            bestIndex,
                            bestDist,
                            x,
                            y
                        };
                    }
                }
            }
        }
    }

    return pickSystem_.pickEx(x, y, tolerance, viewScale, pickMask, entityManager_, textSystem_);
}

// Query methods (queryArea, queryMarquee, getEntityAabb) moved to engine/engine_query.cpp
// Overlay methods (getSelectionOutlineMeta, getSelectionHandleMeta) moved to engine/engine_overlay.cpp

std::vector<std::uint32_t> CadEngine::getSelectionIds() const {
    return selectionManager_.getOrdered();
}





void CadEngine::clearSelection() {
    selectionManager_.clearSelection(*this);
}

void CadEngine::setSelection(const std::uint32_t* ids, std::uint32_t idCount, SelectionMode mode) {
    selectionManager_.setSelection(ids, idCount, static_cast<SelectionManager::Mode>(mode), *this);
}

void CadEngine::selectByPick(const PickResult& pick, std::uint32_t modifiers) {
    selectionManager_.selectByPick(pick, modifiers, *this);
}

void CadEngine::marqueeSelect(float minX, float minY, float maxX, float maxY, SelectionMode mode, int hitMode) {
    selectionManager_.marqueeSelect(minX, minY, maxX, maxY, static_cast<SelectionManager::Mode>(mode), static_cast<SelectionManager::MarqueeMode>(hitMode), *this);
}

std::vector<std::uint32_t> CadEngine::getDrawOrderSnapshot() const {
    return entityManager_.drawOrderIds;
}

void CadEngine::reorderEntities(const std::uint32_t* ids, std::uint32_t idCount, ReorderAction action, std::uint32_t refId) {
    (void)refId;
    if (idCount == 0) return;

    auto& order = entityManager_.drawOrderIds;
    if (order.empty()) return;

    std::unordered_set<std::uint32_t> moveSet;
    moveSet.reserve(idCount * 2);
    for (std::uint32_t i = 0; i < idCount; i++) {
        const std::uint32_t id = ids[i];
        if (entityManager_.entities.find(id) == entityManager_.entities.end()) continue;
        moveSet.insert(id);
    }
    if (moveSet.empty()) return;

    const bool historyStarted = beginHistoryEntry();
    markDrawOrderChange();
    bool changed = false;

    switch (action) {
        case ReorderAction::BringToFront: {
            std::vector<std::uint32_t> keep;
            std::vector<std::uint32_t> moved;
            keep.reserve(order.size());
            moved.reserve(moveSet.size());
            for (const auto id : order) {
                if (moveSet.find(id) != moveSet.end()) {
                    moved.push_back(id);
                } else {
                    keep.push_back(id);
                }
            }
            if (!moved.empty()) {
                keep.insert(keep.end(), moved.begin(), moved.end());
                order.swap(keep);
                changed = true;
            }
            break;
        }
        case ReorderAction::SendToBack: {
            std::vector<std::uint32_t> keep;
            std::vector<std::uint32_t> moved;
            keep.reserve(order.size());
            moved.reserve(moveSet.size());
            for (const auto id : order) {
                if (moveSet.find(id) != moveSet.end()) {
                    moved.push_back(id);
                } else {
                    keep.push_back(id);
                }
            }
            if (!moved.empty()) {
                moved.insert(moved.end(), keep.begin(), keep.end());
                order.swap(moved);
                changed = true;
            }
            break;
        }
        case ReorderAction::BringForward: {
            if (order.size() < 2) break;
            for (std::size_t i = order.size() - 1; i > 0; --i) {
                const std::uint32_t curr = order[i - 1];
                const std::uint32_t next = order[i];
                if (moveSet.find(curr) != moveSet.end() && moveSet.find(next) == moveSet.end()) {
                    std::swap(order[i - 1], order[i]);
                    changed = true;
                }
            }
            break;
        }
        case ReorderAction::SendBackward: {
            if (order.size() < 2) break;
            for (std::size_t i = 1; i < order.size(); ++i) {
                const std::uint32_t curr = order[i];
                const std::uint32_t prev = order[i - 1];
                if (moveSet.find(curr) != moveSet.end() && moveSet.find(prev) == moveSet.end()) {
                    std::swap(order[i - 1], order[i]);
                    changed = true;
                }
            }
            break;
        }
        default:
            break;
    }

    if (!changed) {
        if (historyStarted) commitHistoryEntry();
        return;
    }
    pickSystem_.setDrawOrder(order);
    renderDirty = true;
    recordOrderChanged();
    generation++;
    if (!selectionManager_.isEmpty()) selectionManager_.rebuildOrder(entityManager_.drawOrderIds);
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::clearWorld() noexcept {
    entityManager_.clear();
    pickSystem_.clear();
    textSystem_.clear();
    viewScale = 1.0f;
    triangleVertices.clear();
    lineVertices.clear();
    renderRanges_.clear();
    snapshotBytes.clear();
    selectionManager_.clear();
    nextEntityId_ = 1;
    lastLoadMs = 0.0f;
    lastRebuildMs = 0.0f;
    lastApplyMs = 0.0f;
    rebuildAllGeometryCount_ = 0;
    pendingFullRebuild_ = false;
    renderDirty = true;
    snapshotDirty = true;
    textQuadsDirty_ = true;
    clearEventState();
    recordDocChanged(
        static_cast<std::uint32_t>(ChangeMask::Geometry)
        | static_cast<std::uint32_t>(ChangeMask::Style)
        | static_cast<std::uint32_t>(ChangeMask::Flags)
        | static_cast<std::uint32_t>(ChangeMask::Layer)
        | static_cast<std::uint32_t>(ChangeMask::Order)
        | static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds)
    );
    recordSelectionChanged();
    recordOrderChanged();
}

// Event system methods moved to engine_event.cpp

// captureEntitySnapshot removed, delegated to HistoryManager




// apply*Snapshot methods and applyHistoryEntry delegated to HistoryManager


void CadEngine::trackNextEntityId(std::uint32_t id) {
    if (id >= nextEntityId_) {
        nextEntityId_ = id + 1;
    }
}

void CadEngine::deleteEntity(std::uint32_t id) noexcept {
    const bool historyStarted = beginHistoryEntry();
    renderDirty = true;
    snapshotDirty = true;
    
    pickSystem_.remove(id);

    // Check if it's text first, as text is managed by CadEngine/TextStore logic
    auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end()) {
        if (historyStarted) commitHistoryEntry();
        return;
    }

    markEntityChange(id);
    markDrawOrderChange();

    if (it->second.kind == EntityKind::Text) {
         deleteText(id);
         if (historyStarted) commitHistoryEntry();
         return;
    }

    // Delegate to EntityManager for all geometry
    entityManager_.deleteEntity(id);
    recordEntityDeleted(id);
    selectionManager_.prune(*this);
    if (historyStarted) commitHistoryEntry();
}

// Entity upsert methods moved to engine/engine_upsert.cpp

// Command dispatch logic moved to engine/command_dispatch.cpp

bool CadEngine::applyTextStyle(const engine::text::ApplyTextStylePayload& payload, const std::uint8_t* params, std::uint32_t paramsLen) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(payload.textId);
    if (!textSystem_.applyTextStyle(payload, params, paramsLen)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    // Updates are handled internally by TextSystem, but CadEngine needs to update its global state
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(payload.textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(payload.textId, {minX, minY, maxX, maxY});
    }
    
    if (historyStarted) commitHistoryEntry();
    return true;
}

// getTextStyleSnapshot moved to engine_snapshot.cpp
void CadEngine::compactPolylinePoints() {
    entityManager_.compactPolylinePoints();
}

std::vector<std::uint8_t> CadEngine::encodeHistoryBytes() const {
    return historyManager_.encodeBytes();
}


void CadEngine::decodeHistoryBytes(const std::uint8_t* bytes, std::size_t byteCount) {
    historyManager_.decodeBytes(bytes, byteCount);
    recordHistoryChanged();
}

// Render methods moved to engine_render.cpp

// Text System methods moved to engine/engine_text.cpp


// ==============================================================================
// Interaction Session Implementation
// ==============================================================================

void CadEngine::beginTransform(
    const std::uint32_t* ids,
    std::uint32_t idCount,
    TransformMode mode,
    std::uint32_t specificId,
    int32_t vertexIndex,
    float screenX,
    float screenY,
    float viewXParam,
    float viewYParam,
    float viewScaleParam,
    float viewWidthParam,
    float viewHeightParam,
    std::uint32_t modifiers
) {
    interactionSession_.beginTransform(
        ids,
        idCount,
        mode,
        specificId,
        vertexIndex,
        screenX,
        screenY,
        viewXParam,
        viewYParam,
        viewScaleParam,
        viewWidthParam,
        viewHeightParam,
        modifiers);
}

// ==============================================================================
// Draft System Implementation
// ==============================================================================

void CadEngine::beginDraft(const BeginDraftPayload& p) {
    interactionSession_.beginDraft(p);
}

void CadEngine::updateDraft(float x, float y, std::uint32_t modifiers) {
    interactionSession_.updateDraft(x, y, modifiers);
}

void CadEngine::appendDraftPoint(float x, float y, std::uint32_t modifiers) {
    interactionSession_.appendDraftPoint(x, y, modifiers);
}

void CadEngine::cancelDraft() {
    interactionSession_.cancelDraft();
}

std::uint32_t CadEngine::commitDraft() {
    return interactionSession_.commitDraft();
}

DraftDimensions CadEngine::getDraftDimensions() const {
    return interactionSession_.getDraftDimensions();
}

void CadEngine::updateTransform(
    float screenX,
    float screenY,
    float viewXParam,
    float viewYParam,
    float viewScaleParam,
    float viewWidthParam,
    float viewHeightParam,
    std::uint32_t modifiers) {
    interactionSession_.updateTransform(
        screenX,
        screenY,
        viewXParam,
        viewYParam,
        viewScaleParam,
        viewWidthParam,
        viewHeightParam,
        modifiers);
}

void CadEngine::commitTransform() {
    interactionSession_.commitTransform();
}

void CadEngine::cancelTransform() {
    interactionSession_.cancelTransform();
}

void CadEngine::setSnapOptions(bool enabled, bool gridEnabled, float gridSize, float tolerancePx, bool endpointEnabled, bool midpointEnabled, bool centerEnabled, bool nearestEnabled) {
    interactionSession_.snapOptions.enabled = enabled;
    interactionSession_.snapOptions.gridEnabled = gridEnabled;
    interactionSession_.snapOptions.gridSize = gridSize;
    interactionSession_.snapOptions.tolerancePx = tolerancePx;
    interactionSession_.snapOptions.endpointEnabled = endpointEnabled;
    interactionSession_.snapOptions.midpointEnabled = midpointEnabled;
    interactionSession_.snapOptions.centerEnabled = centerEnabled;
    interactionSession_.snapOptions.nearestEnabled = nearestEnabled;
}

std::pair<float, float> CadEngine::getSnappedPoint(float x, float y) const {
    if (!interactionSession_.snapOptions.enabled || !interactionSession_.snapOptions.gridEnabled || interactionSession_.snapOptions.gridSize <= 0.0001f) {
        return {x, y};
    }
    float s = interactionSession_.snapOptions.gridSize;
    return {std::round(x / s) * s, std::round(y / s) * s};
}

#include "engine/internal/engine_state_aliases_undef.h"
