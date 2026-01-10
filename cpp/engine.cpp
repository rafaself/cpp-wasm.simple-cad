// engine.cpp now contains only a thin TU; public `CadEngine` lives in engine/engine.h
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/command/command_dispatch.h"
#include "engine/core/string_utils.h"
#include "engine/plugin/engine_plugin_api.h"

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
    state().lastError = EngineError::Ok;
}

void CadEngine::setError(EngineError err) const {
    state().lastError = err;
}

void CadEngine::setNextEntityId(std::uint32_t id) {
    state().nextEntityId_ = id;
}

std::uint32_t CadEngine::getSelectionGeneration() const noexcept {
    return state().selectionManager_.getGeneration();
}

bool CadEngine::isEntityVisibleForRender(std::uint32_t id) const noexcept {
    return state().entityManager_.isEntityVisible(id);
}

bool CadEngine::hasPendingEvents() const noexcept {
    // Check both flushed events (state().eventCount_) and pending events that haven't been flushed yet
    return state().eventCount_ > 0 
        || state().pendingDocMask_ != 0 
        || !state().pendingEntityChanges_.empty()
        || !state().pendingEntityCreates_.empty()
        || !state().pendingEntityDeletes_.empty()
        || !state().pendingLayerChanges_.empty()
        || state().pendingSelectionChanged_
        || state().pendingOrderChanged_
        || state().pendingHistoryChanged_
        || state().eventOverflowed_;
}

bool CadEngine::isTextQuadsDirty() const {
    return state().textQuadsDirty_;
}

void CadEngine::markTextQuadsDirty() const {
    state().textQuadsDirty_ = true;
    if (state().textSystem_.initialized) {
        state().textSystem_.quadsDirty = true;
    }
}

bool CadEngine::isInteractionActive() const {
    return state().interactionSession_.isInteractionActive();
}

TransformState CadEngine::getTransformState() const {
    return state().interactionSession_.getTransformState();
}

std::uint32_t CadEngine::getCommitResultCount() const {
    return static_cast<std::uint32_t>(state().interactionSession_.getCommitResultIds().size());
}

std::uintptr_t CadEngine::getCommitResultIdsPtr() const {
    return reinterpret_cast<std::uintptr_t>(state().interactionSession_.getCommitResultIds().data());
}

std::uintptr_t CadEngine::getCommitResultOpCodesPtr() const {
    return reinterpret_cast<std::uintptr_t>(state().interactionSession_.getCommitResultOpCodes().data());
}

std::uintptr_t CadEngine::getCommitResultPayloadsPtr() const {
    return reinterpret_cast<std::uintptr_t>(state().interactionSession_.getCommitResultPayloads().data());
}

void CadEngine::setTransformLogEnabled(bool enabled, std::uint32_t maxEntries, std::uint32_t maxIds) {
    state().interactionSession_.setTransformLogEnabled(enabled, maxEntries, maxIds);
}

void CadEngine::clearTransformLog() {
    state().interactionSession_.clearTransformLog();
}

bool CadEngine::replayTransformLog() {
    return state().interactionSession_.replayTransformLog();
}

bool CadEngine::isTransformLogOverflowed() const {
    return state().interactionSession_.isTransformLogOverflowed();
}

std::uint32_t CadEngine::getTransformLogCount() const {
    return static_cast<std::uint32_t>(state().interactionSession_.getTransformLogEntries().size());
}

std::uintptr_t CadEngine::getTransformLogPtr() const {
    return reinterpret_cast<std::uintptr_t>(state().interactionSession_.getTransformLogEntries().data());
}

std::uint32_t CadEngine::getTransformLogIdCount() const {
    return static_cast<std::uint32_t>(state().interactionSession_.getTransformLogIds().size());
}

std::uintptr_t CadEngine::getTransformLogIdsPtr() const {
    return reinterpret_cast<std::uintptr_t>(state().interactionSession_.getTransformLogIds().data());
}

void CadEngine::clear() noexcept {
    clearWorld();
    clearHistory();
    state().generation++;
}

void CadEngine::registerDomainExtension(std::unique_ptr<engine::domain::DomainExtension> extension) {
    if (!extension) return;
    state().domainExtensions_.push_back(std::move(extension));
}

bool CadEngine::registerPlugin(const EnginePluginApiV1* plugin) {
    if (!plugin || plugin->abi_version != kEnginePluginAbiV1 || !plugin->handle_command) {
        setError(EngineError::InvalidOperation);
        return false;
    }
    state().pluginExtensions_.push_back(plugin);
    return true;
}

std::uintptr_t CadEngine::allocBytes(std::uint32_t byteCount) {
    if (byteCount == 0) return 0;
    void* p = std::malloc(byteCount);
    if (!p) {
        setError(EngineError::OutOfMemory);
        return 0;
    }
    return reinterpret_cast<std::uintptr_t>(p);
}

void CadEngine::freeBytes(std::uintptr_t ptr) {
    std::free(reinterpret_cast<void*>(ptr));
}

std::uint32_t CadEngine::allocateEntityId() {
    const std::uint32_t id = state().nextEntityId_;
    state().nextEntityId_ = (state().nextEntityId_ == std::numeric_limits<std::uint32_t>::max()) ? state().nextEntityId_ : (state().nextEntityId_ + 1);
    return id;
}

std::uint32_t CadEngine::allocateLayerId() {
    const std::uint32_t id = state().nextLayerId_;
    state().nextLayerId_ = (state().nextLayerId_ == std::numeric_limits<std::uint32_t>::max()) ? state().nextLayerId_ : (state().nextLayerId_ + 1);
    return id;
}

void CadEngine::reserveWorld(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints) {
    state().entityManager_.reserve(maxRects, maxLines, maxPolylines, maxPoints);

    state().triangleVertices.reserve(static_cast<std::size_t>(maxRects) * rectTriangleFloats);
    state().lineVertices.reserve(
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
    state().renderDirty = true;
    state().snapshotDirty = true;
    state().generation++;

    const double t1 = emscripten_get_now();
    state().lastApplyMs = static_cast<float>(t1 - t0);
    state().lastLoadMs = 0.0f;
    state().lastRebuildMs = 0.0f;
}

std::uint32_t CadEngine::getVertexCount() const noexcept {
    if (state().renderDirty) rebuildRenderBuffers();
    return static_cast<std::uint32_t>(state().triangleVertices.size() / 7);
}

std::uintptr_t CadEngine::getVertexDataPtr() const noexcept {
    if (state().renderDirty) rebuildRenderBuffers();
    return reinterpret_cast<std::uintptr_t>(state().triangleVertices.data());
}

engine::protocol::BufferMeta CadEngine::buildMeta(const std::vector<float>& buffer, std::size_t floatsPerVertex) const noexcept {
    const std::uint32_t vertexCount = static_cast<std::uint32_t>(buffer.size() / floatsPerVertex);
    const std::uint32_t capacityVertices = static_cast<std::uint32_t>(buffer.capacity() / floatsPerVertex);
    const std::uint32_t floatCount = static_cast<std::uint32_t>(buffer.size());
    return engine::protocol::BufferMeta{state().generation, vertexCount, capacityVertices, floatCount, reinterpret_cast<std::uintptr_t>(buffer.data())};
}

engine::protocol::BufferMeta CadEngine::getPositionBufferMeta() const noexcept { 
    if (state().renderDirty) rebuildRenderBuffers();
    return buildMeta(state().triangleVertices, 7); 
}
engine::protocol::BufferMeta CadEngine::getLineBufferMeta() const noexcept { 
    if (state().renderDirty) rebuildRenderBuffers();
    return buildMeta(state().lineVertices, 7); 
}

engine::protocol::ByteBufferMeta CadEngine::saveSnapshot() const noexcept {
    if (state().snapshotDirty) rebuildSnapshotBytes();
    return engine::protocol::ByteBufferMeta{state().generation, static_cast<std::uint32_t>(state().snapshotBytes.size()), reinterpret_cast<std::uintptr_t>(state().snapshotBytes.data())};
}

engine::protocol::ByteBufferMeta CadEngine::getSnapshotBufferMeta() const noexcept {
    return saveSnapshot();
}

engine::protocol::EngineStats CadEngine::getStats() const noexcept {
    if (state().renderDirty) rebuildRenderBuffers();
    return engine::protocol::EngineStats{
        state().generation,
        static_cast<std::uint32_t>(state().entityManager_.rects.size()),
        static_cast<std::uint32_t>(state().entityManager_.lines.size()),
        static_cast<std::uint32_t>(state().entityManager_.polylines.size()),
        static_cast<std::uint32_t>(state().entityManager_.points.size()),
        static_cast<std::uint32_t>(state().triangleVertices.size() / 7),
        static_cast<std::uint32_t>(state().lineVertices.size() / 7),
        state().rebuildAllGeometryCount_,
        state().lastLoadMs,
        state().lastRebuildMs,
        state().lastApplyMs,
        state().interactionSession_.getLastTransformUpdateMs(),
        state().interactionSession_.getLastSnapCandidateCount(),
        state().interactionSession_.getLastSnapHitCount()
    };
}

// Document digest moved to engine/engine_digest.cpp

engine::protocol::HistoryMeta CadEngine::getHistoryMeta() const noexcept {
    return engine::protocol::HistoryMeta{
        static_cast<std::uint32_t>(state().historyManager_.getHistorySize()),
        static_cast<std::uint32_t>(state().historyManager_.getCursor()),
        state().historyManager_.getGeneration(),
    };
}

bool CadEngine::canUndo() const noexcept {
    return state().historyManager_.canUndo();
}

bool CadEngine::canRedo() const noexcept {
    return state().historyManager_.canRedo();
}

void CadEngine::undo() {
    state().historyManager_.undo(*this);
}

void CadEngine::redo() {
    state().historyManager_.redo(*this);
}

std::vector<LayerRecord> CadEngine::getLayersSnapshot() const {
    return state().entityManager_.layerStore.snapshot();
}

std::string CadEngine::getLayerName(std::uint32_t layerId) const {
    return state().entityManager_.layerStore.getLayerName(layerId);
}

void CadEngine::setLayerProps(std::uint32_t layerId, std::uint32_t propsMask, std::uint32_t flagsValue, const std::string& name) {
    const bool historyStarted = beginHistoryEntry();
    if (propsMask != 0) {
        markLayerChange();
    }
    state().entityManager_.layerStore.ensureLayer(layerId);

    const std::uint32_t visiblePropMask = static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible);
    const std::uint32_t lockedPropMask = static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Locked);
    const std::uint32_t nameMask = static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Name);

    const std::uint32_t visibleFlag = static_cast<std::uint32_t>(LayerFlags::Visible);
    const std::uint32_t lockedFlag = static_cast<std::uint32_t>(LayerFlags::Locked);

    std::uint32_t translatedMask = 0;
    std::uint32_t translatedValue = 0;
    if (propsMask & visiblePropMask) {
        translatedMask |= visibleFlag;
        if (flagsValue & visibleFlag) {
            translatedValue |= visibleFlag;
        }
    }
    if (propsMask & lockedPropMask) {
        translatedMask |= lockedFlag;
        if (flagsValue & lockedFlag) {
            translatedValue |= lockedFlag;
        }
    }

    bool visibilityChanged = false;
    bool lockedChanged = false;
    bool nameChanged = false;

    if (translatedMask != 0) {
        const std::uint32_t prevFlags = state().entityManager_.layerStore.getLayerFlags(layerId);
        state().entityManager_.layerStore.setLayerFlags(layerId, translatedMask, translatedValue);
        const std::uint32_t nextFlags = state().entityManager_.layerStore.getLayerFlags(layerId);
        visibilityChanged = ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(LayerFlags::Visible)) != 0;
        lockedChanged = ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(LayerFlags::Locked)) != 0;
    }

    if ((propsMask & nameMask) != 0) {
        const std::string prevName = state().entityManager_.layerStore.getLayerName(layerId);
        state().entityManager_.layerStore.setLayerName(layerId, name);
        nameChanged = prevName != name;
    }

    if (visibilityChanged) {
        state().renderDirty = true;
        state().textQuadsDirty_ = true;
    }

    if (visibilityChanged || lockedChanged) {
        state().selectionManager_.prune(*this);
    }

    const std::uint32_t changedMask =
        (visibilityChanged ? visiblePropMask : 0)
        | (lockedChanged ? lockedPropMask : 0)
        | (nameChanged ? nameMask : 0);

    if (changedMask != 0) {
        recordLayerChanged(layerId, changedMask);
        state().generation++;
    }
    if (historyStarted) commitHistoryEntry();
}

bool CadEngine::deleteLayer(std::uint32_t layerId) {
    const bool historyStarted = beginHistoryEntry();
    markLayerChange();
    const bool deleted = state().entityManager_.layerStore.deleteLayer(layerId);
    if (deleted) {
        state().renderDirty = true;
        state().textQuadsDirty_ = true;
        recordLayerChanged(
            layerId,
            static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Name)
            | static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible)
            | static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Locked)
        );
        state().generation++;
    }
    if (historyStarted) commitHistoryEntry();
    return deleted;
}

std::uint32_t CadEngine::getEntityFlags(std::uint32_t entityId) const {
    return state().entityManager_.getEntityFlags(entityId);
}

void CadEngine::setEntityFlags(std::uint32_t entityId, std::uint32_t flagsMask, std::uint32_t flagsValue) {
    const std::uint32_t prevFlags = state().entityManager_.getEntityFlags(entityId);
    const std::uint32_t nextFlags = (prevFlags & ~flagsMask) | (flagsValue & flagsMask);
    if (prevFlags == nextFlags) {
        return;
    }
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(entityId);
    state().entityManager_.setEntityFlags(entityId, flagsMask, flagsValue);
    if (((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Visible)) != 0) {
        state().renderDirty = true;
        state().textQuadsDirty_ = true;
    }
    if (((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Locked)) != 0 ||
        ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Visible)) != 0) {
        state().selectionManager_.prune(*this);
    }
    if (prevFlags != nextFlags) {
        recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Flags));
        state().generation++;
    }
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setEntityLayer(std::uint32_t entityId, std::uint32_t layerId) {
    const std::uint32_t prevLayer = state().entityManager_.getEntityLayer(entityId);
    if (prevLayer == layerId) {
        return;
    }
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(entityId);
    state().entityManager_.setEntityLayer(entityId, layerId);
    state().renderDirty = true;
    state().textQuadsDirty_ = true;
    state().selectionManager_.prune(*this);
    recordEntityChanged(entityId, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Layer));
    state().generation++;
    if (historyStarted) commitHistoryEntry();
}

std::uint32_t CadEngine::getEntityLayer(std::uint32_t entityId) const {
    return state().entityManager_.getEntityLayer(entityId);
}

std::uint32_t CadEngine::getEntityKind(std::uint32_t entityId) const {
    auto it = state().entityManager_.entities.find(entityId);
    if (it != state().entityManager_.entities.end()) {
        switch (it->second.kind) {
            case EntityKind::Rect: return static_cast<std::uint32_t>(PickEntityKind::Rect);
            case EntityKind::Line: return static_cast<std::uint32_t>(PickEntityKind::Line);
            case EntityKind::Polyline: return static_cast<std::uint32_t>(PickEntityKind::Polyline);
            case EntityKind::Circle: return static_cast<std::uint32_t>(PickEntityKind::Circle);
            case EntityKind::Polygon: return static_cast<std::uint32_t>(PickEntityKind::Polygon);
            case EntityKind::Arrow: return static_cast<std::uint32_t>(PickEntityKind::Arrow);
            case EntityKind::Text: return static_cast<std::uint32_t>(PickEntityKind::Text);
            default: return static_cast<std::uint32_t>(PickEntityKind::Unknown);
        }
    }
    return 0;
}

std::uint32_t CadEngine::pick(float x, float y, float tolerance) const noexcept {
    return state().pickSystem_.pick(x, y, tolerance, state().viewScale, state().entityManager_, state().textSystem_);
}

PickResult CadEngine::pickEx(float x, float y, float tolerance, std::uint32_t pickMask) const noexcept {
    constexpr std::uint32_t kPickHandlesMask = 1u << 3;
    if ((pickMask & kPickHandlesMask) != 0) {
        const auto& selection = state().selectionManager_.getOrdered();
        if (selection.size() >= 1) {
            bool allowSelectionHandles = true;
            if (selection.size() == 1) {
                const std::uint32_t id = selection.front();
                const auto it = state().entityManager_.entities.find(id);
                if (it != state().entityManager_.entities.end()) {
                    const EntityKind kind = it->second.kind;
                    if (kind == EntityKind::Line || kind == EntityKind::Polyline || kind == EntityKind::Arrow) {
                        // Endpoint handles for line-like entities should resolve to vertex dragging.
                        allowSelectionHandles = false;
                    }
                }
            }

            if (allowSelectionHandles) {
                const engine::protocol::EntityAabb bounds = getSelectionBounds();
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

    return state().pickSystem_.pickEx(x, y, tolerance, state().viewScale, pickMask, state().entityManager_, state().textSystem_);
}

// Query methods (queryArea, queryMarquee, getEntityAabb) moved to engine/engine_query.cpp
// Overlay methods (getSelectionOutlineMeta, getSelectionHandleMeta) moved to engine/engine_overlay.cpp

std::vector<std::uint32_t> CadEngine::getSelectionIds() const {
    return state().selectionManager_.getOrdered();
}





void CadEngine::clearSelection() {
    state().selectionManager_.clearSelection(*this);
}

void CadEngine::setSelection(const std::uint32_t* ids, std::uint32_t idCount, engine::protocol::SelectionMode mode) {
    state().selectionManager_.setSelection(ids, idCount, static_cast<SelectionManager::Mode>(mode), *this);
}

void CadEngine::selectByPick(const PickResult& pick, std::uint32_t modifiers) {
    state().selectionManager_.selectByPick(pick, modifiers, *this);
}

void CadEngine::marqueeSelect(float minX, float minY, float maxX, float maxY, engine::protocol::SelectionMode mode, int hitMode) {
    state().selectionManager_.marqueeSelect(minX, minY, maxX, maxY, static_cast<SelectionManager::Mode>(mode), static_cast<SelectionManager::MarqueeMode>(hitMode), *this);
}

std::vector<std::uint32_t> CadEngine::getDrawOrderSnapshot() const {
    return state().entityManager_.drawOrderIds;
}

void CadEngine::reorderEntities(const std::uint32_t* ids, std::uint32_t idCount, engine::protocol::ReorderAction action, std::uint32_t refId) {
    (void)refId;
    if (idCount == 0) return;

    auto& order = state().entityManager_.drawOrderIds;
    if (order.empty()) return;

    std::unordered_set<std::uint32_t> moveSet;
    moveSet.reserve(idCount * 2);
    for (std::uint32_t i = 0; i < idCount; i++) {
        const std::uint32_t id = ids[i];
        if (state().entityManager_.entities.find(id) == state().entityManager_.entities.end()) continue;
        moveSet.insert(id);
    }
    if (moveSet.empty()) return;

    const bool historyStarted = beginHistoryEntry();
    markDrawOrderChange();
    bool changed = false;

    switch (action) {
        case engine::protocol::ReorderAction::BringToFront: {
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
        case engine::protocol::ReorderAction::SendToBack: {
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
        case engine::protocol::ReorderAction::BringForward: {
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
        case engine::protocol::ReorderAction::SendBackward: {
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
    state().pickSystem_.setDrawOrder(order);
    state().renderDirty = true;
    recordOrderChanged();
    state().generation++;
    if (!state().selectionManager_.isEmpty()) state().selectionManager_.rebuildOrder(state().entityManager_.drawOrderIds);
    if (historyStarted) commitHistoryEntry();
}

void CadEngine::clearWorld() noexcept {
    state().entityManager_.clear();
    state().pickSystem_.clear();
    state().textSystem_.clear();
    state().viewScale = 1.0f;
    state().triangleVertices.clear();
    state().lineVertices.clear();
    state().renderRanges_.clear();
    state().snapshotBytes.clear();
    state().selectionManager_.clear();
    state().nextEntityId_ = 1;
    state().lastLoadMs = 0.0f;
    state().lastRebuildMs = 0.0f;
    state().lastApplyMs = 0.0f;
    state().rebuildAllGeometryCount_ = 0;
    state().pendingFullRebuild_ = false;
    state().renderDirty = true;
    state().snapshotDirty = true;
    state().textQuadsDirty_ = true;
    clearEventState();
    recordDocChanged(
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Flags)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Layer)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Order)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds)
    );
    recordSelectionChanged();
    recordOrderChanged();
}

// Event system methods moved to engine_event.cpp

// captureEntitySnapshot removed, delegated to HistoryManager




// apply*Snapshot methods and applyHistoryEntry delegated to HistoryManager


void CadEngine::trackNextEntityId(std::uint32_t id) {
    if (id >= state().nextEntityId_) {
        state().nextEntityId_ = id + 1;
    }
}

void CadEngine::deleteEntity(std::uint32_t id) noexcept {
    const bool historyStarted = beginHistoryEntry();
    state().renderDirty = true;
    state().snapshotDirty = true;
    
    state().pickSystem_.remove(id);

    // Check if it's text first, as text is managed by CadEngine/TextStore logic
    auto it = state().entityManager_.entities.find(id);
    if (it == state().entityManager_.entities.end()) {
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
    state().entityManager_.deleteEntity(id);
    recordEntityDeleted(id);
    state().selectionManager_.prune(*this);
    if (historyStarted) commitHistoryEntry();
}

// Entity upsert methods moved to engine/engine_upsert.cpp

// Command dispatch logic moved to engine/command_dispatch.cpp

bool CadEngine::applyTextStyle(const engine::text::ApplyTextStylePayload& payload, const std::uint8_t* params, std::uint32_t paramsLen) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(payload.textId);
    if (!state().textSystem_.applyTextStyle(payload, params, paramsLen)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    // Updates are handled internally by TextSystem, but CadEngine needs to update its global state
    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(payload.textId, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(payload.textId, {minX, minY, maxX, maxY});
    }

    recordEntityChanged(
        payload.textId,
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds)
    );
    
    if (historyStarted) commitHistoryEntry();
    return true;
}

// getTextStyleSnapshot moved to engine_snapshot.cpp
void CadEngine::compactPolylinePoints() {
    state().entityManager_.compactPolylinePoints();
}

std::vector<std::uint8_t> CadEngine::encodeHistoryBytes() const {
    return state().historyManager_.encodeBytes();
}


void CadEngine::decodeHistoryBytes(const std::uint8_t* bytes, std::size_t byteCount) {
    state().historyManager_.decodeBytes(bytes, byteCount);
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
    state().interactionSession_.beginTransform(
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
    state().interactionSession_.beginDraft(p);
}

void CadEngine::updateDraft(float x, float y, std::uint32_t modifiers) {
    state().interactionSession_.updateDraft(x, y, modifiers);
}

void CadEngine::appendDraftPoint(float x, float y, std::uint32_t modifiers) {
    state().interactionSession_.appendDraftPoint(x, y, modifiers);
}

void CadEngine::cancelDraft() {
    state().interactionSession_.cancelDraft();
}

std::uint32_t CadEngine::commitDraft() {
    return state().interactionSession_.commitDraft();
}

DraftDimensions CadEngine::getDraftDimensions() const {
    return state().interactionSession_.getDraftDimensions();
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
    state().interactionSession_.updateTransform(
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
    state().interactionSession_.commitTransform();
}

void CadEngine::cancelTransform() {
    state().interactionSession_.cancelTransform();
}

void CadEngine::setSnapOptions(bool enabled, bool gridEnabled, float gridSize, float tolerancePx, bool endpointEnabled, bool midpointEnabled, bool centerEnabled, bool nearestEnabled) {
    state().interactionSession_.snapOptions.enabled = enabled;
    state().interactionSession_.snapOptions.gridEnabled = gridEnabled;
    state().interactionSession_.snapOptions.gridSize = gridSize;
    state().interactionSession_.snapOptions.tolerancePx = tolerancePx;
    state().interactionSession_.snapOptions.endpointEnabled = endpointEnabled;
    state().interactionSession_.snapOptions.midpointEnabled = midpointEnabled;
    state().interactionSession_.snapOptions.centerEnabled = centerEnabled;
    state().interactionSession_.snapOptions.nearestEnabled = nearestEnabled;
}

std::pair<float, float> CadEngine::getSnappedPoint(float x, float y) const {
    if (!state().interactionSession_.snapOptions.enabled || !state().interactionSession_.snapOptions.gridEnabled || state().interactionSession_.snapOptions.gridSize <= 0.0001f) {
        return {x, y};
    }
    float s = state().interactionSession_.snapOptions.gridSize;
    return {std::round(x / s) * s, std::round(y / s) * s};
}
