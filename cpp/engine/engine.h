#pragma once

#ifdef EMSCRIPTEN
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#endif

#include "engine/engine_protocol_types.h"
#include "engine/core/util.h"
#include "engine/core/types.h"
#include "engine/command/commands.h"
#include "engine/render/render.h"
#include "engine/persistence/snapshot.h"
#include "engine/entity/entity_manager.h"
#include "engine/text_system.h"
#include "engine/interaction/pick_system.h"
#include "engine/history/history_types.h"
#include "engine/history/history_manager.h"
#include "engine/entity/selection_manager.h"
#include "engine/interaction/interaction_session.h"

#include <array>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <algorithm>
#include <memory>

// Forward declaration for command dispatch
class CadEngine;
namespace engine {
    EngineError dispatchCommand(CadEngine*, std::uint32_t, std::uint32_t, const std::uint8_t*, std::uint32_t);
}

struct EngineState;

class CadEngine : public EngineProtocolTypes {
    friend class SelectionManager;
    friend class HistoryManager;
    friend class InteractionSession;
    friend EngineError engine::dispatchCommand(CadEngine*, std::uint32_t, std::uint32_t, const std::uint8_t*, std::uint32_t);
#ifndef EMSCRIPTEN
    friend class CadEngineTestAccessor;
#endif
public:
    static constexpr std::size_t kMaxEvents = 2048;

    CadEngine();
    ~CadEngine();

    void clear() noexcept;

    // Allocate transient bytes inside WASM memory (for TS/JS to copy snapshot payloads).
    std::uintptr_t allocBytes(std::uint32_t byteCount);
    void freeBytes(std::uintptr_t ptr);

    void reserveWorld(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints);

    void loadSnapshotFromPtr(std::uintptr_t ptr, std::uint32_t byteCount);

    void applyCommandBuffer(std::uintptr_t ptr, std::uint32_t byteCount);

    std::uint32_t getVertexCount() const noexcept;
    std::uintptr_t getVertexDataPtr() const noexcept;
    std::uint32_t getCapabilities() const noexcept {
        return static_cast<std::uint32_t>(EngineCapability::HAS_QUERY_MARQUEE)
             | static_cast<std::uint32_t>(EngineCapability::HAS_RESIZE_HANDLES)
             | static_cast<std::uint32_t>(EngineCapability::HAS_TRANSFORM_RESIZE);
    }
    std::vector<LayerRecord> getLayersSnapshot() const;
    std::string getLayerName(std::uint32_t layerId) const;
    void setLayerProps(std::uint32_t layerId, std::uint32_t propsMask, std::uint32_t flagsValue, const std::string& name);
    bool deleteLayer(std::uint32_t layerId);
    std::uint32_t getEntityFlags(std::uint32_t entityId) const;
    void setEntityFlags(std::uint32_t entityId, std::uint32_t flagsMask, std::uint32_t flagsValue);
    void setEntityLayer(std::uint32_t entityId, std::uint32_t layerId);
    std::uint32_t getEntityLayer(std::uint32_t entityId) const;
    ProtocolInfo getProtocolInfo() const noexcept {
        return ProtocolInfo{
            kProtocolVersion,
            kCommandVersion,
            kSnapshotVersion,
            kEventStreamVersion,
            getAbiHash(),
            kFeatureFlags
        };
    }

    std::uint32_t allocateEntityId();
    std::uint32_t allocateLayerId();

    BufferMeta buildMeta(const std::vector<float>& buffer, std::size_t floatsPerVertex) const noexcept;
    BufferMeta getPositionBufferMeta() const noexcept;
    BufferMeta getLineBufferMeta() const noexcept;

    ByteBufferMeta saveSnapshot() const noexcept;
    ByteBufferMeta getSnapshotBufferMeta() const noexcept;
    ByteBufferMeta getFullSnapshotMeta() const noexcept { return saveSnapshot(); }

    DocumentDigest getDocumentDigest() const noexcept;

    HistoryMeta getHistoryMeta() const noexcept;
    bool canUndo() const noexcept;
    bool canRedo() const noexcept;
    void undo();
    void redo();

    EventBufferMeta pollEvents(std::uint32_t maxEvents);
    void ackResync(std::uint32_t resyncGeneration);

    /**
     * Returns true if there are pending events to poll.
     * Use this to skip pollEvents() call when idle (reduces overhead).
     */
    bool hasPendingEvents() const noexcept;

    OverlayBufferMeta getSelectionOutlineMeta() const;
    OverlayBufferMeta getSelectionHandleMeta() const;
    OverlayBufferMeta getSnapOverlayMeta() const;
    EntityAabb getEntityAabb(std::uint32_t entityId) const;
    EntityAabb getSelectionBounds() const;

    EngineStats getStats() const noexcept;

    // picking
    std::uint32_t pick(float x, float y, float tolerance) const noexcept;

    // Extended pick
    // IMPORTANT: Since Emscripten value_object bindings work best with POD structs,
    // PickResult is defined in pick_system.h and bound in bindings.cpp
    PickResult pickEx(float x, float y, float tolerance, std::uint32_t pickMask) const noexcept;
    // Marquee query (returns IDs only)
    std::vector<std::uint32_t> queryArea(float minX, float minY, float maxX, float maxY) const;

    // Marquee selection (returns final IDs based on WINDOW/CROSSING rules; filtering happens in JS)
    // mode: 0 = WINDOW, 1 = CROSSING
    std::vector<std::uint32_t> queryMarquee(float minX, float minY, float maxX, float maxY, int mode) const;

    // Selection state (engine-authoritative)
    std::vector<std::uint32_t> getSelectionIds() const;
    std::uint32_t getSelectionGeneration() const noexcept;
    void clearSelection();
    void setSelection(const std::uint32_t* ids, std::uint32_t idCount, SelectionMode mode);
    void selectByPick(const PickResult& pick, std::uint32_t modifiers);
    void marqueeSelect(float minX, float minY, float maxX, float maxY, SelectionMode mode, int hitMode);

    // Visibility helper used by render callbacks
    bool isEntityVisibleForRender(std::uint32_t id) const noexcept;

    // Draw order (engine-authoritative)
    std::vector<std::uint32_t> getDrawOrderSnapshot() const;
    void reorderEntities(const std::uint32_t* ids, std::uint32_t idCount, ReorderAction action, std::uint32_t refId);

private:
    // Error handling
    void clearError() const;
    void setError(EngineError err) const;

    // read/write helpers moved to engine/util.h

    void clearWorld() noexcept;

    void trackNextEntityId(std::uint32_t id);
    void setNextEntityId(std::uint32_t id);
    void deleteEntity(std::uint32_t id) noexcept;
    void clearEventState();
    void recordDocChanged(std::uint32_t mask);
    void recordEntityChanged(std::uint32_t id, std::uint32_t mask);
    void recordEntityCreated(std::uint32_t id, std::uint32_t kind);
    void recordEntityDeleted(std::uint32_t id);
    void recordLayerChanged(std::uint32_t layerId, std::uint32_t mask);
    void recordSelectionChanged();
    void recordOrderChanged();
    void recordHistoryChanged();
    void clearHistory();
    bool beginHistoryEntry();
    void commitHistoryEntry();
    void discardHistoryEntry();
    void pushHistoryEntry(HistoryEntry&& entry);
    void markEntityChange(std::uint32_t id);
    void markLayerChange();
    void markDrawOrderChange();
    void markSelectionChange();

    // Snapshot methods delegated to HistoryManager or implemented via it
    EntitySnapshot buildSnapshotFromTransform(const TransformSnapshot& snap) const;

    std::vector<std::uint8_t> encodeHistoryBytes() const;
    void decodeHistoryBytes(const std::uint8_t* bytes, std::size_t byteCount);
    void flushPendingEvents();
    bool pushEvent(const EngineEvent& ev);

    void upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a);
    void upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx);
    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1);
    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx);
    void upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count);
    void upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx);

    void upsertCircle(
        std::uint32_t id,
        float cx,
        float cy,
        float rx,
        float ry,
        float rot,
        float sx,
        float sy,
        float fillR,
        float fillG,
        float fillB,
        float fillA,
        float strokeR,
        float strokeG,
        float strokeB,
        float strokeA,
        float strokeEnabled,
        float strokeWidthPx
    );

    void upsertPolygon(
        std::uint32_t id,
        float cx,
        float cy,
        float rx,
        float ry,
        float rot,
        float sx,
        float sy,
        std::uint32_t sides,
        float fillR,
        float fillG,
        float fillB,
        float fillA,
        float strokeR,
        float strokeG,
        float strokeB,
        float strokeA,
        float strokeEnabled,
        float strokeWidthPx
    );

    void upsertArrow(
        std::uint32_t id,
        float ax,
        float ay,
        float bx,
        float by,
        float head,
        float strokeR,
        float strokeG,
        float strokeB,
        float strokeA,
        float strokeEnabled,
        float strokeWidthPx
    );

public:
    // ==========================================================================
    // Text Operations (Public API for JS bindings)
    // ==========================================================================
    
    /**
     * Initialize text subsystem (fonts, layout engine, atlas).
     * @return True if initialization succeeded
     */
    bool initializeTextSystem();
    
    /**
     * Load a font into the font manager.
     * @param fontId Font identifier
     * @param fontData Pointer to font file data
     * @param dataSize Size of font data in bytes
     * @return True if font loaded successfully
     */
    bool loadFont(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize);
    
    /**
     * Load a font with style variant flags.
     * @param fontId Font identifier
     * @param fontDataPtr Pointer to font file data
     * @param dataSize Size of font data in bytes
     * @param bold Whether this is a bold variant
     * @param italic Whether this is an italic variant
     * @return True if font loaded successfully
     */
    bool loadFontEx(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize, bool bold, bool italic);
    
    /**
     * Upsert (create or update) a text entity.
     * @param id Entity ID
     * @param header Text payload header with properties
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
     * @param id Entity ID
     * @return True if entity existed and was deleted
     */
    bool deleteText(std::uint32_t id);
    
    /**
     * Set caret position for a text entity.
     * @param textId Text entity ID
     * @param caretIndex UTF-8 byte position
     */
    void setTextCaret(std::uint32_t textId, std::uint32_t caretIndex);
    
    /**
     * Set selection range for a text entity.
     * @param textId Text entity ID
     * @param selectionStart Selection start (byte offset)
     * @param selectionEnd Selection end (byte offset)
     */
    void setTextSelection(std::uint32_t textId, std::uint32_t selectionStart, std::uint32_t selectionEnd);
    bool applyTextStyle(const engine::text::ApplyTextStylePayload& payload, const std::uint8_t* params, std::uint32_t paramsLen);
    
    /**
     * Insert text content at a position.
     * @param textId Text entity ID
     * @param insertIndex UTF-8 byte position to insert at
     * @param content UTF-8 text to insert
     * @param byteLength Length of content in bytes
     * @return True if successful
     */
    bool insertTextContent(
        std::uint32_t textId,
        std::uint32_t insertIndex,
        const char* content,
        std::uint32_t byteLength
    );
    
    /**
     * Delete text content in a range.
     * @param textId Text entity ID
     * @param startIndex Start byte index (inclusive)
     * @param endIndex End byte index (exclusive)
     * @return True if successful
     */
    bool deleteTextContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex);
    
    /**
     * Set the alignment for a text entity.
     * @param textId Text entity ID
     * @param align New alignment
     * @return True if text exists
     */
    bool setTextAlign(std::uint32_t textId, TextAlign align);
    
    /**
     * Set the constraint width for a text entity.
     * This forces the text into FixedWidth mode and triggers a re-layout.
     * @param textId Text entity ID
     * @param width New constraint width
     * @return True if text exists
     */
    bool setTextConstraintWidth(std::uint32_t textId, float width);

    /**
     * Move a text entity without altering content or styling.
     * @param textId Text entity ID
     * @param x New anchor X (top-left, Y-Up)
     * @param y New anchor Y (top-left, Y-Up)
     * @param boxMode Text box mode to retain
     * @param constraintWidth Constraint width when in FixedWidth mode
     * @return True if text exists
     */
    bool setTextPosition(std::uint32_t textId, float x, float y, TextBoxMode boxMode, float constraintWidth);

    /**
     * Hit test a point against text entities.
     * @param textId Text entity ID
     * @param localX X coordinate in text-local space
     * @param localY Y coordinate in text-local space
     * @return Hit result with character index
     */
    TextHitResult hitTestText(std::uint32_t textId, float localX, float localY) const;
    
    /**
     * Get caret position for rendering.
     * @param textId Text entity ID
     * @param charIndex Character index (byte offset)
     * @return Caret position
     */
    TextCaretPosition getTextCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const;

    // Style snapshot for ribbon/state (engine-authoritative)
    engine::text::TextStyleSnapshot getTextStyleSnapshot(std::uint32_t textId) const;
    engine::text::TextStyleSnapshot getTextStyleSummary(std::uint32_t textId) const;
    
    /**
     * Get text entity bounds.
     * @param textId Text entity ID
     * @param outMinX Output min X
     * @param outMinY Output min Y
     * @return True if valid
     */
    bool getTextBounds(std::uint32_t textId, float& outMinX, float& outMinY, float& outMaxX, float& outMaxY) const;

    // =================================================================*********
    // Snapping System (Phase 3)
    // =================================================================*********
    
    void setSnapOptions(bool enabled, bool gridEnabled, float gridSize, float tolerancePx, bool endpointEnabled, bool midpointEnabled, bool centerEnabled, bool nearestEnabled);
    std::pair<float, float> getSnappedPoint(float x, float y) const;

    /**
     * Get selection rectangles for a text range.
     * @param textId Text entity ID
     * @param start Selection start (byte offset)
     * @param end Selection end (byte offset)
     * @return List of selection rectangles
     */
    using TextSelectionRect = engine::text::TextLayoutEngine::SelectionRect;
    std::vector<TextSelectionRect> getTextSelectionRects(std::uint32_t textId, std::uint32_t start, std::uint32_t end) const;
    
    // Navigation helpers
    std::uint32_t getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    
    /**
     * Rebuild text quad buffer for rendering.
     * Must be called after text layout changes.
     */
    void rebuildTextQuadBuffer();
    
    /**
     * Get text quad buffer metadata for rendering.
     * Format: [x, y, z, u, v, r, g, b, a] per vertex, 6 vertices per glyph quad
     */
    BufferMeta getTextQuadBufferMeta() const noexcept;
    
    /**
     * Get atlas texture metadata for WebGL upload.
     */
    TextureBufferMeta getAtlasTextureMeta() const noexcept;
    
    /**
     * Check if atlas texture needs re-upload.
     */
    bool isAtlasDirty() const noexcept;
    
    /**
     * Check if text quads need to be rebuilt.
     */
    bool isTextQuadsDirty() const;

    /**
     * Mark text quads as dirty.
     */
    void markTextQuadsDirty() const;

    /**
     * Clear atlas dirty flag after texture upload.
     */
    void clearAtlasDirty();
    
    /**
     * Get text content buffer metadata for a text entity.
     * Important: The returned pointer is only valid until the next text modification.
     * @param textId Text entity ID
     * @return Metadata with pointer and size, exists=false if text not found
     */
    TextContentMeta getTextContentMeta(std::uint32_t textId) const noexcept;
    
    struct TextEntityMeta {
        std::uint32_t id;
        TextBoxMode boxMode;
        float constraintWidth;
    };
    
    /**
     * Get metadata for all text entities (id, boxMode, constraintWidth).
     * Used for synchronizing JS state after loading a snapshot.
     */
    std::vector<TextEntityMeta> getAllTextMetas() const;

    // Command dispatch logic moved to engine/command_dispatch.cpp

    void compactPolylinePoints();

    void rebuildSnapshotBytes() const;

    // legacy single-stride buildMeta removed (use buildMeta(buffer, floatsPerVertex))

    void pushVertex(float x, float y, float z, float r, float g, float b, std::vector<float>& target) const;
    void pushVertex(float x, float y, float z, std::vector<float>& target) const;

    void addRect(float x, float y, float w, float h, float r, float g, float b) const;
    void addRectOutline(float x, float y, float w, float h) const;
    void addLineSegment(float x0, float y0, float x1, float y1, float z = 0.0f) const;

    void rebuildRenderBuffers() const;
    void addGridToBuffers() const;
    void beginDraft(const BeginDraftPayload& p);
    void updateDraft(float x, float y, std::uint32_t modifiers);
    void appendDraftPoint(float x, float y, std::uint32_t modifiers);
    std::uint32_t commitDraft();
    void cancelDraft();
    DraftDimensions getDraftDimensions() const;

    bool refreshEntityRenderRange(std::uint32_t id) const;

// ==============================================================================
// Interaction Session (Phase 4)
// ==============================================================================
public:
    using TransformMode = ::TransformMode;
    using TransformOpCode = ::TransformOpCode;
    /**
     * Start an interactive transform session.
     * @param ids List of entity IDs to transform
     * @param idCount Number of IDs
     * @param mode Transform mode (Move, VertexDrag, etc)
     * @param specificId ID of the specific sub-element being dragged (e.g. vertex owner)
     * @param vertexIndex Index of vertex if applicable, -1 otherwise
     * @param screenX Screen-space X (canvas local)
     * @param screenY Screen-space Y (canvas local)
     * @param viewX View translate X (screen space)
     * @param viewY View translate Y (screen space)
     * @param viewScale View scale (world->screen)
     * @param viewWidth Viewport width (screen space)
     * @param viewHeight Viewport height (screen space)
     * @param modifiers Modifier bitmask (Shift/Ctrl/Alt/Meta)
     */
    void beginTransform(
        const std::uint32_t* ids, 
        std::uint32_t idCount, 
        TransformMode mode, 
        std::uint32_t specificId, 
        int32_t vertexIndex, 
        float screenX, 
        float screenY,
        float viewX,
        float viewY,
        float viewScale,
        float viewWidth,
        float viewHeight,
        std::uint32_t modifiers
    );

    /**
     * Update the current transform session.
     * @param screenX Current pointer Screen X (canvas local)
     * @param screenY Current pointer Screen Y (canvas local)
     * @param viewX View translate X (screen space)
     * @param viewY View translate Y (screen space)
     * @param viewScale View scale (world->screen)
     * @param viewWidth Viewport width (screen space)
     * @param viewHeight Viewport height (screen space)
     * @param modifiers Modifier bitmask (Shift/Ctrl/Alt/Meta)
     */
    void updateTransform(
        float screenX,
        float screenY,
        float viewX,
        float viewY,
        float viewScale,
        float viewWidth,
        float viewHeight,
        std::uint32_t modifiers);

    /**
     * Commit changes and end the session.
     * Populates commitResult buffers.
     */
    void commitTransform();

    /**
     * Cancel changes and revert to initial state.
     * Ends the session.
     */
    void cancelTransform();

    /**
     * Check if a session is currently active.
     */
    bool isInteractionActive() const;

    // Accessors for Commit Results (WASM Bindings)
    std::uint32_t getCommitResultCount() const;
    std::uintptr_t getCommitResultIdsPtr() const;
    std::uintptr_t getCommitResultOpCodesPtr() const;
    std::uintptr_t getCommitResultPayloadsPtr() const;

    void setTransformLogEnabled(bool enabled, std::uint32_t maxEntries, std::uint32_t maxIds);
    void clearTransformLog();
    bool replayTransformLog();
    bool isTransformLogOverflowed() const;
    std::uint32_t getTransformLogCount() const;
    std::uintptr_t getTransformLogPtr() const;
    std::uint32_t getTransformLogIdCount() const;
    std::uintptr_t getTransformLogIdsPtr() const;

private:
    EngineState& state() noexcept;
    const EngineState& state() const noexcept;
    std::unique_ptr<EngineState> state_;
};
