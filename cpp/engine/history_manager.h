#pragma once

#include "engine/history_types.h"
#include "engine/types.h"
#include <vector>
#include <cstdint>
#include <cstddef>

// Forward declarations
class EntityManager;
class TextSystem;
class CadEngine; // For callbacks/applying state

class HistoryManager {
public:
    HistoryManager(EntityManager& em, TextSystem& ts);

    // Public API
    bool canUndo() const noexcept;
    bool canRedo() const noexcept;
    
    // Apply operations
    // We pass CadEngine because restoring state affects selection, which currently lives in CadEngine.
    // In Phase 1.2 this will be cleaner.
    void undo(CadEngine& engine);
    void redo(CadEngine& engine);

    // Transaction management
    bool beginEntry(std::uint32_t nextEntityId);
    void discardEntry();
    bool commitEntry(std::uint32_t nextEntityId, std::uint32_t currentGeneration, const std::vector<std::uint32_t>& currentSelection);

    // Change markers
    void markEntityChange(std::uint32_t id);
    void markLayerChange();
    void markDrawOrderChange();
    void markSelectionChange(const std::vector<std::uint32_t>& currentSelection);

    // Serialization
    std::vector<std::uint8_t> encodeBytes() const;
    void decodeBytes(const std::uint8_t* data, std::size_t len);

    // State management
    void clear();
    std::uint32_t getGeneration() const noexcept { return historyGeneration_; }
    void setSuppressed(bool suppressed) { suppressed_ = suppressed; }
    bool isSuppressed() const { return suppressed_; }
    bool isTransactionActive() const { return transaction_.active; }
    std::size_t getHistorySize() const noexcept { return history_.size(); }
    std::size_t getCursor() const noexcept { return cursor_; }

    // Snapshot helpers (public because they are useful for clipboard/serialization too, could be moved later)
    bool captureEntitySnapshot(std::uint32_t id, EntitySnapshot& out) const;
    void applyEntitySnapshot(const EntitySnapshot& snap, CadEngine& engine);

    void pushHistoryEntry(HistoryEntry&& entry);

private:
    void finalizeHistoryEntry(HistoryEntry& entry, std::uint32_t nextEntityId, const std::vector<std::uint32_t>& currentSelection);
    void applyHistoryEntry(const HistoryEntry& entry, bool useAfter, CadEngine& engine);
    
    // Sub-appliers
    void applyLayerSnapshot(const std::vector<engine::LayerSnapshot>& layers);
    void applyDrawOrderSnapshot(const std::vector<std::uint32_t>& order);
    void applySelectionSnapshot(const std::vector<std::uint32_t>& selection, CadEngine& engine);

    EntityManager& entityManager_;
    TextSystem& textSystem_;

    std::vector<HistoryEntry> history_;
    std::size_t cursor_ = 0;
    std::uint32_t historyGeneration_ = 0;
    bool suppressed_ = false;
    HistoryTransaction transaction_;
};
