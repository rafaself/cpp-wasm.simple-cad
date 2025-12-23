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
#include "engine/electrical.h"

// Text subsystem headers
#include "engine/text/text_store.h"
#include "engine/text/font_manager.h"
#include "engine/text/text_layout.h"
#include "engine/text/glyph_atlas.h"

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
    using NodeKind = ::NodeKind;
    using SnapResult = ::SnapResult;

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
        std::uint32_t symbolCount;
        std::uint32_t nodeCount;
        std::uint32_t conduitCount;
        std::uint32_t pointCount;
        std::uint32_t triangleVertexCount;
        std::uint32_t lineVertexCount;
        float lastLoadMs;
        float lastRebuildMs;
        float lastApplyMs;
    };

    EngineStats getStats() const noexcept;

    SnapResult snapElectrical(float x, float y, float tolerance) const noexcept;
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

    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
    std::vector<CircleRec> circles;
    std::vector<PolygonRec> polygons;
    std::vector<ArrowRec> arrows;
    std::vector<SymbolRec> symbols;
    std::vector<NodeRec> nodes;
    std::vector<ConduitRec> conduits;
    std::unordered_map<std::uint32_t, EntityRef> entities;

    // Text subsystem
    engine::text::TextStore textStore_;
    engine::text::FontManager fontManager_;
    engine::text::TextLayoutEngine textLayoutEngine_;
    engine::text::GlyphAtlas glyphAtlas_;
    bool textInitialized_{false};
    mutable std::vector<float> textQuadBuffer_;  // For text rendering quads

    std::vector<std::uint32_t> drawOrderIds;
    float viewScale{1.0f};

    mutable std::vector<float> triangleVertices;
    mutable std::vector<float> lineVertices;
    mutable std::vector<std::uint8_t> snapshotBytes;
    mutable bool renderDirty{false};
    mutable bool snapshotDirty{false};
    std::uint32_t generation{0};
    mutable float lastLoadMs{0.0f};
    mutable float lastRebuildMs{0.0f};
    float lastApplyMs{0.0f};

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
    void upsertSymbol(
        std::uint32_t id,
        std::uint32_t symbolKey,
        float x,
        float y,
        float w,
        float h,
        float rotation,
        float scaleX,
        float scaleY,
        float connX,
        float connY
    );
    void upsertNode(std::uint32_t id, NodeKind kind, std::uint32_t anchorSymbolId, float x, float y);
    void upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId);
    void upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId, float r, float g, float b, float a, float enabled, float strokeWidthPx);

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
    bool loadFont(std::uint32_t fontId, const std::uint8_t* fontData, std::size_t dataSize);
    
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

    const SymbolRec* findSymbol(std::uint32_t id) const noexcept;
    const NodeRec* findNode(std::uint32_t id) const noexcept;

    bool resolveNodePosition(std::uint32_t nodeId, Point2& out) const noexcept;

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
