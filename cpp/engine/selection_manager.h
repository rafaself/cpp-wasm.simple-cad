#pragma once

#include "engine/types.h"
#include "engine/pick_system.h"
#include <vector>
#include <unordered_set>
#include <cstdint>

class CadEngine; // Forward declaration
class EntityManager; // Forward declaration

class SelectionManager {
public:
    enum class Mode : std::uint32_t { Replace = 0, Add = 1, Remove = 2, Toggle = 3 };
    enum class MarqueeMode : std::uint32_t { Window = 0, Crossing = 1 };

    explicit SelectionManager(EntityManager& em);

    void setSelection(const std::uint32_t* ids, std::uint32_t count, Mode mode, CadEngine& engine);
    void clearSelection(CadEngine& engine);
    void selectByPick(const PickResult& pick, std::uint32_t modifiers, CadEngine& engine);
    void marqueeSelect(float minX, float minY, float maxX, float maxY, Mode mode, MarqueeMode hitMode, CadEngine& engine);

    const std::vector<std::uint32_t>& getOrdered() const { return ordered_; }
    const std::unordered_set<std::uint32_t>& getSet() const { return set_; }
    std::uint32_t getGeneration() const { return generation_; }
    bool isEmpty() const { return set_.empty(); }
    bool isSelected(std::uint32_t id) const { return set_.find(id) != set_.end(); }

    void clear(); // Resets state without events/history
    void rebuildOrder(const std::vector<std::uint32_t>& drawOrder);
    void prune(CadEngine& engine); 

private:
    EntityManager& entityManager_;
    std::unordered_set<std::uint32_t> set_;
    std::vector<std::uint32_t> ordered_;
    std::uint32_t generation_ = 0;
};
