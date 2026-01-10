// CadEngine event system methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state.h"

void CadEngine::clearEventState() {
    state().eventHead_ = 0;
    state().eventTail_ = 0;
    state().eventCount_ = 0;
    state().eventOverflowed_ = false;
    state().eventOverflowGeneration_ = 0;
    state().pendingEntityChanges_.clear();
    state().pendingEntityCreates_.clear();
    state().pendingEntityDeletes_.clear();
    state().pendingLayerChanges_.clear();
    state().pendingDocMask_ = 0;
    state().pendingSelectionChanged_ = false;
    state().pendingOrderChanged_ = false;
    state().pendingHistoryChanged_ = false;
}

void CadEngine::recordDocChanged(std::uint32_t mask) {
    if (state().eventOverflowed_) return;
    state().pendingDocMask_ |= mask;
}

void CadEngine::recordEntityChanged(std::uint32_t id, std::uint32_t mask) {
    if (state().eventOverflowed_) return;
    if (state().pendingEntityDeletes_.find(id) != state().pendingEntityDeletes_.end()) return;
    state().pendingEntityChanges_[id] |= mask;
    recordDocChanged(mask);
}

void CadEngine::recordEntityCreated(std::uint32_t id, std::uint32_t kind) {
    if (state().eventOverflowed_) return;
    state().pendingEntityDeletes_.erase(id);
    state().pendingEntityChanges_.erase(id);
    state().pendingEntityCreates_[id] = kind;
    std::uint32_t docMask =
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Layer)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Flags)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds);
    if (kind == static_cast<std::uint32_t>(EntityKind::Text)) {
        docMask |= static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text);
    }
    recordDocChanged(docMask);
    recordOrderChanged();
}

void CadEngine::recordEntityDeleted(std::uint32_t id) {
    if (state().eventOverflowed_) return;
    state().pendingEntityDeletes_.insert(id);
    state().pendingEntityChanges_.erase(id);
    state().pendingEntityCreates_.erase(id);
    recordDocChanged(
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Layer)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds)
    );
    recordOrderChanged();
}

void CadEngine::recordLayerChanged(std::uint32_t layerId, std::uint32_t mask) {
    if (state().eventOverflowed_) return;
    state().pendingLayerChanges_[layerId] |= mask;
    recordDocChanged(static_cast<std::uint32_t>(engine::protocol::ChangeMask::Layer));
}

void CadEngine::recordSelectionChanged() {
    if (state().eventOverflowed_) return;
    state().pendingSelectionChanged_ = true;
}

void CadEngine::recordOrderChanged() {
    if (state().eventOverflowed_) return;
    state().pendingOrderChanged_ = true;
    recordDocChanged(static_cast<std::uint32_t>(engine::protocol::ChangeMask::Order));
}

void CadEngine::recordHistoryChanged() {
    if (state().eventOverflowed_) return;
    state().pendingHistoryChanged_ = true;
}

bool CadEngine::pushEvent(const engine::protocol::EngineEvent& ev) {
    if (state().eventOverflowed_) return false;
    if (state().eventCount_ >= kMaxEvents) {
        state().eventOverflowed_ = true;
        state().eventOverflowGeneration_ = state().generation;
        state().eventHead_ = 0;
        state().eventTail_ = 0;
        state().eventCount_ = 0;
        return false;
    }
    state().eventQueue_[state().eventTail_] = ev;
    state().eventTail_ = (state().eventTail_ + 1) % kMaxEvents;
    state().eventCount_++;
    return true;
}

void CadEngine::flushPendingEvents() {
    if (state().eventOverflowed_) {
        state().pendingEntityChanges_.clear();
        state().pendingEntityCreates_.clear();
        state().pendingEntityDeletes_.clear();
        state().pendingLayerChanges_.clear();
        state().pendingDocMask_ = 0;
        state().pendingSelectionChanged_ = false;
        state().pendingOrderChanged_ = false;
        state().pendingHistoryChanged_ = false;
        return;
    }

    if (state().pendingDocMask_ == 0 &&
        state().pendingEntityChanges_.empty() &&
        state().pendingEntityCreates_.empty() &&
        state().pendingEntityDeletes_.empty() &&
        state().pendingLayerChanges_.empty() &&
        !state().pendingSelectionChanged_ &&
        !state().pendingOrderChanged_ &&
        !state().pendingHistoryChanged_) {
        return;
    }

    auto pushOrOverflow = [&](const engine::protocol::EngineEvent& ev) -> bool {
        if (!pushEvent(ev)) {
            state().pendingEntityChanges_.clear();
            state().pendingEntityCreates_.clear();
            state().pendingEntityDeletes_.clear();
            state().pendingLayerChanges_.clear();
            state().pendingDocMask_ = 0;
            state().pendingSelectionChanged_ = false;
            state().pendingOrderChanged_ = false;
            state().pendingHistoryChanged_ = false;
            return false;
        }
        return true;
    };

    if (state().pendingDocMask_ != 0) {
        if (!pushOrOverflow(engine::protocol::EngineEvent{
                static_cast<std::uint16_t>(engine::protocol::EventType::DocChanged),
                0,
                state().pendingDocMask_,
                0,
                0,
                0,
            })) {
            return;
        }
    }

    if (!state().pendingLayerChanges_.empty()) {
        std::vector<std::uint32_t> layerIds;
        layerIds.reserve(state().pendingLayerChanges_.size());
        for (const auto& kv : state().pendingLayerChanges_) layerIds.push_back(kv.first);
        std::sort(layerIds.begin(), layerIds.end());
        for (const std::uint32_t id : layerIds) {
            if (!pushOrOverflow(engine::protocol::EngineEvent{
                    static_cast<std::uint16_t>(engine::protocol::EventType::LayerChanged),
                    0,
                    id,
                    state().pendingLayerChanges_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!state().pendingEntityCreates_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(state().pendingEntityCreates_.size());
        for (const auto& kv : state().pendingEntityCreates_) ids.push_back(kv.first);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(engine::protocol::EngineEvent{
                    static_cast<std::uint16_t>(engine::protocol::EventType::EntityCreated),
                    0,
                    id,
                    state().pendingEntityCreates_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!state().pendingEntityChanges_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(state().pendingEntityChanges_.size());
        for (const auto& kv : state().pendingEntityChanges_) ids.push_back(kv.first);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(engine::protocol::EngineEvent{
                    static_cast<std::uint16_t>(engine::protocol::EventType::EntityChanged),
                    0,
                    id,
                    state().pendingEntityChanges_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!state().pendingEntityDeletes_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(state().pendingEntityDeletes_.size());
        for (const auto& id : state().pendingEntityDeletes_) ids.push_back(id);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(engine::protocol::EngineEvent{
                    static_cast<std::uint16_t>(engine::protocol::EventType::EntityDeleted),
                    0,
                    id,
                    0,
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (state().pendingSelectionChanged_) {
        if (!pushOrOverflow(engine::protocol::EngineEvent{
                static_cast<std::uint16_t>(engine::protocol::EventType::SelectionChanged),
                0,
                state().selectionManager_.getGeneration(),
                static_cast<std::uint32_t>(state().selectionManager_.getOrdered().size()),
                0,
                0,
            })) {
            return;
        }
    }

    if (state().pendingOrderChanged_) {
        if (!pushOrOverflow(engine::protocol::EngineEvent{
                static_cast<std::uint16_t>(engine::protocol::EventType::OrderChanged),
                0,
                state().generation,
                static_cast<std::uint32_t>(state().entityManager_.drawOrderIds.size()),
                0,
                0,
            })) {
            return;
        }
    }

    if (state().pendingHistoryChanged_) {
        if (!pushOrOverflow(engine::protocol::EngineEvent{
                static_cast<std::uint16_t>(engine::protocol::EventType::HistoryChanged),
                0,
                state().generation,
                0,
                0,
                0,
            })) {
            return;
        }
    }

    state().pendingEntityChanges_.clear();
    state().pendingEntityCreates_.clear();
    state().pendingEntityDeletes_.clear();
    state().pendingLayerChanges_.clear();
    state().pendingDocMask_ = 0;
    state().pendingSelectionChanged_ = false;
    state().pendingOrderChanged_ = false;
    state().pendingHistoryChanged_ = false;
}

void CadEngine::clearHistory() {
    state().historyManager_.clear();
    recordHistoryChanged();
}

bool CadEngine::beginHistoryEntry() {
    return state().historyManager_.beginEntry(state().nextEntityId_);
}

void CadEngine::discardHistoryEntry() {
    state().historyManager_.discardEntry();
}

void CadEngine::pushHistoryEntry(HistoryEntry&& entry) {
    state().historyManager_.pushHistoryEntry(std::move(entry));
    recordHistoryChanged();
}

void CadEngine::markEntityChange(std::uint32_t id) {
    state().historyManager_.markEntityChange(id);
}

void CadEngine::markLayerChange() {
    state().historyManager_.markLayerChange();
}

void CadEngine::markDrawOrderChange() {
    state().historyManager_.markDrawOrderChange();
}

void CadEngine::markSelectionChange() {
    state().historyManager_.markSelectionChange(state().selectionManager_.getOrdered());
}

void CadEngine::commitHistoryEntry() {
    if (state().historyManager_.commitEntry(state().nextEntityId_, state().generation, state().selectionManager_.getOrdered())) {
        recordHistoryChanged();
    }
}

engine::protocol::EventBufferMeta CadEngine::pollEvents(std::uint32_t maxEvents) {
    flushPendingEvents();

    state().eventBuffer_.clear();
    if (state().eventOverflowed_) {
        state().eventBuffer_.push_back(engine::protocol::EngineEvent{
            static_cast<std::uint16_t>(engine::protocol::EventType::Overflow),
            0,
            state().eventOverflowGeneration_,
            0,
            0,
            0,
        });
        return engine::protocol::EventBufferMeta{
            state().generation,
            static_cast<std::uint32_t>(state().eventBuffer_.size()),
            reinterpret_cast<std::uintptr_t>(state().eventBuffer_.data()),
        };
    }

    if (state().eventCount_ == 0 || maxEvents == 0) {
        return engine::protocol::EventBufferMeta{state().generation, 0, 0};
    }

    const std::size_t count = std::min<std::size_t>(maxEvents, state().eventCount_);
    state().eventBuffer_.reserve(count);
    for (std::size_t i = 0; i < count; ++i) {
        state().eventBuffer_.push_back(state().eventQueue_[state().eventHead_]);
        state().eventHead_ = (state().eventHead_ + 1) % kMaxEvents;
        state().eventCount_--;
    }

    return engine::protocol::EventBufferMeta{
        state().generation,
        static_cast<std::uint32_t>(state().eventBuffer_.size()),
        reinterpret_cast<std::uintptr_t>(state().eventBuffer_.data()),
    };
}

void CadEngine::ackResync(std::uint32_t resyncGeneration) {
    if (!state().eventOverflowed_) return;
    if (resyncGeneration < state().eventOverflowGeneration_) return;
    state().eventOverflowed_ = false;
    state().eventOverflowGeneration_ = 0;
    state().eventHead_ = 0;
    state().eventTail_ = 0;
    state().eventCount_ = 0;
    state().pendingEntityChanges_.clear();
    state().pendingEntityCreates_.clear();
    state().pendingEntityDeletes_.clear();
    state().pendingLayerChanges_.clear();
    state().pendingDocMask_ = 0;
    state().pendingSelectionChanged_ = false;
    state().pendingOrderChanged_ = false;
    state().pendingHistoryChanged_ = false;
}

