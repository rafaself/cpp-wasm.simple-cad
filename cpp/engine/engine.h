#ifndef ELETROCAD_ENGINE_H
#define ELETROCAD_ENGINE_H

#include "engine/types.h"
#include "engine/entity_manager.h"
#include "engine/text_system.h"
#include <vector>
#include <cstdint>
#include <unordered_map>
#include <string>

// The main CAD engine class (exposed to WASM).
// Now orchestrates EntityManager, TextSystem, and Rendering.
class CadEngine {
public:
    CadEngine();

    // Reset everything
    void clear() noexcept;

    // --- Data loading & Commands ---
    // Allocator helpers for WASM to write data into
    std::uintptr_t allocBytes(std::uint32_t byteCount);
    void freeBytes(std::uintptr_t ptr);

    // Load a complete snapshot (EWC1 format)
    void loadSnapshotFromPtr(std::uintptr_t ptr, std::uint32_t byteCount);

    // Apply a command buffer (EWDC format)
    void applyCommandBuffer(std::uintptr_t ptr, std::uint32_t byteCount);

    // --- Rendering ---
    // Returns number of vertices in the main triangle buffer
    std::uint32_t getVertexCount() const noexcept;
    // Returns pointer to float array of vertices
    std::uintptr_t getVertexDataPtr() const noexcept;

    // Buffer metadata for zero-copy views in JS
    struct BufferMeta {
        std::uint32_t generation;
        std::uint32_t vertexCount;
        std::uint32_t capacityVertices;
        std::uint32_t floatCount;
        std::uintptr_t ptr;
    };
    BufferMeta getPositionBufferMeta() const noexcept;
    BufferMeta getLineBufferMeta() const noexcept;

    struct ByteBufferMeta {
        std::uint32_t generation;
        std::uint32_t byteCount;
        std::uintptr_t ptr;
    };
    ByteBufferMeta getSnapshotBufferMeta() const noexcept;

    // Stats
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

    // --- Picking ---
    // Returns entity ID or 0 if none
    std::uint32_t pick(float x, float y, float tolerance) const noexcept;

    // --- Error handling ---
    EngineError getLastError() const noexcept { return lastError; }
    void clearError() noexcept { lastError = EngineError::Ok; }

    // --- Text System Public API ---
    // Register a font (TTF/OTF bytes)
    bool loadFont(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize);
    
    // Text Mutation
    // Note: UpsertText is handled via command buffer now, but internal method is exposed here.
    bool upsertText(std::uint32_t id, const TextPayloadHeader& header, const TextRunPayload* runs, std::uint32_t runCount, const char* content, std::uint32_t contentLength);
    bool deleteText(std::uint32_t id);
    void setTextCaret(std::uint32_t textId, std::uint32_t caretIndex);
    void setTextSelection(std::uint32_t textId, std::uint32_t selectionStart, std::uint32_t selectionEnd);
    bool insertTextContent(std::uint32_t textId, std::uint32_t insertIndex, const char* content, std::uint32_t byteLength);
    bool deleteTextContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex);
    
    // Styling & Layout
    // Payload + params buffer
    bool applyTextStyle(const engine::text::ApplyTextStylePayload& payload, const std::uint8_t* params, std::uint32_t paramsLen);
    bool setTextAlign(std::uint32_t textId, TextAlign align);
    bool setTextConstraintWidth(std::uint32_t textId, float width);
    bool setTextPosition(std::uint32_t textId, float x, float y, TextBoxMode boxMode, float constraintWidth);

    // Text Query / State
    TextHitResult hitTestText(std::uint32_t textId, float localX, float localY) const;
    TextCaretPosition getTextCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const;
    bool getTextBounds(std::uint32_t textId, float& outMinX, float& outMinY, float& outMaxX, float& outMaxY) const;
    
    // State Snapshot for JS UI
    engine::text::TextStyleSnapshot getTextStyleSnapshot(std::uint32_t textId) const;

    // Text Rendering
    // Returns meta for the quad buffer (instanced/batched quads for text)
    BufferMeta getTextQuadBufferMeta() const noexcept;
    
    // Returns meta for the texture atlas (RGBA8 pixels)
    struct TextureBufferMeta {
        std::uint32_t version;
        std::uint32_t width;
        std::uint32_t height;
        std::uint32_t byteCount;
        std::uintptr_t ptr;
    };
    TextureBufferMeta getAtlasTextureMeta() const noexcept;
    bool isAtlasDirty() const noexcept;
    void clearAtlasDirty();
    
    // Text Content Query (for verification/debug)
    struct TextContentMeta {
        std::uint32_t length;
        std::uintptr_t ptr;
        bool valid;
    };
    TextContentMeta getTextContentMeta(std::uint32_t textId) const noexcept;

    // Text Selection Geometry
    struct TextSelectionRect {
        float x, y, w, h;
    };
    // Returns rects relative to text origin
    std::vector<TextSelectionRect> getTextSelectionRects(std::uint32_t textId, std::uint32_t start, std::uint32_t end) const;

    // Navigation
    std::uint32_t getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const;

public:
    // Internal state
    std::vector<float> triangleVertices; // x,y,z,r,g,b,a
    std::vector<float> lineVertices;     // x,y,z,r,g,b,a

    EntityManager entityManager_;

    // Text System (Subsystem)
    engine::text::TextSystem textSystem_;

    // Flags for state-aware picking
    std::unordered_map<std::uint32_t, std::uint8_t> entityFlags_;

    float viewScale = 1.0f;
    mutable bool renderDirty = true;
    mutable bool snapshotDirty = true;

    mutable std::vector<std::uint8_t> snapshotBytes;

    std::uint32_t generation = 1;
    float lastLoadMs = 0.0f;
    float lastRebuildMs = 0.0f;
    float lastApplyMs = 0.0f;

    EngineError lastError = EngineError::Ok;

    // Internal helpers
    void reserveWorld(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints);
    void clearWorld() noexcept;
    void rebuildRenderBuffers() const;
    void rebuildSnapshotBytes() const;
    void setError(EngineError err) { lastError = err; }

    // Helpers for geometry generation
    void pushVertex(float x, float y, float z, float r, float g, float b, std::vector<float>& target) const;
    void pushVertex(float x, float y, float z, std::vector<float>& target) const;
    void addRect(float x, float y, float w, float h, float r, float g, float b) const;
    void addRectOutline(float x, float y, float w, float h) const;
    void addLineSegment(float x0, float y0, float x1, float y1, float z) const;

    // Command handlers
    void deleteEntity(std::uint32_t id) noexcept;
    void upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr=0, float sg=0, float sb=0, float sa=0, float strokeEnabled=0, float strokeWidthPx=1);
    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx);
    void upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx);
    void upsertCircle(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);
    void upsertPolygon(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, std::uint32_t sides, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);
    void upsertArrow(std::uint32_t id, float ax, float ay, float bx, float by, float head, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);

    // Internal wrapper for command callback
    static EngineError cad_command_callback(void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount);

    // Text internal helpers
    void rebuildTextQuadBuffer();
    void markTextQuadsDirty() { textSystem_.markDirty(); renderDirty = true; }
    void compactPolylinePoints() { entityManager_.compactPolylinePoints(); }
};

#endif // ELETROCAD_ENGINE_H
