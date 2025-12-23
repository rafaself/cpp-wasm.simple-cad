#ifndef ELETROCAD_ENGINE_TEXT_STORE_H
#define ELETROCAD_ENGINE_TEXT_STORE_H

#include "engine/types.h"
#include "engine/text/text_types.h"
#include <cstdint>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <string>
#include <optional>

namespace engine::text {

/**
 * TextStore: Central storage for all text entities, content, and runs.
 * 
 * Responsibilities:
 * - CRUD operations for TextRec entities
 * - Content buffer management (UTF-8 text storage)
 * - Run buffer management (styling spans)
 * - Dirty tracking for layout invalidation
 * 
 * Non-responsibilities (handled by TextLayoutEngine):
 * - Shaping, line breaking, bounds calculation
 * - Atlas management
 * - Rendering
 */
class TextStore {
public:
    TextStore();
    ~TextStore();

    // ==========================================================================
    // Entity Operations
    // ==========================================================================
    
    /**
     * Create or update a text entity.
     * @param id Entity ID
     * @param header Text properties (position, box mode, etc.)
     * @param runs Array of TextRunPayload structs
     * @param runCount Number of runs
     * @param content UTF-8 text content
     * @param contentLength Byte length of content
     * @return True if successful
     */
    bool upsertText(
        std::uint32_t id,
        const TextPayloadHeader& header,
        const TextRunPayload* runs,
        std::uint32_t runCount,
        const char* content,
        std::uint32_t contentLength
    );

    /**
     * Delete a text entity.
     * @param id Entity ID to delete
     * @return True if entity existed and was deleted
     */
    bool deleteText(std::uint32_t id);

    /**
     * Get a text entity by ID.
     * @param id Entity ID
     * @return Pointer to TextRec or nullptr if not found
     */
    const TextRec* getText(std::uint32_t id) const;
    TextRec* getTextMutable(std::uint32_t id);

    /**
     * Check if a text entity exists.
     */
    bool hasText(std::uint32_t id) const;

    /**
     * Get all text entity IDs.
     */
    std::vector<std::uint32_t> getAllTextIds() const;

    /**
     * Get count of text entities.
     */
    std::size_t getTextCount() const;

    // ==========================================================================
    // Content Operations
    // ==========================================================================
    
    /**
     * Get the UTF-8 content for a text entity.
     * @param id Entity ID
     * @return String view of content, or empty if not found
     */
    std::string_view getContent(std::uint32_t id) const;

    /**
     * Insert text at a position in an entity's content.
     * @param id Entity ID
     * @param byteIndex UTF-8 byte position to insert at
     * @param text UTF-8 text to insert
     * @param byteLength Length of text in bytes
     * @return True if successful
     */
    bool insertContent(
        std::uint32_t id,
        std::uint32_t byteIndex,
        const char* text,
        std::uint32_t byteLength
    );

    /**
     * Delete a range of content from an entity.
     * @param id Entity ID
     * @param startByte Start byte index (inclusive)
     * @param endByte End byte index (exclusive)
     * @return True if successful
     */
    bool deleteContent(
        std::uint32_t id,
        std::uint32_t startByte,
        std::uint32_t endByte
    );

    // ==========================================================================
    // Run Operations
    // ==========================================================================
    
    /**
     * Get runs for a text entity.
     * @param id Entity ID
     * @return Span of runs, or empty if not found
     */
    const std::vector<TextRun>& getRuns(std::uint32_t id) const;

    /**
     * Update a single run's styling.
     * @param textId Text entity ID
     * @param runIndex Index of run to update
     * @param run New run data
     * @return True if successful
     */
    bool updateRun(std::uint32_t textId, std::uint32_t runIndex, const TextRun& run);

    /**
     * Update constraint width and set box mode to FixedWidth.
     * @param textId Text entity ID
     * @param width Constraint width in World Units
     * @return True if successful
     */
    bool setConstraintWidth(std::uint32_t textId, float width);

    // ==========================================================================
    // Caret & Selection
    // ==========================================================================
    
    /**
     * Set caret position for a text entity.
     */
    void setCaret(std::uint32_t textId, std::uint32_t byteIndex);

    /**
     * Set selection range for a text entity.
     */
    void setSelection(std::uint32_t textId, std::uint32_t startByte, std::uint32_t endByte);

    /**
     * Get caret state for a text entity.
     */
    std::optional<TextCaretState> getCaretState(std::uint32_t textId) const;

    /**
     * Clear caret state (no text is being edited).
     */
    void clearCaretState();

    // ==========================================================================
    // Dirty Tracking
    // ==========================================================================
    
    /**
     * Mark a text entity as needing re-layout.
     */
    void markDirty(std::uint32_t id);

    /**
     * Get all dirty entity IDs and clear the dirty set.
     */
    std::vector<std::uint32_t> consumeDirtyIds();

    /**
     * Check if any entities are dirty.
     */
    bool hasDirtyEntities() const;

    // ==========================================================================
    // Layout Results (written by TextLayoutEngine)
    // ==========================================================================
    
    /**
     * Update layout results for a text entity.
     * Called by TextLayoutEngine after computing layout.
     */
    void setLayoutResult(
        std::uint32_t id,
        float layoutWidth,
        float layoutHeight,
        float minX, float minY,
        float maxX, float maxY
    );

    // ==========================================================================
    // Bulk Operations
    // ==========================================================================
    
    /**
     * Clear all text entities.
     */
    void clear();

    /**
     * Reserve capacity for expected number of entities.
     */
    void reserve(std::size_t count);

private:
    // Storage for text entities (id -> TextRec)
    std::unordered_map<std::uint32_t, TextRec> texts_;

    // Content buffer: each text stores its own content string
    std::unordered_map<std::uint32_t, std::string> contents_;

    // Runs buffer: each text stores its own runs vector
    std::unordered_map<std::uint32_t, std::vector<TextRun>> runs_;

    // Current caret state (only one text is edited at a time)
    std::optional<TextCaretState> caretState_;

    // Dirty tracking for layout invalidation
    std::unordered_set<std::uint32_t> dirtyIds_;

    // Empty runs vector for safe return
    static const std::vector<TextRun> emptyRuns_;

    // Helper to adjust runs after content modification
    void adjustRunsAfterInsert(std::uint32_t id, std::uint32_t byteIndex, std::uint32_t insertLength);
    void adjustRunsAfterDelete(std::uint32_t id, std::uint32_t startByte, std::uint32_t deleteLength);
};

} // namespace engine::text

#endif // ELETROCAD_ENGINE_TEXT_STORE_H
