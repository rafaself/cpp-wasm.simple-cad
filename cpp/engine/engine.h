#pragma once

#ifdef EMSCRIPTEN
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#endif

#include "engine/util.h"
#include "engine/types.h"

#include "engine/commands.h"
#include "engine/render.h"
#include "engine/snapshot.h"

#include "engine/entity_manager.h"
#include "engine/text_system.h"
#include "engine/text_system.h"
#include "engine/pick_system.h"
#include "engine/history_types.h"
#include "engine/history_manager.h"
#include "engine/selection_manager.h"
#include "engine/interaction_session.h"

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

class CadEngine {
    friend class SelectionManager;
    friend class HistoryManager;
    friend class InteractionSession;
public:
    // Expose legacy nested type names for backwards compatibility with existing callers/tests
    using CommandOp = ::CommandOp;

    enum class EngineCapability : std::uint32_t {
        HAS_QUERY_MARQUEE = 1 << 0,
        HAS_RESIZE_HANDLES = 1 << 1,
        HAS_TRANSFORM_RESIZE = 1 << 2,
    };

    // Feature flags for build-time capabilities (protocol handshake).
    enum class EngineFeatureFlags : std::uint32_t {
        FEATURE_PROTOCOL = 1 << 0,
        FEATURE_LAYERS_FLAGS = 1 << 1,
        FEATURE_SELECTION_ORDER = 1 << 2,
        FEATURE_SNAPSHOT_VNEXT = 1 << 3,
        FEATURE_EVENT_STREAM = 1 << 4,
        FEATURE_OVERLAY_QUERIES = 1 << 5,
        FEATURE_INTERACTIVE_TRANSFORM = 1 << 6,
        FEATURE_ENGINE_HISTORY = 1 << 7,
        FEATURE_ENGINE_DOCUMENT_SOT = 1 << 8,
    };

    enum class LayerPropMask : std::uint32_t {
        Name = 1 << 0,
        Visible = 1 << 1,
        Locked = 1 << 2,
    };

    enum class SelectionMode : std::uint32_t {
        Replace = 0,
        Add = 1,
        Remove = 2,
        Toggle = 3,
    };

    enum class SelectionModifier : std::uint32_t {
        Shift = 1 << 0,
        Ctrl = 1 << 1,
        Alt = 1 << 2,
        Meta = 1 << 3,
    };

    enum class MarqueeMode : std::uint32_t {
        Window = 0,
        Crossing = 1,
    };

    enum class ReorderAction : std::uint32_t {
        BringToFront = 1,
        SendToBack = 2,
        BringForward = 3,
        SendBackward = 4,
    };

    enum class EventType : std::uint16_t {
        Overflow = 1,
        DocChanged = 2,
        EntityChanged = 3,
        EntityCreated = 4,
        EntityDeleted = 5,
        LayerChanged = 6,
        SelectionChanged = 7,
        OrderChanged = 8,
        HistoryChanged = 9,
    };



    enum class ChangeMask : std::uint32_t {
        Geometry = 1 << 0,
        Style = 1 << 1,
        Flags = 1 << 2,
        Layer = 1 << 3,
        Order = 1 << 4,
        Text = 1 << 5,
        Bounds = 1 << 6,
        RenderData = 1 << 7,
    };

    // Handshake payload (POD): frontend validates version + abiHash + feature flags.
    struct ProtocolInfo {
        std::uint32_t protocolVersion;
        std::uint32_t commandVersion;
        std::uint32_t snapshotVersion;
        std::uint32_t eventStreamVersion;
        std::uint32_t abiHash;
        std::uint32_t featureFlags;
    };

    // Protocol versions (must be non-zero; keep in sync with TS).
    static constexpr std::uint32_t kProtocolVersion = 1;      // Handshake schema version
    static constexpr std::uint32_t kCommandVersion = 2;       // Command buffer version (EWDC v2)
    static constexpr std::uint32_t kSnapshotVersion = snapshotVersionEsnp; // Snapshot format version (ESNP v1)
    static constexpr std::uint32_t kEventStreamVersion = 1;   // Event stream schema version (reserved)
    static constexpr std::uint32_t kFeatureFlags =
        static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_PROTOCOL)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_LAYERS_FLAGS)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SELECTION_ORDER)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SNAPSHOT_VNEXT)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_EVENT_STREAM)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_OVERLAY_QUERIES)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_INTERACTIVE_TRANSFORM)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_HISTORY)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_DOCUMENT_SOT);
    static constexpr std::uint32_t kAbiHashOffset = 2166136261u;
    static constexpr std::uint32_t kAbiHashPrime = 16777619u;

    CadEngine();

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
            kAbiHash,
            kFeatureFlags
        };
    }

    std::uint32_t allocateEntityId();
    std::uint32_t allocateLayerId();

    struct BufferMeta {
        std::uint32_t generation;
        std::uint32_t vertexCount;
        std::uint32_t capacity;   // in vertices
        std::uint32_t floatCount; // convenience for view length
        std::uintptr_t ptr;       // byte offset in WASM linear memory
    };

    BufferMeta buildMeta(const std::vector<float>& buffer, std::size_t floatsPerVertex) const noexcept;
    BufferMeta getPositionBufferMeta() const noexcept;
    BufferMeta getLineBufferMeta() const noexcept;

    struct ByteBufferMeta {
        std::uint32_t generation;
        std::uint32_t byteCount;
        std::uintptr_t ptr;
    };

    ByteBufferMeta saveSnapshot() const noexcept;
    ByteBufferMeta getSnapshotBufferMeta() const noexcept;
    ByteBufferMeta getFullSnapshotMeta() const noexcept { return saveSnapshot(); }

    struct DocumentDigest {
        std::uint32_t lo;
        std::uint32_t hi;
    };
    DocumentDigest getDocumentDigest() const noexcept;

    struct HistoryMeta {
        std::uint32_t depth;
        std::uint32_t cursor;
        std::uint32_t generation;
    };

    HistoryMeta getHistoryMeta() const noexcept;
    bool canUndo() const noexcept;
    bool canRedo() const noexcept;
    void undo();
    void redo();

    struct EngineEvent {
        std::uint16_t type;
        std::uint16_t flags;
        std::uint32_t a;
        std::uint32_t b;
        std::uint32_t c;
        std::uint32_t d;
    };

    struct EventBufferMeta {
        std::uint32_t generation;
        std::uint32_t count;
        std::uintptr_t ptr;
    };

    EventBufferMeta pollEvents(std::uint32_t maxEvents);
    void ackResync(std::uint32_t resyncGeneration);

    enum class OverlayKind : std::uint16_t {
        Polyline = 1,
        Polygon = 2,
        Segment = 3,
        Rect = 4,
        Point = 5,
    };

    struct OverlayPrimitive {
        std::uint16_t kind;
        std::uint16_t flags;
        std::uint32_t count;  // number of points
        std::uint32_t offset; // float offset into data buffer
    };

    struct OverlayBufferMeta {
        std::uint32_t generation;
        std::uint32_t primitiveCount;
        std::uint32_t floatCount;
        std::uintptr_t primitivesPtr;
        std::uintptr_t dataPtr;
    };

    struct EntityAabb {
        float minX;
        float minY;
        float maxX;
        float maxY;
        std::uint32_t valid;
    };

    OverlayBufferMeta getSelectionOutlineMeta() const;
    OverlayBufferMeta getSelectionHandleMeta() const;
    EntityAabb getEntityAabb(std::uint32_t entityId) const;

    struct EngineStats {
        std::uint32_t generation;
        std::uint32_t rectCount;
        std::uint32_t lineCount;
        std::uint32_t polylineCount;
        std::uint32_t pointCount;
        std::uint32_t triangleVertexCount;
        std::uint32_t lineVertexCount;
        std::uint32_t rebuildAllGeometryCount;
        float lastLoadMs;
        float lastRebuildMs;
        float lastApplyMs;
    };

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
    std::uint32_t getSelectionGeneration() const noexcept { return selectionManager_.getGeneration(); }
    void clearSelection();
    void setSelection(const std::uint32_t* ids, std::uint32_t idCount, SelectionMode mode);
    void selectByPick(const PickResult& pick, std::uint32_t modifiers);
    void marqueeSelect(float minX, float minY, float maxX, float maxY, SelectionMode mode, int hitMode);

    // Visibility helper used by render callbacks
    bool isEntityVisibleForRender(std::uint32_t id) const noexcept { return entityManager_.isEntityVisible(id); }

    // Draw order (engine-authoritative)
    std::vector<std::uint32_t> getDrawOrderSnapshot() const;
    void reorderEntities(const std::uint32_t* ids, std::uint32_t idCount, ReorderAction action, std::uint32_t refId);

#ifdef EMSCRIPTEN
private:
#else
public:
#endif
#ifdef EMSCRIPTEN
private:
#else
public:
#endif

    // Core Entity Manager
    EntityManager entityManager_;

    // Text subsystem
    mutable TextSystem textSystem_;

    // Picking subsystem
    mutable PickSystem pickSystem_;

    float viewScale{1.0f};
    float viewX{0.0f};
    float viewY{0.0f};
    float viewWidth{0.0f};
    float viewHeight{0.0f};

    mutable std::vector<float> triangleVertices;
    mutable std::vector<float> lineVertices;
    mutable std::unordered_map<std::uint32_t, engine::RenderRange> renderRanges_{};
    mutable std::vector<std::uint8_t> snapshotBytes;
    mutable bool textQuadsDirty_{true};
    mutable bool renderDirty{false};
    mutable bool snapshotDirty{false};
    std::uint32_t generation{0};
    mutable std::uint32_t rebuildAllGeometryCount_{0};
    mutable bool pendingFullRebuild_{false};
    mutable float lastLoadMs{0.0f};
    mutable float lastRebuildMs{0.0f};
    float lastApplyMs{0.0f};
    SelectionManager selectionManager_;
    std::uint32_t nextEntityId_{1};
    std::uint32_t nextLayerId_{1};
    HistoryManager historyManager_;

    static constexpr std::size_t kMaxEvents = 2048;
    std::vector<EngineEvent> eventQueue_{};
    std::size_t eventHead_{0};
    std::size_t eventTail_{0};
    std::size_t eventCount_{0};
    bool eventOverflowed_{false};
    std::uint32_t eventOverflowGeneration_{0};
    std::vector<EngineEvent> eventBuffer_{};

    std::unordered_map<std::uint32_t, std::uint32_t> pendingEntityChanges_{};
    std::unordered_map<std::uint32_t, std::uint32_t> pendingEntityCreates_{};
    std::unordered_set<std::uint32_t> pendingEntityDeletes_{};
    std::unordered_map<std::uint32_t, std::uint32_t> pendingLayerChanges_{};
    std::uint32_t pendingDocMask_{0};
    bool pendingSelectionChanged_{false};
    bool pendingOrderChanged_{false};
    bool pendingHistoryChanged_{false};

    mutable std::vector<OverlayPrimitive> selectionOutlinePrimitives_{};
    mutable std::vector<float> selectionOutlineData_{};
    mutable std::vector<OverlayPrimitive> selectionHandlePrimitives_{};
    mutable std::vector<float> selectionHandleData_{};


    // Error handling
    mutable EngineError lastError{EngineError::Ok};
    // Helper to clear error
    void clearError() const { lastError = EngineError::Ok; }
    void setError(EngineError err) const { lastError = err; }

    // read/write helpers moved to engine/util.h

    void clearWorld() noexcept;

    void trackNextEntityId(std::uint32_t id);
    void setNextEntityId(std::uint32_t id) { nextEntityId_ = id; }
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

    // Helper methods that were private/internal now delegated
    // encode/decode history bytes now on HistoryManager but exposed via CadEngine methods if needed
    // or we just use historyManager directly in cpp file.
    // We KEEP declarations of public API methods that were here?
    // encodeHistoryBytes was private? No line 445 shows it public section?
    // Actually lines 411+ seem public (CadEngine API).
    
    // We keep these signatures but they will delegate to HistoryManager in cpp.
    // Removed specific history helper/internal methods from header:
    // finalize, capture, apply*Snapshot (internal), applyHistoryEntry.
    
    // encodeHistoryBytes/decodeHistoryBytes were public?
    // Let's check line 445 context.
    // Yes, they are after line 334 public.
    
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
    
    void setSnapOptions(bool enabled, bool gridEnabled, float gridSize);
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
    struct TextureBufferMeta {
        std::uint32_t generation;
        std::uint32_t width;
        std::uint32_t height;
        std::uint32_t byteCount;
        std::uintptr_t ptr;
    };
    TextureBufferMeta getAtlasTextureMeta() const noexcept;
    
    /**
     * Check if atlas texture needs re-upload.
     */
    bool isAtlasDirty() const noexcept;
    
    /**
     * Check if text quads need to be rebuilt.
     */
    bool isTextQuadsDirty() const { return textQuadsDirty_; }

    /**
     * Mark text quads as dirty.
     */
    void markTextQuadsDirty() const { textQuadsDirty_ = true; }

    /**
     * Clear atlas dirty flag after texture upload.
     */
    void clearAtlasDirty();
    
    /**
     * Metadata for text content buffer (for JS to read content from engine).
     */
    struct TextContentMeta {
        std::uint32_t byteCount;  // Length of UTF-8 content in bytes
        std::uintptr_t ptr;       // Pointer to UTF-8 data in WASM memory
        bool exists;              // Whether the text entity exists
    };
    
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

    // Implementation of the command callback which applies a single parsed command to the CadEngine.
    static EngineError cad_command_callback(void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount);

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
    void addDraftToBuffers() const;
    void beginDraft(const BeginDraftPayload& p);
    void updateDraft(float x, float y);
    void appendDraftPoint(float x, float y);
    std::uint32_t commitDraft();
    void cancelDraft();

    bool refreshEntityRenderRange(std::uint32_t id) const;

// ==============================================================================
// Interaction Session (Phase 4)
// ==============================================================================
public:
    using TransformMode = ::TransformMode;
    using TransformOpCode = ::TransformOpCode;

private:
    static constexpr std::uint32_t hashU32(std::uint32_t h, std::uint32_t v) {
        return (h ^ v) * kAbiHashPrime;
    }

    template <std::size_t N>
    static constexpr std::uint32_t hashArray(std::uint32_t h, const std::array<std::uint32_t, N>& values) {
        for (std::size_t i = 0; i < N; ++i) {
            h = hashU32(h, values[i]);
        }
        return h;
    }

    static constexpr std::uint32_t hashEnum(std::uint32_t h, std::uint32_t tag, std::initializer_list<std::uint32_t> values) {
        h = hashU32(h, tag);
        h = hashU32(h, static_cast<std::uint32_t>(values.size()));
        for (auto v : values) {
            h = hashU32(h, v);
        }
        return h;
    }

    template <std::size_t N>
    static constexpr std::uint32_t hashEnum(std::uint32_t h, std::uint32_t tag, const std::array<std::uint32_t, N>& values) {
        h = hashU32(h, tag);
        h = hashU32(h, static_cast<std::uint32_t>(N));
        return hashArray(h, values);
    }

    static constexpr std::uint32_t hashStruct(std::uint32_t h, std::uint32_t tag, std::uint32_t size, std::initializer_list<std::uint32_t> offsets) {
        h = hashU32(h, tag);
        h = hashU32(h, size);
        h = hashU32(h, static_cast<std::uint32_t>(offsets.size()));
        for (auto v : offsets) {
            h = hashU32(h, v);
        }
        return h;
    }

    template <std::size_t N>
    static constexpr std::uint32_t hashStruct(std::uint32_t h, std::uint32_t tag, std::uint32_t size, const std::array<std::uint32_t, N>& offsets) {
        h = hashU32(h, tag);
        h = hashU32(h, size);
        h = hashU32(h, static_cast<std::uint32_t>(N));
        return hashArray(h, offsets);
    }

    static constexpr std::uint32_t computeAbiHash() {
        std::uint32_t h = kAbiHashOffset;

        h = hashEnum(h, 0xE0000001u, {
            static_cast<std::uint32_t>(CommandOp::ClearAll),
            static_cast<std::uint32_t>(CommandOp::UpsertRect),
            static_cast<std::uint32_t>(CommandOp::UpsertLine),
            static_cast<std::uint32_t>(CommandOp::UpsertPolyline),
            static_cast<std::uint32_t>(CommandOp::DeleteEntity),
            static_cast<std::uint32_t>(CommandOp::SetDrawOrder),
            static_cast<std::uint32_t>(CommandOp::SetViewScale),
            static_cast<std::uint32_t>(CommandOp::UpsertCircle),
            static_cast<std::uint32_t>(CommandOp::UpsertPolygon),
            static_cast<std::uint32_t>(CommandOp::UpsertArrow),
            static_cast<std::uint32_t>(CommandOp::UpsertText),
            static_cast<std::uint32_t>(CommandOp::DeleteText),
            static_cast<std::uint32_t>(CommandOp::SetTextCaret),
            static_cast<std::uint32_t>(CommandOp::SetTextSelection),
            static_cast<std::uint32_t>(CommandOp::InsertTextContent),
            static_cast<std::uint32_t>(CommandOp::DeleteTextContent),
            static_cast<std::uint32_t>(CommandOp::ApplyTextStyle),
            static_cast<std::uint32_t>(CommandOp::SetTextAlign),
        });

        h = hashEnum(h, 0xE0000002u, {
            static_cast<std::uint32_t>(PickSubTarget::None),
            static_cast<std::uint32_t>(PickSubTarget::Body),
            static_cast<std::uint32_t>(PickSubTarget::Edge),
            static_cast<std::uint32_t>(PickSubTarget::Vertex),
            static_cast<std::uint32_t>(PickSubTarget::ResizeHandle),
            static_cast<std::uint32_t>(PickSubTarget::RotateHandle),
            static_cast<std::uint32_t>(PickSubTarget::TextBody),
            static_cast<std::uint32_t>(PickSubTarget::TextCaret),
        });

        h = hashEnum(h, 0xE0000003u, {
            static_cast<std::uint32_t>(PickEntityKind::Unknown),
            static_cast<std::uint32_t>(PickEntityKind::Rect),
            static_cast<std::uint32_t>(PickEntityKind::Circle),
            static_cast<std::uint32_t>(PickEntityKind::Line),
            static_cast<std::uint32_t>(PickEntityKind::Polyline),
            static_cast<std::uint32_t>(PickEntityKind::Polygon),
            static_cast<std::uint32_t>(PickEntityKind::Arrow),
            static_cast<std::uint32_t>(PickEntityKind::Text),
        });

        h = hashEnum(h, 0xE0000004u, {
            static_cast<std::uint32_t>(TransformMode::Move),
            static_cast<std::uint32_t>(TransformMode::VertexDrag),
            static_cast<std::uint32_t>(TransformMode::EdgeDrag),
            static_cast<std::uint32_t>(TransformMode::Resize),
        });

        h = hashEnum(h, 0xE0000005u, {
            static_cast<std::uint32_t>(TransformOpCode::MOVE),
            static_cast<std::uint32_t>(TransformOpCode::VERTEX_SET),
            static_cast<std::uint32_t>(TransformOpCode::RESIZE),
        });

        h = hashEnum(h, 0xE0000006u, {
            static_cast<std::uint32_t>(EngineCapability::HAS_QUERY_MARQUEE),
            static_cast<std::uint32_t>(EngineCapability::HAS_RESIZE_HANDLES),
            static_cast<std::uint32_t>(EngineCapability::HAS_TRANSFORM_RESIZE),
        });

        h = hashEnum(h, 0xE0000007u, {
            static_cast<std::uint32_t>(TextStyleFlags::None),
            static_cast<std::uint32_t>(TextStyleFlags::Bold),
            static_cast<std::uint32_t>(TextStyleFlags::Italic),
            static_cast<std::uint32_t>(TextStyleFlags::Underline),
            static_cast<std::uint32_t>(TextStyleFlags::Strike),
        });

        h = hashEnum(h, 0xE0000008u, {
            static_cast<std::uint32_t>(TextAlign::Left),
            static_cast<std::uint32_t>(TextAlign::Center),
            static_cast<std::uint32_t>(TextAlign::Right),
        });

        h = hashEnum(h, 0xE0000009u, {
            static_cast<std::uint32_t>(TextBoxMode::AutoWidth),
            static_cast<std::uint32_t>(TextBoxMode::FixedWidth),
        });

        h = hashEnum(h, 0xE000000Au, {
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_PROTOCOL),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_LAYERS_FLAGS),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SELECTION_ORDER),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SNAPSHOT_VNEXT),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_EVENT_STREAM),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_OVERLAY_QUERIES),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_INTERACTIVE_TRANSFORM),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_HISTORY),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_DOCUMENT_SOT),
        });

        h = hashEnum(h, 0xE000000Bu, {
            static_cast<std::uint32_t>(LayerFlags::Visible),
            static_cast<std::uint32_t>(LayerFlags::Locked),
        });

        h = hashEnum(h, 0xE000000Cu, {
            static_cast<std::uint32_t>(EntityFlags::Visible),
            static_cast<std::uint32_t>(EntityFlags::Locked),
        });

        h = hashEnum(h, 0xE000000Du, {
            static_cast<std::uint32_t>(LayerPropMask::Name),
            static_cast<std::uint32_t>(LayerPropMask::Visible),
            static_cast<std::uint32_t>(LayerPropMask::Locked),
        });

        h = hashEnum(h, 0xE000000Eu, {
            static_cast<std::uint32_t>(SelectionMode::Replace),
            static_cast<std::uint32_t>(SelectionMode::Add),
            static_cast<std::uint32_t>(SelectionMode::Remove),
            static_cast<std::uint32_t>(SelectionMode::Toggle),
        });

        h = hashEnum(h, 0xE000000Fu, {
            static_cast<std::uint32_t>(SelectionModifier::Shift),
            static_cast<std::uint32_t>(SelectionModifier::Ctrl),
            static_cast<std::uint32_t>(SelectionModifier::Alt),
            static_cast<std::uint32_t>(SelectionModifier::Meta),
        });

        h = hashEnum(h, 0xE0000010u, {
            static_cast<std::uint32_t>(MarqueeMode::Window),
            static_cast<std::uint32_t>(MarqueeMode::Crossing),
        });

        h = hashEnum(h, 0xE0000011u, {
            static_cast<std::uint32_t>(ReorderAction::BringToFront),
            static_cast<std::uint32_t>(ReorderAction::SendToBack),
            static_cast<std::uint32_t>(ReorderAction::BringForward),
            static_cast<std::uint32_t>(ReorderAction::SendBackward),
        });

        h = hashEnum(h, 0xE0000012u, {
            static_cast<std::uint32_t>(EventType::Overflow),
            static_cast<std::uint32_t>(EventType::DocChanged),
            static_cast<std::uint32_t>(EventType::EntityChanged),
            static_cast<std::uint32_t>(EventType::EntityCreated),
            static_cast<std::uint32_t>(EventType::EntityDeleted),
            static_cast<std::uint32_t>(EventType::LayerChanged),
            static_cast<std::uint32_t>(EventType::SelectionChanged),
            static_cast<std::uint32_t>(EventType::OrderChanged),
            static_cast<std::uint32_t>(EventType::HistoryChanged),
        });

        h = hashEnum(h, 0xE0000013u, {
            static_cast<std::uint32_t>(ChangeMask::Geometry),
            static_cast<std::uint32_t>(ChangeMask::Style),
            static_cast<std::uint32_t>(ChangeMask::Flags),
            static_cast<std::uint32_t>(ChangeMask::Layer),
            static_cast<std::uint32_t>(ChangeMask::Order),
            static_cast<std::uint32_t>(ChangeMask::Text),
            static_cast<std::uint32_t>(ChangeMask::Bounds),
            static_cast<std::uint32_t>(ChangeMask::RenderData),
        });

        h = hashEnum(h, 0xE0000014u, {
            static_cast<std::uint32_t>(OverlayKind::Polyline),
            static_cast<std::uint32_t>(OverlayKind::Polygon),
            static_cast<std::uint32_t>(OverlayKind::Segment),
            static_cast<std::uint32_t>(OverlayKind::Rect),
            static_cast<std::uint32_t>(OverlayKind::Point),
        });

        h = hashStruct(h, 0x53000001u, sizeof(ProtocolInfo), {
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, protocolVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, commandVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, snapshotVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, eventStreamVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, abiHash)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, featureFlags)),
        });

        h = hashStruct(h, 0x53000002u, sizeof(BufferMeta), {
            static_cast<std::uint32_t>(offsetof(BufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, vertexCount)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, capacity)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, floatCount)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000003u, sizeof(ByteBufferMeta), {
            static_cast<std::uint32_t>(offsetof(ByteBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(ByteBufferMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(ByteBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000004u, sizeof(EngineStats), {
            static_cast<std::uint32_t>(offsetof(EngineStats, generation)),
            static_cast<std::uint32_t>(offsetof(EngineStats, rectCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lineCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, polylineCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, pointCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, triangleVertexCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lineVertexCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, rebuildAllGeometryCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastLoadMs)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastRebuildMs)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastApplyMs)),
        });

        h = hashStruct(h, 0x53000005u, sizeof(PickResult), {
            static_cast<std::uint32_t>(offsetof(PickResult, id)),
            static_cast<std::uint32_t>(offsetof(PickResult, kind)),
            static_cast<std::uint32_t>(offsetof(PickResult, subTarget)),
            static_cast<std::uint32_t>(offsetof(PickResult, subIndex)),
            static_cast<std::uint32_t>(offsetof(PickResult, distance)),
            static_cast<std::uint32_t>(offsetof(PickResult, hitX)),
            static_cast<std::uint32_t>(offsetof(PickResult, hitY)),
        });

        h = hashStruct(h, 0x53000006u, sizeof(TextHitResult), {
            static_cast<std::uint32_t>(offsetof(TextHitResult, charIndex)),
            static_cast<std::uint32_t>(offsetof(TextHitResult, lineIndex)),
            static_cast<std::uint32_t>(offsetof(TextHitResult, isLeadingEdge)),
        });

        h = hashStruct(h, 0x53000007u, sizeof(TextCaretPosition), {
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, x)),
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, y)),
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, height)),
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, lineIndex)),
        });

        h = hashStruct(h, 0x53000008u, sizeof(TextureBufferMeta), {
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, width)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, height)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000009u, sizeof(TextContentMeta), {
            static_cast<std::uint32_t>(offsetof(TextContentMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(TextContentMeta, ptr)),
            static_cast<std::uint32_t>(offsetof(TextContentMeta, exists)),
        });

        h = hashStruct(h, 0x5300000Au, sizeof(engine::text::TextStyleSnapshot), {
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionStartLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionEndLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionStartByte)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionEndByte)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, caretLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, caretByte)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, lineIndex)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, x)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, y)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, lineHeight)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, styleTriStateFlags)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, align)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, textGeneration)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, styleTriStateParamsLen)),
        });

        h = hashStruct(h, 0x5300000Bu, sizeof(engine::text::ApplyTextStylePayload), {
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, textId)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, rangeStartLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, rangeEndLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, flagsMask)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, flagsValue)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, mode)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, styleParamsVersion)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, styleParamsLen)),
        });

        h = hashStruct(h, 0x5300000Cu, sizeof(RectPayload), {
            static_cast<std::uint32_t>(offsetof(RectPayload, x)),
            static_cast<std::uint32_t>(offsetof(RectPayload, y)),
            static_cast<std::uint32_t>(offsetof(RectPayload, w)),
            static_cast<std::uint32_t>(offsetof(RectPayload, h)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillR)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillG)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillB)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillA)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeR)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeG)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeB)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeA)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeEnabled)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x5300000Du, sizeof(LinePayload), {
            static_cast<std::uint32_t>(offsetof(LinePayload, x0)),
            static_cast<std::uint32_t>(offsetof(LinePayload, y0)),
            static_cast<std::uint32_t>(offsetof(LinePayload, x1)),
            static_cast<std::uint32_t>(offsetof(LinePayload, y1)),
            static_cast<std::uint32_t>(offsetof(LinePayload, r)),
            static_cast<std::uint32_t>(offsetof(LinePayload, g)),
            static_cast<std::uint32_t>(offsetof(LinePayload, b)),
            static_cast<std::uint32_t>(offsetof(LinePayload, a)),
            static_cast<std::uint32_t>(offsetof(LinePayload, enabled)),
            static_cast<std::uint32_t>(offsetof(LinePayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x5300000Eu, sizeof(PolylinePayloadHeader), {
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, r)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, g)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, b)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, a)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, enabled)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, strokeWidthPx)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, count)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, reserved)),
        });

        h = hashStruct(h, 0x5300000Fu, sizeof(DrawOrderPayloadHeader), {
            static_cast<std::uint32_t>(offsetof(DrawOrderPayloadHeader, count)),
            static_cast<std::uint32_t>(offsetof(DrawOrderPayloadHeader, reserved)),
        });

        h = hashStruct(h, 0x53000010u, sizeof(ViewScalePayload), {
            static_cast<std::uint32_t>(offsetof(ViewScalePayload, scale)),
        });

        h = hashStruct(h, 0x53000011u, sizeof(CirclePayload), {
            static_cast<std::uint32_t>(offsetof(CirclePayload, cx)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, cy)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, rx)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, ry)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, rot)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, sx)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, sy)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillR)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillG)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillB)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillA)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeR)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeG)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeB)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeA)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeEnabled)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x53000012u, sizeof(PolygonPayload), {
            static_cast<std::uint32_t>(offsetof(PolygonPayload, sides)),
        });

        h = hashStruct(h, 0x53000013u, sizeof(ArrowPayload), {
            static_cast<std::uint32_t>(offsetof(ArrowPayload, ax)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, ay)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, bx)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, by)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, head)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeR)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeG)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeB)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeA)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeEnabled)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x53000014u, sizeof(TextPayloadHeader), {
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, x)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, y)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, rotation)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, boxMode)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, align)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, constraintWidth)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, runCount)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, contentLength)),
        });

        h = hashStruct(h, 0x53000015u, sizeof(TextRunPayload), {
            static_cast<std::uint32_t>(offsetof(TextRunPayload, startIndex)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, length)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, fontId)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, fontSize)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, colorRGBA)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, flags)),
        });

        h = hashStruct(h, 0x53000016u, sizeof(TextCaretPayload), {
            static_cast<std::uint32_t>(offsetof(TextCaretPayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextCaretPayload, caretIndex)),
        });

        h = hashStruct(h, 0x53000017u, sizeof(TextSelectionPayload), {
            static_cast<std::uint32_t>(offsetof(TextSelectionPayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextSelectionPayload, selectionStart)),
            static_cast<std::uint32_t>(offsetof(TextSelectionPayload, selectionEnd)),
        });

        h = hashStruct(h, 0x53000018u, sizeof(TextInsertPayloadHeader), {
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, textId)),
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, insertIndex)),
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, byteLength)),
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, reserved)),
        });

        h = hashStruct(h, 0x53000019u, sizeof(TextDeletePayload), {
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, startIndex)),
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, endIndex)),
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, reserved)),
        });

        h = hashStruct(h, 0x5300001Au, sizeof(TextAlignmentPayload), {
            static_cast<std::uint32_t>(offsetof(TextAlignmentPayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextAlignmentPayload, align)),
        });

        h = hashStruct(h, 0x5300001Bu, sizeof(engine::text::TextLayoutEngine::SelectionRect), {
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, x)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, y)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, width)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, height)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, lineIndex)),
        });

        h = hashStruct(h, 0x5300001Cu, sizeof(TextBoundsResult), {
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, minX)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, minY)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, maxX)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, maxY)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, valid)),
        });

        h = hashStruct(h, 0x5300001Du, sizeof(LayerRecord), {
            static_cast<std::uint32_t>(offsetof(LayerRecord, id)),
            static_cast<std::uint32_t>(offsetof(LayerRecord, order)),
            static_cast<std::uint32_t>(offsetof(LayerRecord, flags)),
        });

        h = hashStruct(h, 0x5300001Eu, sizeof(DocumentDigest), {
            static_cast<std::uint32_t>(offsetof(DocumentDigest, lo)),
            static_cast<std::uint32_t>(offsetof(DocumentDigest, hi)),
        });

        h = hashStruct(h, 0x5300001Fu, sizeof(EngineEvent), {
            static_cast<std::uint32_t>(offsetof(EngineEvent, type)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, flags)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, a)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, b)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, c)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, d)),
        });

        h = hashStruct(h, 0x53000020u, sizeof(EventBufferMeta), {
            static_cast<std::uint32_t>(offsetof(EventBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(EventBufferMeta, count)),
            static_cast<std::uint32_t>(offsetof(EventBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000021u, sizeof(OverlayPrimitive), {
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, kind)),
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, flags)),
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, count)),
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, offset)),
        });

        h = hashStruct(h, 0x53000022u, sizeof(OverlayBufferMeta), {
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, primitiveCount)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, floatCount)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, primitivesPtr)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, dataPtr)),
        });

        h = hashStruct(h, 0x53000023u, sizeof(EntityAabb), {
            static_cast<std::uint32_t>(offsetof(EntityAabb, minX)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, minY)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, maxX)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, maxY)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, valid)),
        });

        h = hashStruct(h, 0x53000024u, sizeof(HistoryMeta), {
            static_cast<std::uint32_t>(offsetof(HistoryMeta, depth)),
            static_cast<std::uint32_t>(offsetof(HistoryMeta, cursor)),
            static_cast<std::uint32_t>(offsetof(HistoryMeta, generation)),
        });

        return h;
    }

    // ABI Hash matches frontend/engine/core/protocol.ts EXPECTED_ABI_HASH.
    // We hardcode it here because dynamic computation via constexpr std::initializer_list 
    // is failing on the current Emscripten compiler environment.
    // If you change the ABI (structs, enums), update this hash or fix computeAbiHash().
    static constexpr std::uint32_t kAbiHash = 0x96ec015d;



    InteractionSession interactionSession_;



    // Commit Result Buffers (Struct-of-Arrays)
    // We keep these alive between commits so WASM can read them safely immediately after commit.


public:
    /**
     * Start an interactive transform session.
     * @param ids List of entity IDs to transform
     * @param idCount Number of IDs
     * @param mode Transform mode (Move, VertexDrag, etc)
     * @param specificId ID of the specific sub-element being dragged (e.g. vertex owner)
     * @param vertexIndex Index of vertex if applicable, -1 otherwise
     * @param startX World X start position
     * @param startY World Y start position
     */
    void beginTransform(
        const std::uint32_t* ids, 
        std::uint32_t idCount, 
        TransformMode mode, 
        std::uint32_t specificId, 
        int32_t vertexIndex, 
        float startX, 
        float startY
    );

    /**
     * Update the current transform session.
     * @param worldX Current pointer World X
     * @param worldY Current pointer World Y
     */
    void updateTransform(float worldX, float worldY);

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
    bool isInteractionActive() const { return interactionSession_.isInteractionActive(); }

    // Accessors for Commit Results (WASM Bindings)
    std::uint32_t getCommitResultCount() const { return static_cast<std::uint32_t>(interactionSession_.getCommitResultIds().size()); }
    std::uintptr_t getCommitResultIdsPtr() const { return reinterpret_cast<std::uintptr_t>(interactionSession_.getCommitResultIds().data()); }
    std::uintptr_t getCommitResultOpCodesPtr() const { return reinterpret_cast<std::uintptr_t>(interactionSession_.getCommitResultOpCodes().data()); }
    std::uintptr_t getCommitResultPayloadsPtr() const { return reinterpret_cast<std::uintptr_t>(interactionSession_.getCommitResultPayloads().data()); }
};
