// CadEngine event system methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"

void CadEngine::clearEventState() {
    eventHead_ = 0;
    eventTail_ = 0;
    eventCount_ = 0;
    eventOverflowed_ = false;
    eventOverflowGeneration_ = 0;
    pendingEntityChanges_.clear();
    pendingEntityCreates_.clear();
    pendingEntityDeletes_.clear();
    pendingLayerChanges_.clear();
    pendingDocMask_ = 0;
    pendingSelectionChanged_ = false;
    pendingOrderChanged_ = false;
    pendingHistoryChanged_ = false;
}

void CadEngine::recordDocChanged(std::uint32_t mask) {
    if (eventOverflowed_) return;
    pendingDocMask_ |= mask;
}

void CadEngine::recordEntityChanged(std::uint32_t id, std::uint32_t mask) {
    if (eventOverflowed_) return;
    if (pendingEntityDeletes_.find(id) != pendingEntityDeletes_.end()) return;
    pendingEntityChanges_[id] |= mask;
    recordDocChanged(mask);
}

void CadEngine::recordEntityCreated(std::uint32_t id, std::uint32_t kind) {
    if (eventOverflowed_) return;
    pendingEntityDeletes_.erase(id);
    pendingEntityChanges_.erase(id);
    pendingEntityCreates_[id] = kind;
    std::uint32_t docMask =
        static_cast<std::uint32_t>(ChangeMask::Geometry)
        | static_cast<std::uint32_t>(ChangeMask::Style)
        | static_cast<std::uint32_t>(ChangeMask::Layer)
        | static_cast<std::uint32_t>(ChangeMask::Flags)
        | static_cast<std::uint32_t>(ChangeMask::Bounds);
    if (kind == static_cast<std::uint32_t>(EntityKind::Text)) {
        docMask |= static_cast<std::uint32_t>(ChangeMask::Text);
    }
    recordDocChanged(docMask);
    recordOrderChanged();
}

void CadEngine::recordEntityDeleted(std::uint32_t id) {
    if (eventOverflowed_) return;
    pendingEntityDeletes_.insert(id);
    pendingEntityChanges_.erase(id);
    pendingEntityCreates_.erase(id);
    recordDocChanged(
        static_cast<std::uint32_t>(ChangeMask::Geometry)
        | static_cast<std::uint32_t>(ChangeMask::Layer)
        | static_cast<std::uint32_t>(ChangeMask::Bounds)
    );
    recordOrderChanged();
}

void CadEngine::recordLayerChanged(std::uint32_t layerId, std::uint32_t mask) {
    if (eventOverflowed_) return;
    pendingLayerChanges_[layerId] |= mask;
    recordDocChanged(static_cast<std::uint32_t>(ChangeMask::Layer));
}

void CadEngine::recordSelectionChanged() {
    if (eventOverflowed_) return;
    pendingSelectionChanged_ = true;
}

void CadEngine::recordOrderChanged() {
    if (eventOverflowed_) return;
    pendingOrderChanged_ = true;
    recordDocChanged(static_cast<std::uint32_t>(ChangeMask::Order));
}

void CadEngine::recordHistoryChanged() {
    if (eventOverflowed_) return;
    pendingHistoryChanged_ = true;
}

bool CadEngine::pushEvent(const EngineEvent& ev) {
    if (eventOverflowed_) return false;
    if (eventCount_ >= kMaxEvents) {
        eventOverflowed_ = true;
        eventOverflowGeneration_ = generation;
        eventHead_ = 0;
        eventTail_ = 0;
        eventCount_ = 0;
        return false;
    }
    eventQueue_[eventTail_] = ev;
    eventTail_ = (eventTail_ + 1) % kMaxEvents;
    eventCount_++;
    return true;
}

void CadEngine::flushPendingEvents() {
    if (eventOverflowed_) {
        pendingEntityChanges_.clear();
        pendingEntityCreates_.clear();
        pendingEntityDeletes_.clear();
        pendingLayerChanges_.clear();
        pendingDocMask_ = 0;
        pendingSelectionChanged_ = false;
        pendingOrderChanged_ = false;
        pendingHistoryChanged_ = false;
        return;
    }

    if (pendingDocMask_ == 0 &&
        pendingEntityChanges_.empty() &&
        pendingEntityCreates_.empty() &&
        pendingEntityDeletes_.empty() &&
        pendingLayerChanges_.empty() &&
        !pendingSelectionChanged_ &&
        !pendingOrderChanged_ &&
        !pendingHistoryChanged_) {
        return;
    }

    auto pushOrOverflow = [&](const EngineEvent& ev) -> bool {
        if (!pushEvent(ev)) {
            pendingEntityChanges_.clear();
            pendingEntityCreates_.clear();
            pendingEntityDeletes_.clear();
            pendingLayerChanges_.clear();
            pendingDocMask_ = 0;
            pendingSelectionChanged_ = false;
            pendingOrderChanged_ = false;
            pendingHistoryChanged_ = false;
            return false;
        }
        return true;
    };

    if (pendingDocMask_ != 0) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::DocChanged),
                0,
                pendingDocMask_,
                0,
                0,
                0,
            })) {
            return;
        }
    }

    if (!pendingLayerChanges_.empty()) {
        std::vector<std::uint32_t> layerIds;
        layerIds.reserve(pendingLayerChanges_.size());
        for (const auto& kv : pendingLayerChanges_) layerIds.push_back(kv.first);
        std::sort(layerIds.begin(), layerIds.end());
        for (const std::uint32_t id : layerIds) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::LayerChanged),
                    0,
                    id,
                    pendingLayerChanges_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!pendingEntityCreates_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(pendingEntityCreates_.size());
        for (const auto& kv : pendingEntityCreates_) ids.push_back(kv.first);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::EntityCreated),
                    0,
                    id,
                    pendingEntityCreates_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!pendingEntityChanges_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(pendingEntityChanges_.size());
        for (const auto& kv : pendingEntityChanges_) ids.push_back(kv.first);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::EntityChanged),
                    0,
                    id,
                    pendingEntityChanges_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!pendingEntityDeletes_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(pendingEntityDeletes_.size());
        for (const auto& id : pendingEntityDeletes_) ids.push_back(id);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::EntityDeleted),
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

    if (pendingSelectionChanged_) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::SelectionChanged),
                0,
                selectionManager_.getGeneration(),
                static_cast<std::uint32_t>(selectionManager_.getOrdered().size()),
                0,
                0,
            })) {
            return;
        }
    }

    if (pendingOrderChanged_) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::OrderChanged),
                0,
                generation,
                static_cast<std::uint32_t>(entityManager_.drawOrderIds.size()),
                0,
                0,
            })) {
            return;
        }
    }

    if (pendingHistoryChanged_) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::HistoryChanged),
                0,
                generation,
                0,
                0,
                0,
            })) {
            return;
        }
    }

    pendingEntityChanges_.clear();
    pendingEntityCreates_.clear();
    pendingEntityDeletes_.clear();
    pendingLayerChanges_.clear();
    pendingDocMask_ = 0;
    pendingSelectionChanged_ = false;
    pendingOrderChanged_ = false;
    pendingHistoryChanged_ = false;
}

void CadEngine::clearHistory() {
    historyManager_.clear();
    recordHistoryChanged();
}

bool CadEngine::beginHistoryEntry() {
    return historyManager_.beginEntry(nextEntityId_);
}

void CadEngine::discardHistoryEntry() {
    historyManager_.discardEntry();
}

void CadEngine::pushHistoryEntry(HistoryEntry&& entry) {
    historyManager_.pushHistoryEntry(std::move(entry));
    recordHistoryChanged();
}

void CadEngine::markEntityChange(std::uint32_t id) {
    historyManager_.markEntityChange(id);
}

void CadEngine::markLayerChange() {
    historyManager_.markLayerChange();
}

void CadEngine::markDrawOrderChange() {
    historyManager_.markDrawOrderChange();
}

void CadEngine::markSelectionChange() {
    historyManager_.markSelectionChange(selectionManager_.getOrdered());
}

void CadEngine::commitHistoryEntry() {
    if (historyManager_.commitEntry(nextEntityId_, generation, selectionManager_.getOrdered())) {
        recordHistoryChanged();
    }
}

CadEngine::EventBufferMeta CadEngine::pollEvents(std::uint32_t maxEvents) {
    flushPendingEvents();

    eventBuffer_.clear();
    if (eventOverflowed_) {
        eventBuffer_.push_back(EngineEvent{
            static_cast<std::uint16_t>(EventType::Overflow),
            0,
            eventOverflowGeneration_,
            0,
            0,
            0,
        });
        return EventBufferMeta{
            generation,
            static_cast<std::uint32_t>(eventBuffer_.size()),
            reinterpret_cast<std::uintptr_t>(eventBuffer_.data()),
        };
    }

    if (eventCount_ == 0 || maxEvents == 0) {
        return EventBufferMeta{generation, 0, 0};
    }

    const std::size_t count = std::min<std::size_t>(maxEvents, eventCount_);
    eventBuffer_.reserve(count);
    for (std::size_t i = 0; i < count; ++i) {
        eventBuffer_.push_back(eventQueue_[eventHead_]);
        eventHead_ = (eventHead_ + 1) % kMaxEvents;
        eventCount_--;
    }

    return EventBufferMeta{
        generation,
        static_cast<std::uint32_t>(eventBuffer_.size()),
        reinterpret_cast<std::uintptr_t>(eventBuffer_.data()),
    };
}

void CadEngine::ackResync(std::uint32_t resyncGeneration) {
    if (!eventOverflowed_) return;
    if (resyncGeneration < eventOverflowGeneration_) return;
    eventOverflowed_ = false;
    eventOverflowGeneration_ = 0;
    eventHead_ = 0;
    eventTail_ = 0;
    eventCount_ = 0;
    pendingEntityChanges_.clear();
    pendingEntityCreates_.clear();
    pendingEntityDeletes_.clear();
    pendingLayerChanges_.clear();
    pendingDocMask_ = 0;
    pendingSelectionChanged_ = false;
    pendingOrderChanged_ = false;
    pendingHistoryChanged_ = false;
}

#include "engine/internal/engine_state_aliases_undef.h"
