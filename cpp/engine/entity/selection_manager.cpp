#include "engine/entity/selection_manager.h"
#include "engine/engine.h"
#include "engine/entity/entity_manager.h"
#include <algorithm>

SelectionManager::SelectionManager(EntityManager& em) 
    : entityManager_(em) {}

void SelectionManager::setSelection(const std::uint32_t* ids, std::uint32_t count, Mode mode, CadEngine& engine) {
    bool changed = false;
    if (count > 0 || !set_.empty()) {
        engine.markSelectionChange();
    }

    auto applyInsert = [&](std::uint32_t id) {
        if (set_.find(id) == set_.end()) {
            set_.insert(id);
            changed = true;
        }
    };
    auto applyErase = [&](std::uint32_t id) {
        const auto it = set_.find(id);
        if (it != set_.end()) {
            set_.erase(it);
            changed = true;
        }
    };

    if (mode == Mode::Replace) {
        if (!set_.empty()) {
            set_.clear();
            changed = true;
        }
    }

    for (std::uint32_t i = 0; i < count; i++) {
        const std::uint32_t id = ids[i];
        if (entityManager_.entities.find(id) == entityManager_.entities.end()) continue;
        if (!entityManager_.isEntityPickable(id)) continue;

        switch (mode) {
            case Mode::Replace:
            case Mode::Add:
                applyInsert(id);
                break;
            case Mode::Remove:
                applyErase(id);
                break;
            case Mode::Toggle:
                if (set_.find(id) != set_.end()) {
                    applyErase(id);
                } else {
                    applyInsert(id);
                }
                break;
        }
    }

    if (changed) {
        rebuildOrder(entityManager_.drawOrderIds);
        generation_++;
        engine.recordSelectionChanged();
    }
}

void SelectionManager::clear() {
    set_.clear();
    ordered_.clear();
    generation_ = 0;
}

void SelectionManager::clearSelection(CadEngine& engine) {
    if (set_.empty()) return;
    engine.markSelectionChange();
    set_.clear();
    ordered_.clear();
    generation_++;
    engine.recordSelectionChanged();
}

void SelectionManager::selectByPick(const PickResult& pick, std::uint32_t modifiers, CadEngine& engine) {
    Mode mode = Mode::Replace;
    const std::uint32_t toggleMask =
        static_cast<std::uint32_t>(CadEngine::SelectionModifier::Ctrl)
        | static_cast<std::uint32_t>(CadEngine::SelectionModifier::Meta);

    if (modifiers & static_cast<std::uint32_t>(CadEngine::SelectionModifier::Shift)) {
        mode = Mode::Add; // Shift adds
    } else if (modifiers & toggleMask) {
        mode = Mode::Toggle; // Ctrl/Meta toggles
    }

    if (pick.id == 0) {
        if (mode == Mode::Replace) clearSelection(engine);
        return;
    }

    const std::uint32_t id = pick.id;
    if (entityManager_.entities.find(id) == entityManager_.entities.end()) return;
    if (!entityManager_.isEntityPickable(id)) return;

    setSelection(&id, 1, mode, engine);
}

void SelectionManager::marqueeSelect(float minX, float minY, float maxX, float maxY, Mode mode, MarqueeMode hitMode, CadEngine& engine) {
    const std::vector<std::uint32_t> ids = engine.queryMarquee(minX, minY, maxX, maxY, static_cast<int>(hitMode));
    if (ids.empty()) {
        if (mode == Mode::Replace) clearSelection(engine);
        return;
    }
    setSelection(ids.data(), static_cast<std::uint32_t>(ids.size()), mode, engine);
}

void SelectionManager::rebuildOrder(const std::vector<std::uint32_t>& drawOrder) {
    ordered_.clear();
    ordered_.reserve(set_.size());
    // Iterate draw order to maintain relative order
    for (const auto id : drawOrder) {
        if (set_.find(id) != set_.end()) {
            ordered_.push_back(id);
        }
    }
    // Handle any selected items not in draw order? (Shouldn't happen for valid entities)
    // If set_ is larger than ordered_, maybe some entities are missing from drawOrder?
    // We strictly follow drawOrder for now.
}

void SelectionManager::prune(CadEngine& engine) {
    bool changed = false;
    for (auto it = set_.begin(); it != set_.end();) {
        const std::uint32_t id = *it;
        bool keep = false;
        auto eit = entityManager_.entities.find(id);
        if (eit != entityManager_.entities.end()) {
            // Also check locked/visibility if requirement invokes it
            if (entityManager_.isEntityPickable(id)) {
                keep = true;
            }
        }
        
        if (!keep) {
            it = set_.erase(it);
            changed = true;
        } else {
            ++it;
        }
    }

    if (changed) {
        rebuildOrder(entityManager_.drawOrderIds);
        generation_++;
        engine.recordSelectionChanged();
    }
}
