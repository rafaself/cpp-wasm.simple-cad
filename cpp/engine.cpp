
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <cmath>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

class CadEngine {
public:
    CadEngine() {
        // Pre-reserve to reduce the chance of vector growth (and pointer invalidation) early on.
        // Phase 2 goal is "stable views" in JS over WASM memory.
        triangleVertices.reserve(defaultCapacityFloats);
        lineVertices.reserve(defaultLineCapacityFloats);
        snapshotBytes.reserve(defaultSnapshotCapacityBytes);
    }

    void clear() noexcept {
        clearWorld();
        generation++;
    }

    // Allocate transient bytes inside WASM memory (for TS/JS to copy snapshot payloads).
    std::uintptr_t allocBytes(std::uint32_t byteCount) {
        void* p = std::malloc(byteCount);
        return reinterpret_cast<std::uintptr_t>(p);
    }

    void freeBytes(std::uintptr_t ptr) {
        std::free(reinterpret_cast<void*>(ptr));
    }

    void reserveWorld(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints) {
        rects.reserve(maxRects);
        lines.reserve(maxLines);
        polylines.reserve(maxPolylines);
        points.reserve(maxPoints);

        // Conservative render buffer reservation to reduce reallocs.
        triangleVertices.reserve(static_cast<std::size_t>(maxRects) * rectTriangleFloats);
        lineVertices.reserve(
            static_cast<std::size_t>(maxRects) * rectOutlineFloats +
            static_cast<std::size_t>(maxLines) * lineSegmentFloats +
            static_cast<std::size_t>(maxPoints) * 2 * 3 // rough worst-case for polyline segments
        );
    }

    // Loads a versioned world snapshot from WASM linear memory.
    // TS should allocate+copy into WASM memory and pass ptr+size.
    void loadSnapshotFromPtr(std::uintptr_t ptr, std::uint32_t byteCount) {
        const double t0 = emscripten_get_now();

        const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
        if (!src || byteCount < snapshotHeaderBytesV2) {
            throw std::runtime_error("Invalid snapshot payload");
        }

        const std::uint32_t magic = readU32(src, 0);
        if (magic != snapshotMagicEwc1) {
            throw std::runtime_error("Snapshot magic mismatch");
        }
        const std::uint32_t version = readU32(src, 4);
        if (version != 2 && version != 3) {
            throw std::runtime_error("Unsupported snapshot version");
        }

        const std::uint32_t rectCount = readU32(src, 8);
        const std::uint32_t lineCount = readU32(src, 12);
        const std::uint32_t polyCount = readU32(src, 16);
        const std::uint32_t pointCount = readU32(src, 20);

        std::uint32_t symbolCount = 0;
        std::uint32_t nodeCount = 0;
        std::uint32_t conduitCount = 0;
        std::size_t headerBytes = snapshotHeaderBytesV2;
        if (version == 3) {
            if (byteCount < snapshotHeaderBytesV3) throw std::runtime_error("Snapshot truncated (v3 header)");
            symbolCount = readU32(src, 24);
            nodeCount = readU32(src, 28);
            conduitCount = readU32(src, 32);
            headerBytes = snapshotHeaderBytesV3;
        }

        const std::size_t expected =
            headerBytes +
            static_cast<std::size_t>(rectCount) * rectRecordBytes +
            static_cast<std::size_t>(lineCount) * lineRecordBytes +
            static_cast<std::size_t>(polyCount) * polyRecordBytes +
            static_cast<std::size_t>(pointCount) * pointRecordBytes +
            static_cast<std::size_t>(symbolCount) * symbolRecordBytes +
            static_cast<std::size_t>(nodeCount) * nodeRecordBytes +
            static_cast<std::size_t>(conduitCount) * conduitRecordBytes;

        if (expected > byteCount) {
            throw std::runtime_error("Snapshot truncated");
        }

        clear();
        reserveWorld(rectCount, lineCount, polyCount, pointCount);
        symbols.reserve(symbolCount);
        nodes.reserve(nodeCount);
        conduits.reserve(conduitCount);

        // Keep an owned copy for export/debug (not used in hot path).
        snapshotBytes.assign(src, src + expected);

        std::size_t o = headerBytes;

        rects.resize(rectCount);
        for (std::uint32_t i = 0; i < rectCount; i++) {
            rects[i].id = readU32(src, o); o += 4;
            rects[i].x = readF32(src, o); o += 4;
            rects[i].y = readF32(src, o); o += 4;
            rects[i].w = readF32(src, o); o += 4;
            rects[i].h = readF32(src, o); o += 4;
            entities[rects[i].id] = EntityRef{EntityKind::Rect, i};
        }

        lines.resize(lineCount);
        for (std::uint32_t i = 0; i < lineCount; i++) {
            lines[i].id = readU32(src, o); o += 4;
            lines[i].x0 = readF32(src, o); o += 4;
            lines[i].y0 = readF32(src, o); o += 4;
            lines[i].x1 = readF32(src, o); o += 4;
            lines[i].y1 = readF32(src, o); o += 4;
            entities[lines[i].id] = EntityRef{EntityKind::Line, i};
        }

        polylines.resize(polyCount);
        for (std::uint32_t i = 0; i < polyCount; i++) {
            polylines[i].id = readU32(src, o); o += 4;
            polylines[i].offset = readU32(src, o); o += 4;
            polylines[i].count = readU32(src, o); o += 4;
            entities[polylines[i].id] = EntityRef{EntityKind::Polyline, i};
        }

        points.resize(pointCount);
        for (std::uint32_t i = 0; i < pointCount; i++) {
            points[i].x = readF32(src, o); o += 4;
            points[i].y = readF32(src, o); o += 4;
        }

        if (version == 3) {
            symbols.resize(symbolCount);
            for (std::uint32_t i = 0; i < symbolCount; i++) {
                symbols[i].id = readU32(src, o); o += 4;
                symbols[i].symbolKey = readU32(src, o); o += 4;
                symbols[i].x = readF32(src, o); o += 4;
                symbols[i].y = readF32(src, o); o += 4;
                symbols[i].w = readF32(src, o); o += 4;
                symbols[i].h = readF32(src, o); o += 4;
                symbols[i].rotation = readF32(src, o); o += 4;
                symbols[i].scaleX = readF32(src, o); o += 4;
                symbols[i].scaleY = readF32(src, o); o += 4;
                symbols[i].connX = readF32(src, o); o += 4;
                symbols[i].connY = readF32(src, o); o += 4;
                entities[symbols[i].id] = EntityRef{EntityKind::Symbol, i};
            }

            nodes.resize(nodeCount);
            for (std::uint32_t i = 0; i < nodeCount; i++) {
                nodes[i].id = readU32(src, o); o += 4;
                const std::uint32_t kindU32 = readU32(src, o); o += 4;
                nodes[i].kind = kindU32 == 1 ? NodeKind::Anchored : NodeKind::Free;
                nodes[i].anchorSymbolId = readU32(src, o); o += 4;
                nodes[i].x = readF32(src, o); o += 4;
                nodes[i].y = readF32(src, o); o += 4;
                entities[nodes[i].id] = EntityRef{EntityKind::Node, i};
            }

            conduits.resize(conduitCount);
            for (std::uint32_t i = 0; i < conduitCount; i++) {
                conduits[i].id = readU32(src, o); o += 4;
                conduits[i].fromNodeId = readU32(src, o); o += 4;
                conduits[i].toNodeId = readU32(src, o); o += 4;
                entities[conduits[i].id] = EntityRef{EntityKind::Conduit, i};
            }
        }

        const double t1 = emscripten_get_now();
        rebuildRenderBuffers();
        const double t2 = emscripten_get_now();

        lastLoadMs = static_cast<float>(t1 - t0);
        lastRebuildMs = static_cast<float>(t2 - t1);
        lastApplyMs = 0.0f;
        generation++;
    }

    // Apply a batch of edit commands from a binary command buffer in WASM memory.
    // This is the Phase 1 "no chatty interop" bridge: JS writes N commands + payloads, then calls once.
    void applyCommandBuffer(std::uintptr_t ptr, std::uint32_t byteCount) {
        const double t0 = emscripten_get_now();

        const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
        if (!src || byteCount < commandHeaderBytes) {
            throw std::runtime_error("Invalid command buffer payload");
        }

        const std::uint32_t magic = readU32(src, 0);
        if (magic != commandMagicEwdc) {
            throw std::runtime_error("Command buffer magic mismatch");
        }
        const std::uint32_t version = readU32(src, 4);
        if (version != 1) {
            throw std::runtime_error("Unsupported command buffer version");
        }
        const std::uint32_t commandCount = readU32(src, 8);

        std::size_t o = commandHeaderBytes;
        for (std::uint32_t i = 0; i < commandCount; i++) {
            if (o + perCommandHeaderBytes > byteCount) {
                throw std::runtime_error("Command buffer truncated (header)");
            }
            const std::uint32_t op = readU32(src, o); o += 4;
            const std::uint32_t id = readU32(src, o); o += 4;
            const std::uint32_t payloadByteCount = readU32(src, o); o += 4;
            o += 4; // reserved

            if (o + payloadByteCount > byteCount) {
                throw std::runtime_error("Command buffer truncated (payload)");
            }

            switch (op) {
                case static_cast<std::uint32_t>(CommandOp::ClearAll): {
                    clearWorld();
                    break;
                }
                case static_cast<std::uint32_t>(CommandOp::DeleteEntity): {
                    deleteEntity(id);
                    break;
                }
                case static_cast<std::uint32_t>(CommandOp::UpsertRect): {
                    if (payloadByteCount != 16) throw std::runtime_error("Invalid rect payload size");
                    const float x = readF32(src, o + 0);
                    const float y = readF32(src, o + 4);
                    const float w = readF32(src, o + 8);
                    const float h = readF32(src, o + 12);
                    upsertRect(id, x, y, w, h);
                    break;
                }
                case static_cast<std::uint32_t>(CommandOp::UpsertLine): {
                    if (payloadByteCount != 16) throw std::runtime_error("Invalid line payload size");
                    const float x0 = readF32(src, o + 0);
                    const float y0 = readF32(src, o + 4);
                    const float x1 = readF32(src, o + 8);
                    const float y1 = readF32(src, o + 12);
                    upsertLine(id, x0, y0, x1, y1);
                    break;
                }
                case static_cast<std::uint32_t>(CommandOp::UpsertPolyline): {
                    if (payloadByteCount < 4) throw std::runtime_error("Invalid polyline payload size");
                    const std::uint32_t count = readU32(src, o);
                    const std::size_t expected = 4 + static_cast<std::size_t>(count) * 8;
                    if (expected != payloadByteCount) throw std::runtime_error("Invalid polyline payload length");
                    if (count < 2) {
                        // Treat degenerate polyline as deletion.
                        deleteEntity(id);
                        break;
                    }

                    const std::uint32_t offset = static_cast<std::uint32_t>(points.size());
                    points.reserve(points.size() + count);
                    std::size_t p = o + 4;
                    for (std::uint32_t j = 0; j < count; j++) {
                        const float x = readF32(src, p); p += 4;
                        const float y = readF32(src, p); p += 4;
                        points.push_back(Point2{x, y});
                    }
                    upsertPolyline(id, offset, count);
                    break;
                }
                case static_cast<std::uint32_t>(CommandOp::UpsertSymbol): {
                    if (payloadByteCount != 40) throw std::runtime_error("Invalid symbol payload size");
                    const std::uint32_t symbolKey = readU32(src, o + 0);
                    const float x = readF32(src, o + 4);
                    const float y = readF32(src, o + 8);
                    const float w = readF32(src, o + 12);
                    const float h = readF32(src, o + 16);
                    const float rot = readF32(src, o + 20);
                    const float sx = readF32(src, o + 24);
                    const float sy = readF32(src, o + 28);
                    const float connX = readF32(src, o + 32);
                    const float connY = readF32(src, o + 36);
                    upsertSymbol(id, symbolKey, x, y, w, h, rot, sx, sy, connX, connY);
                    break;
                }
                case static_cast<std::uint32_t>(CommandOp::UpsertNode): {
                    if (payloadByteCount != 16) throw std::runtime_error("Invalid node payload size");
                    const std::uint32_t kindU32 = readU32(src, o + 0);
                    const std::uint32_t anchorId = readU32(src, o + 4);
                    const float x = readF32(src, o + 8);
                    const float y = readF32(src, o + 12);
                    const NodeKind kind = kindU32 == 1 ? NodeKind::Anchored : NodeKind::Free;
                    upsertNode(id, kind, anchorId, x, y);
                    break;
                }
                case static_cast<std::uint32_t>(CommandOp::UpsertConduit): {
                    if (payloadByteCount != 8) throw std::runtime_error("Invalid conduit payload size");
                    const std::uint32_t fromNodeId = readU32(src, o + 0);
                    const std::uint32_t toNodeId = readU32(src, o + 4);
                    upsertConduit(id, fromNodeId, toNodeId);
                    break;
                }
                default:
                    throw std::runtime_error("Unknown command op");
            }

            o += payloadByteCount;
        }

        compactPolylinePoints();
        rebuildRenderBuffers();
        rebuildSnapshotBytes();
        generation++;

        const double t1 = emscripten_get_now();
        lastApplyMs = static_cast<float>(t1 - t0);
        lastLoadMs = 0.0f;
        lastRebuildMs = 0.0f; // rebuild cost is accounted into lastApplyMs for this path (Phase 1)
    }

    std::uint32_t getVertexCount() const noexcept {
        // vertex count (not float count) for triangle buffer
        return static_cast<std::uint32_t>(triangleVertices.size() / 3);
    }

    std::uintptr_t getVertexDataPtr() const noexcept {
        return reinterpret_cast<std::uintptr_t>(triangleVertices.data());
    }

    struct BufferMeta {
        std::uint32_t generation;
        std::uint32_t vertexCount;
        std::uint32_t capacity;   // in vertices
        std::uint32_t floatCount; // convenience for view length
        std::uintptr_t ptr;       // byte offset in WASM linear memory
    };

    BufferMeta getPositionBufferMeta() const noexcept {
        return buildMeta(triangleVertices);
    }

    BufferMeta getLineBufferMeta() const noexcept {
        return buildMeta(lineVertices);
    }

    struct ByteBufferMeta {
        std::uint32_t generation;
        std::uint32_t byteCount;
        std::uintptr_t ptr;
    };

    ByteBufferMeta getSnapshotBufferMeta() const noexcept {
        return ByteBufferMeta{generation, static_cast<std::uint32_t>(snapshotBytes.size()), reinterpret_cast<std::uintptr_t>(snapshotBytes.data())};
    }

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

    EngineStats getStats() const noexcept {
        return EngineStats{
            generation,
            static_cast<std::uint32_t>(rects.size()),
            static_cast<std::uint32_t>(lines.size()),
            static_cast<std::uint32_t>(polylines.size()),
            static_cast<std::uint32_t>(symbols.size()),
            static_cast<std::uint32_t>(nodes.size()),
            static_cast<std::uint32_t>(conduits.size()),
            static_cast<std::uint32_t>(points.size()),
            static_cast<std::uint32_t>(triangleVertices.size() / 3),
            static_cast<std::uint32_t>(lineVertices.size() / 3),
            lastLoadMs,
            lastRebuildMs,
            lastApplyMs
        };
    }

    struct SnapResult {
        std::uint32_t kind; // 0 none, 1 node, 2 symbol-connection
        std::uint32_t id;   // node id or symbol id
        float x;
        float y;
    };

    SnapResult snapElectrical(float x, float y, float tolerance) const noexcept {
        const float tol2 = tolerance * tolerance;
        float bestD2 = tol2 + 1.0f;
        SnapResult best{0u, 0u, 0.0f, 0.0f};

        const Point2 q{x, y};

        // Prefer snapping to nodes (explicit topology) over raw symbol connection points.
        for (const auto& n : nodes) {
            Point2 p;
            if (!resolveNodePosition(n.id, p)) continue;
            const float dx = p.x - q.x;
            const float dy = p.y - q.y;
            const float d2 = dx * dx + dy * dy;
            if (d2 <= tol2 && d2 < bestD2) {
                bestD2 = d2;
                best = SnapResult{1u, n.id, p.x, p.y};
            }
        }

        for (const auto& s : symbols) {
            // If a symbol already has an anchored node, the loop above will win (same point).
            Point2 p;
            // Resolve symbol connection point directly to avoid requiring a node record.
            const float cx = s.x + s.w * 0.5f;
            const float cy = s.y + s.h * 0.5f;
            float px = (s.connX - 0.5f) * s.w;
            float py = (s.connY - 0.5f) * s.h;
            px *= s.scaleX;
            py *= s.scaleY;
            const float c = std::cos(s.rotation);
            const float si = std::sin(s.rotation);
            const float rx = px * c - py * si;
            const float ry = px * si + py * c;
            p.x = cx + rx;
            p.y = cy + ry;

            const float dx = p.x - q.x;
            const float dy = p.y - q.y;
            const float d2 = dx * dx + dy * dy;
            if (d2 <= tol2 && d2 < bestD2) {
                bestD2 = d2;
                best = SnapResult{2u, s.id, p.x, p.y};
            }
        }

        return best;
    }

private:
    static constexpr std::size_t defaultCapacityFloats = 50000;   // ~16.6k vertices
    static constexpr std::size_t defaultLineCapacityFloats = 20000; // ~6.6k line vertices
    static constexpr std::size_t defaultSnapshotCapacityBytes = 1 * 1024 * 1024;

    static constexpr std::uint32_t snapshotMagicEwc1 = 0x31435745; // "EWC1"
    static constexpr std::uint32_t commandMagicEwdc = 0x43445745; // "EWDC"
    static constexpr std::size_t snapshotHeaderBytesV2 = 8 * 4;
    static constexpr std::size_t snapshotHeaderBytesV3 = 11 * 4;
    static constexpr std::size_t commandHeaderBytes = 4 * 4;
    static constexpr std::size_t perCommandHeaderBytes = 4 * 4;
    static constexpr std::size_t rectRecordBytes = 20;
    static constexpr std::size_t lineRecordBytes = 20;
    static constexpr std::size_t polyRecordBytes = 12;
    static constexpr std::size_t pointRecordBytes = 8;
    static constexpr std::size_t symbolRecordBytes = 44;
    static constexpr std::size_t nodeRecordBytes = 20;
    static constexpr std::size_t conduitRecordBytes = 12;

    static constexpr std::size_t rectTriangleFloats = 6 * 3;
    static constexpr std::size_t rectOutlineFloats = 8 * 3; // 4 segments, 2 vertices each
    static constexpr std::size_t lineSegmentFloats = 2 * 3;

    struct RectRec { std::uint32_t id; float x; float y; float w; float h; };
    struct LineRec { std::uint32_t id; float x0; float y0; float x1; float y1; };
    struct PolyRec { std::uint32_t id; std::uint32_t offset; std::uint32_t count; };
    struct Point2 { float x; float y; };

    struct SymbolRec {
        std::uint32_t id;
        std::uint32_t symbolKey;
        float x;
        float y;
        float w;
        float h;
        float rotation;
        float scaleX;
        float scaleY;
        float connX;
        float connY;
    };

    enum class NodeKind : std::uint32_t { Free = 0, Anchored = 1 };
    struct NodeRec {
        std::uint32_t id;
        NodeKind kind;
        std::uint32_t anchorSymbolId; // 0 when not anchored
        float x;
        float y;
    };

    struct ConduitRec {
        std::uint32_t id;
        std::uint32_t fromNodeId;
        std::uint32_t toNodeId;
    };

    enum class EntityKind : std::uint8_t { Rect = 1, Line = 2, Polyline = 3, Symbol = 4, Node = 5, Conduit = 6 };
    struct EntityRef { EntityKind kind; std::uint32_t index; };

    enum class CommandOp : std::uint32_t {
        ClearAll = 1,
        UpsertRect = 2,
        UpsertLine = 3,
        UpsertPolyline = 4,
        DeleteEntity = 5,
        UpsertSymbol = 6,
        UpsertNode = 7,
        UpsertConduit = 8,
    };

    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
    std::vector<SymbolRec> symbols;
    std::vector<NodeRec> nodes;
    std::vector<ConduitRec> conduits;
    std::unordered_map<std::uint32_t, EntityRef> entities;

    std::vector<float> triangleVertices;
    std::vector<float> lineVertices;
    std::vector<std::uint8_t> snapshotBytes;
    std::uint32_t generation{0};
    float lastLoadMs{0.0f};
    float lastRebuildMs{0.0f};
    float lastApplyMs{0.0f};

    static std::uint32_t readU32(const std::uint8_t* src, std::size_t offset) noexcept {
        std::uint32_t v;
        std::memcpy(&v, src + offset, sizeof(v));
        return v;
    }

    static float readF32(const std::uint8_t* src, std::size_t offset) noexcept {
        float v;
        std::memcpy(&v, src + offset, sizeof(v));
        return v;
    }

    static void writeU32LE(std::uint8_t* dst, std::size_t offset, std::uint32_t v) noexcept {
        std::memcpy(dst + offset, &v, sizeof(v));
    }

    static void writeF32LE(std::uint8_t* dst, std::size_t offset, float v) noexcept {
        std::memcpy(dst + offset, &v, sizeof(v));
    }

    void clearWorld() noexcept {
        rects.clear();
        lines.clear();
        polylines.clear();
        points.clear();
        symbols.clear();
        nodes.clear();
        conduits.clear();
        entities.clear();
        triangleVertices.clear();
        lineVertices.clear();
        snapshotBytes.clear();
        lastLoadMs = 0.0f;
        lastRebuildMs = 0.0f;
        lastApplyMs = 0.0f;
    }

    void deleteEntity(std::uint32_t id) noexcept {
        const auto it = entities.find(id);
        if (it == entities.end()) return;
        const EntityRef ref = it->second;
        entities.erase(it);

        if (ref.kind == EntityKind::Rect) {
            const std::uint32_t idx = ref.index;
            const std::uint32_t lastIdx = static_cast<std::uint32_t>(rects.size() - 1);
            if (idx != lastIdx) {
                rects[idx] = rects[lastIdx];
                entities[rects[idx].id] = EntityRef{EntityKind::Rect, idx};
            }
            rects.pop_back();
            return;
        }

        if (ref.kind == EntityKind::Line) {
            const std::uint32_t idx = ref.index;
            const std::uint32_t lastIdx = static_cast<std::uint32_t>(lines.size() - 1);
            if (idx != lastIdx) {
                lines[idx] = lines[lastIdx];
                entities[lines[idx].id] = EntityRef{EntityKind::Line, idx};
            }
            lines.pop_back();
            return;
        }

        if (ref.kind == EntityKind::Polyline) {
            const std::uint32_t idx = ref.index;
            const std::uint32_t lastIdx = static_cast<std::uint32_t>(polylines.size() - 1);
            if (idx != lastIdx) {
                polylines[idx] = polylines[lastIdx];
                entities[polylines[idx].id] = EntityRef{EntityKind::Polyline, idx};
            }
            polylines.pop_back();
            return;
        }

        if (ref.kind == EntityKind::Symbol) {
            const std::uint32_t idx = ref.index;
            const std::uint32_t lastIdx = static_cast<std::uint32_t>(symbols.size() - 1);
            if (idx != lastIdx) {
                symbols[idx] = symbols[lastIdx];
                entities[symbols[idx].id] = EntityRef{EntityKind::Symbol, idx};
            }
            symbols.pop_back();
            return;
        }

        if (ref.kind == EntityKind::Node) {
            const std::uint32_t idx = ref.index;
            const std::uint32_t lastIdx = static_cast<std::uint32_t>(nodes.size() - 1);
            if (idx != lastIdx) {
                nodes[idx] = nodes[lastIdx];
                entities[nodes[idx].id] = EntityRef{EntityKind::Node, idx};
            }
            nodes.pop_back();
            return;
        }

        const std::uint32_t idx = ref.index;
        const std::uint32_t lastIdx = static_cast<std::uint32_t>(conduits.size() - 1);
        if (idx != lastIdx) {
            conduits[idx] = conduits[lastIdx];
            entities[conduits[idx].id] = EntityRef{EntityKind::Conduit, idx};
        }
        conduits.pop_back();
    }

    void upsertRect(std::uint32_t id, float x, float y, float w, float h) {
        const auto it = entities.find(id);
        if (it != entities.end() && it->second.kind != EntityKind::Rect) {
            deleteEntity(id);
        }

        const auto it2 = entities.find(id);
        if (it2 != entities.end()) {
            auto& r = rects[it2->second.index];
            r.x = x; r.y = y; r.w = w; r.h = h;
            return;
        }

        rects.push_back(RectRec{id, x, y, w, h});
        entities[id] = EntityRef{EntityKind::Rect, static_cast<std::uint32_t>(rects.size() - 1)};
    }

    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
        const auto it = entities.find(id);
        if (it != entities.end() && it->second.kind != EntityKind::Line) {
            deleteEntity(id);
        }

        const auto it2 = entities.find(id);
        if (it2 != entities.end()) {
            auto& l = lines[it2->second.index];
            l.x0 = x0; l.y0 = y0; l.x1 = x1; l.y1 = y1;
            return;
        }

        lines.push_back(LineRec{id, x0, y0, x1, y1});
        entities[id] = EntityRef{EntityKind::Line, static_cast<std::uint32_t>(lines.size() - 1)};
    }

    void upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
        const auto it = entities.find(id);
        if (it != entities.end() && it->second.kind != EntityKind::Polyline) {
            deleteEntity(id);
        }

        const auto it2 = entities.find(id);
        if (it2 != entities.end()) {
            auto& pl = polylines[it2->second.index];
            pl.offset = offset;
            pl.count = count;
            return;
        }

        polylines.push_back(PolyRec{id, offset, count});
        entities[id] = EntityRef{EntityKind::Polyline, static_cast<std::uint32_t>(polylines.size() - 1)};
    }

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
    ) {
        const auto it = entities.find(id);
        if (it != entities.end() && it->second.kind != EntityKind::Symbol) {
            deleteEntity(id);
        }

        const auto it2 = entities.find(id);
        if (it2 != entities.end()) {
            auto& s = symbols[it2->second.index];
            s.symbolKey = symbolKey;
            s.x = x; s.y = y; s.w = w; s.h = h;
            s.rotation = rotation;
            s.scaleX = scaleX;
            s.scaleY = scaleY;
            s.connX = connX;
            s.connY = connY;
            return;
        }

        symbols.push_back(SymbolRec{id, symbolKey, x, y, w, h, rotation, scaleX, scaleY, connX, connY});
        entities[id] = EntityRef{EntityKind::Symbol, static_cast<std::uint32_t>(symbols.size() - 1)};
    }

    void upsertNode(std::uint32_t id, NodeKind kind, std::uint32_t anchorSymbolId, float x, float y) {
        const auto it = entities.find(id);
        if (it != entities.end() && it->second.kind != EntityKind::Node) {
            deleteEntity(id);
        }

        const auto it2 = entities.find(id);
        if (it2 != entities.end()) {
            auto& n = nodes[it2->second.index];
            n.kind = kind;
            n.anchorSymbolId = anchorSymbolId;
            n.x = x;
            n.y = y;
            return;
        }

        nodes.push_back(NodeRec{id, kind, anchorSymbolId, x, y});
        entities[id] = EntityRef{EntityKind::Node, static_cast<std::uint32_t>(nodes.size() - 1)};
    }

    void upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId) {
        const auto it = entities.find(id);
        if (it != entities.end() && it->second.kind != EntityKind::Conduit) {
            deleteEntity(id);
        }

        const auto it2 = entities.find(id);
        if (it2 != entities.end()) {
            auto& c = conduits[it2->second.index];
            c.fromNodeId = fromNodeId;
            c.toNodeId = toNodeId;
            return;
        }

        conduits.push_back(ConduitRec{id, fromNodeId, toNodeId});
        entities[id] = EntityRef{EntityKind::Conduit, static_cast<std::uint32_t>(conduits.size() - 1)};
    }

    const SymbolRec* findSymbol(std::uint32_t id) const noexcept {
        const auto it = entities.find(id);
        if (it == entities.end()) return nullptr;
        if (it->second.kind != EntityKind::Symbol) return nullptr;
        return &symbols[it->second.index];
    }

    const NodeRec* findNode(std::uint32_t id) const noexcept {
        const auto it = entities.find(id);
        if (it == entities.end()) return nullptr;
        if (it->second.kind != EntityKind::Node) return nullptr;
        return &nodes[it->second.index];
    }

    bool resolveNodePosition(std::uint32_t nodeId, Point2& out) const noexcept {
        const NodeRec* n = findNode(nodeId);
        if (!n) return false;
        if (n->kind == NodeKind::Free) {
            out.x = n->x;
            out.y = n->y;
            return true;
        }

        // Anchored nodes prefer resolving from their symbol (follows device transforms),
        // but must always have a stable fallback position (e.g. device deleted).
        if (n->anchorSymbolId == 0) {
            out.x = n->x;
            out.y = n->y;
            return true;
        }
        const SymbolRec* s = findSymbol(n->anchorSymbolId);
        if (!s) {
            out.x = n->x;
            out.y = n->y;
            return true;
        }

        const float cx = s->x + s->w * 0.5f;
        const float cy = s->y + s->h * 0.5f;
        float px = (s->connX - 0.5f) * s->w;
        float py = (s->connY - 0.5f) * s->h;

        px *= s->scaleX;
        py *= s->scaleY;

        const float c = std::cos(s->rotation);
        const float si = std::sin(s->rotation);
        const float rx = px * c - py * si;
        const float ry = px * si + py * c;
        out.x = cx + rx;
        out.y = cy + ry;
        return true;
    }

    void compactPolylinePoints() {
        std::size_t total = 0;
        for (const auto& pl : polylines) total += pl.count;
        std::vector<Point2> next;
        next.reserve(total);

        for (auto& pl : polylines) {
            const std::uint32_t start = pl.offset;
            const std::uint32_t end = pl.offset + pl.count;
            if (end > points.size()) {
                pl.offset = static_cast<std::uint32_t>(next.size());
                pl.count = 0;
                continue;
            }
            pl.offset = static_cast<std::uint32_t>(next.size());
            for (std::uint32_t i = start; i < end; i++) next.push_back(points[i]);
        }

        points.swap(next);
    }

    void rebuildSnapshotBytes() {
        // Snapshot V3: extends V2 with electrical entities (symbols/nodes/conduits).
        const std::uint32_t version = 3;

        const std::size_t totalBytes =
            snapshotHeaderBytesV3 +
            rects.size() * rectRecordBytes +
            lines.size() * lineRecordBytes +
            polylines.size() * polyRecordBytes +
            points.size() * pointRecordBytes +
            symbols.size() * symbolRecordBytes +
            nodes.size() * nodeRecordBytes +
            conduits.size() * conduitRecordBytes;

        snapshotBytes.resize(totalBytes);
        std::uint8_t* dst = snapshotBytes.data();
        std::size_t o = 0;

        writeU32LE(dst, o, snapshotMagicEwc1); o += 4;
        writeU32LE(dst, o, version); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(rects.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(lines.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(polylines.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(points.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(symbols.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(nodes.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(conduits.size())); o += 4;
        writeU32LE(dst, o, 0); o += 4;
        writeU32LE(dst, o, 0); o += 4;

        for (const auto& r : rects) {
            writeU32LE(dst, o, r.id); o += 4;
            writeF32LE(dst, o, r.x); o += 4;
            writeF32LE(dst, o, r.y); o += 4;
            writeF32LE(dst, o, r.w); o += 4;
            writeF32LE(dst, o, r.h); o += 4;
        }

        for (const auto& l : lines) {
            writeU32LE(dst, o, l.id); o += 4;
            writeF32LE(dst, o, l.x0); o += 4;
            writeF32LE(dst, o, l.y0); o += 4;
            writeF32LE(dst, o, l.x1); o += 4;
            writeF32LE(dst, o, l.y1); o += 4;
        }

        for (const auto& pl : polylines) {
            writeU32LE(dst, o, pl.id); o += 4;
            writeU32LE(dst, o, pl.offset); o += 4;
            writeU32LE(dst, o, pl.count); o += 4;
        }

        for (const auto& p : points) {
            writeF32LE(dst, o, p.x); o += 4;
            writeF32LE(dst, o, p.y); o += 4;
        }

        for (const auto& s : symbols) {
            writeU32LE(dst, o, s.id); o += 4;
            writeU32LE(dst, o, s.symbolKey); o += 4;
            writeF32LE(dst, o, s.x); o += 4;
            writeF32LE(dst, o, s.y); o += 4;
            writeF32LE(dst, o, s.w); o += 4;
            writeF32LE(dst, o, s.h); o += 4;
            writeF32LE(dst, o, s.rotation); o += 4;
            writeF32LE(dst, o, s.scaleX); o += 4;
            writeF32LE(dst, o, s.scaleY); o += 4;
            writeF32LE(dst, o, s.connX); o += 4;
            writeF32LE(dst, o, s.connY); o += 4;
        }

        for (const auto& n : nodes) {
            writeU32LE(dst, o, n.id); o += 4;
            writeU32LE(dst, o, n.kind == NodeKind::Anchored ? 1u : 0u); o += 4;
            writeU32LE(dst, o, n.anchorSymbolId); o += 4;
            writeF32LE(dst, o, n.x); o += 4;
            writeF32LE(dst, o, n.y); o += 4;
        }

        for (const auto& c : conduits) {
            writeU32LE(dst, o, c.id); o += 4;
            writeU32LE(dst, o, c.fromNodeId); o += 4;
            writeU32LE(dst, o, c.toNodeId); o += 4;
        }
    }

    BufferMeta buildMeta(const std::vector<float>& buffer) const noexcept {
        const std::uint32_t vertexCount = static_cast<std::uint32_t>(buffer.size() / 3);
        const std::uint32_t capacityVertices = static_cast<std::uint32_t>(buffer.capacity() / 3);
        const std::uint32_t floatCount = static_cast<std::uint32_t>(buffer.size());
        return BufferMeta{generation, vertexCount, capacityVertices, floatCount, reinterpret_cast<std::uintptr_t>(buffer.data())};
    }

    void pushVertex(float x, float y, float z, std::vector<float>& target) {
        target.push_back(x);
        target.push_back(y);
        target.push_back(z);
    }

    void addRect(float x, float y, float w, float h) {
        const float x0 = x;
        const float y0 = y;
        const float x1 = x + w;
        const float y1 = y + h;
        constexpr float z = 0.0f;

        // Triangle 1: (x0,y0) (x1,y0) (x1,y1)
        pushVertex(x0, y0, z, triangleVertices);
        pushVertex(x1, y0, z, triangleVertices);
        pushVertex(x1, y1, z, triangleVertices);

        // Triangle 2: (x0,y0) (x1,y1) (x0,y1)
        pushVertex(x0, y0, z, triangleVertices);
        pushVertex(x1, y1, z, triangleVertices);
        pushVertex(x0, y1, z, triangleVertices);
    }

    void addRectOutline(float x, float y, float w, float h) {
        const float x0 = x;
        const float y0 = y;
        const float x1 = x + w;
        const float y1 = y + h;
        constexpr float z = 0.0f;
        addLineSegment(x0, y0, x1, y0, z);
        addLineSegment(x1, y0, x1, y1, z);
        addLineSegment(x1, y1, x0, y1, z);
        addLineSegment(x0, y1, x0, y0, z);
    }

    void addLineSegment(float x0, float y0, float x1, float y1, float z = 0.0f) {
        pushVertex(x0, y0, z, lineVertices);
        pushVertex(x1, y1, z, lineVertices);
    }

    void rebuildRenderBuffers() {
        triangleVertices.clear();
        lineVertices.clear();

        // Reserve to avoid growth during rebuild.
        triangleVertices.reserve(rects.size() * rectTriangleFloats);

        std::size_t lineFloatBudget =
            rects.size() * rectOutlineFloats +
            lines.size() * lineSegmentFloats +
            conduits.size() * lineSegmentFloats;
        for (const auto& pl : polylines) {
            if (pl.count >= 2) lineFloatBudget += static_cast<std::size_t>(pl.count - 1) * lineSegmentFloats;
        }
        lineVertices.reserve(lineFloatBudget);

        for (const auto& r : rects) {
            addRect(r.x, r.y, r.w, r.h);
            addRectOutline(r.x, r.y, r.w, r.h);
        }

        for (const auto& l : lines) {
            addLineSegment(l.x0, l.y0, l.x1, l.y1);
        }

        for (const auto& pl : polylines) {
            if (pl.count < 2) continue;
            const std::uint32_t start = pl.offset;
            const std::uint32_t end = pl.offset + pl.count;
            if (end > points.size()) continue;
            for (std::uint32_t i = start; i + 1 < end; i++) {
                const auto& p0 = points[i];
                const auto& p1 = points[i + 1];
                addLineSegment(p0.x, p0.y, p1.x, p1.y);
            }
        }

        for (const auto& c : conduits) {
            Point2 a;
            Point2 b;
            if (!resolveNodePosition(c.fromNodeId, a)) continue;
            if (!resolveNodePosition(c.toNodeId, b)) continue;
            addLineSegment(a.x, a.y, b.x, b.y);
        }
    }
};

EMSCRIPTEN_BINDINGS(cad_engine_module) {
    emscripten::class_<CadEngine>("CadEngine")
        .constructor<>()
        .function("clear", &CadEngine::clear)
        .function("allocBytes", &CadEngine::allocBytes)
        .function("freeBytes", &CadEngine::freeBytes)
        .function("applyCommandBuffer", &CadEngine::applyCommandBuffer)
        .function("reserveWorld", &CadEngine::reserveWorld)
        .function("loadSnapshotFromPtr", &CadEngine::loadSnapshotFromPtr)
        .function("getVertexCount", &CadEngine::getVertexCount)
        .function("getVertexDataPtr", &CadEngine::getVertexDataPtr)
        .function("getPositionBufferMeta", &CadEngine::getPositionBufferMeta)
        .function("getLineBufferMeta", &CadEngine::getLineBufferMeta)
        .function("getSnapshotBufferMeta", &CadEngine::getSnapshotBufferMeta)
        .function("snapElectrical", &CadEngine::snapElectrical)
        .function("getStats", &CadEngine::getStats);

    emscripten::value_object<CadEngine::BufferMeta>("BufferMeta")
        .field("generation", &CadEngine::BufferMeta::generation)
        .field("vertexCount", &CadEngine::BufferMeta::vertexCount)
        .field("capacity", &CadEngine::BufferMeta::capacity)
        .field("floatCount", &CadEngine::BufferMeta::floatCount)
        .field("ptr", &CadEngine::BufferMeta::ptr);

    emscripten::value_object<CadEngine::ByteBufferMeta>("ByteBufferMeta")
        .field("generation", &CadEngine::ByteBufferMeta::generation)
        .field("byteCount", &CadEngine::ByteBufferMeta::byteCount)
        .field("ptr", &CadEngine::ByteBufferMeta::ptr);

    emscripten::value_object<CadEngine::EngineStats>("EngineStats")
        .field("generation", &CadEngine::EngineStats::generation)
        .field("rectCount", &CadEngine::EngineStats::rectCount)
        .field("lineCount", &CadEngine::EngineStats::lineCount)
        .field("polylineCount", &CadEngine::EngineStats::polylineCount)
        .field("symbolCount", &CadEngine::EngineStats::symbolCount)
        .field("nodeCount", &CadEngine::EngineStats::nodeCount)
        .field("conduitCount", &CadEngine::EngineStats::conduitCount)
        .field("pointCount", &CadEngine::EngineStats::pointCount)
        .field("triangleVertexCount", &CadEngine::EngineStats::triangleVertexCount)
        .field("lineVertexCount", &CadEngine::EngineStats::lineVertexCount)
        .field("lastLoadMs", &CadEngine::EngineStats::lastLoadMs)
        .field("lastRebuildMs", &CadEngine::EngineStats::lastRebuildMs)
        .field("lastApplyMs", &CadEngine::EngineStats::lastApplyMs);

    emscripten::value_object<CadEngine::SnapResult>("SnapResult")
        .field("kind", &CadEngine::SnapResult::kind)
        .field("id", &CadEngine::SnapResult::id)
        .field("x", &CadEngine::SnapResult::x)
        .field("y", &CadEngine::SnapResult::y);
}
