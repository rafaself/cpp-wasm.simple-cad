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
    std::vector<SymbolRec> symbols;
    std::vector<NodeRec> nodes;
    std::vector<ConduitRec> conduits;
    std::unordered_map<std::uint32_t, EntityRef> entities;

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

    void upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b);
    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1);
    void upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count);
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
