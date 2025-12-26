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
#include "engine/pick_system.h"
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

// Public CadEngine API header. Implementation remains header-only for now
// (methods are defined inline inside the class to preserve simplicity during
// this refactor). Later we can move heavy method bodies into a .cpp file.

class CadEngine {
public:
    // Expose legacy nested type names for backwards compatibility with existing callers/tests
    using CommandOp = ::CommandOp;

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

    ByteBufferMeta getSnapshotBufferMeta() const noexcept;

    struct EngineStats {
        std::uint32_t generation;
        std::uint32_t rectCount;
        std::uint32_t lineCount;
        std::uint32_t polylineCount;
        std::uint32_t pointCount;
        std::uint32_t triangleVertexCount;
        std::uint32_t lineVertexCount;
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
    TextSystem textSystem_;

    // Picking subsystem
    mutable PickSystem pickSystem_;

    float viewScale{1.0f};

    mutable std::vector<float> triangleVertices;
    mutable std::vector<float> lineVertices;
    mutable std::vector<std::uint8_t> snapshotBytes;
    mutable bool textQuadsDirty_{true};
    mutable bool renderDirty{false};
    mutable bool snapshotDirty{false};
    std::uint32_t generation{0};
    mutable float lastLoadMs{0.0f};
    mutable float lastRebuildMs{0.0f};
    float lastApplyMs{0.0f};

    void markTextQuadsDirty() const { textQuadsDirty_ = true; }

    // Error handling
    mutable EngineError lastError{EngineError::Ok};
    // Helper to clear error
    void clearError() const { lastError = EngineError::Ok; }
    void setError(EngineError err) const { lastError = err; }

    // read/write helpers moved to engine/util.h

    void clearWorld() noexcept;

    void deleteEntity(std::uint32_t id) noexcept;

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
     * @param outMaxX Output max X
     * @param outMaxY Output max Y
     * @return True if text exists
     */
    bool getTextBounds(std::uint32_t textId, float& outMinX, float& outMinY, float& outMaxX, float& outMaxY) const;

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
};
