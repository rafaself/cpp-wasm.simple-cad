
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#include <cstdint>
#include <cstdlib>
#include <cstring>
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

    int add(int a, int b) const noexcept { return a + b; }

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
        if (!src || byteCount < snapshotHeaderBytes) {
            throw std::runtime_error("Invalid snapshot payload");
        }

        const std::uint32_t magic = readU32(src, 0);
        if (magic != snapshotMagicEwc1) {
            throw std::runtime_error("Snapshot magic mismatch");
        }
        const std::uint32_t version = readU32(src, 4);
        if (version != 1 && version != 2) {
            throw std::runtime_error("Unsupported snapshot version");
        }

        const std::uint32_t rectCount = readU32(src, 8);
        const std::uint32_t lineCount = readU32(src, 12);
        const std::uint32_t polyCount = readU32(src, 16);
        const std::uint32_t pointCount = readU32(src, 20);

        const std::size_t expected =
            snapshotHeaderBytes +
            static_cast<std::size_t>(rectCount) * rectRecordBytes +
            static_cast<std::size_t>(lineCount) * lineRecordBytes +
            static_cast<std::size_t>(polyCount) * polyRecordBytes +
            static_cast<std::size_t>(pointCount) * pointRecordBytes;

        if (expected > byteCount) {
            throw std::runtime_error("Snapshot truncated");
        }

        clear();
        reserveWorld(rectCount, lineCount, polyCount, pointCount);

        // Keep an owned copy for export/debug (not used in hot path).
        snapshotBytes.assign(src, src + expected);

        std::size_t o = snapshotHeaderBytes;

        rects.resize(rectCount);
        for (std::uint32_t i = 0; i < rectCount; i++) {
            rects[i].id = readU32(src, o); o += 4;
            rects[i].x = readF32(src, o); o += 4;
            rects[i].y = readF32(src, o); o += 4;
            rects[i].w = readF32(src, o); o += 4;
            rects[i].h = readF32(src, o); o += 4;
        }

        lines.resize(lineCount);
        for (std::uint32_t i = 0; i < lineCount; i++) {
            lines[i].id = readU32(src, o); o += 4;
            lines[i].x0 = readF32(src, o); o += 4;
            lines[i].y0 = readF32(src, o); o += 4;
            lines[i].x1 = readF32(src, o); o += 4;
            lines[i].y1 = readF32(src, o); o += 4;
        }

        polylines.resize(polyCount);
        for (std::uint32_t i = 0; i < polyCount; i++) {
            polylines[i].id = readU32(src, o); o += 4;
            polylines[i].offset = readU32(src, o); o += 4;
            polylines[i].count = readU32(src, o); o += 4;
        }

        points.resize(pointCount);
        for (std::uint32_t i = 0; i < pointCount; i++) {
            points[i].x = readF32(src, o); o += 4;
            points[i].y = readF32(src, o); o += 4;
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
            static_cast<std::uint32_t>(points.size()),
            static_cast<std::uint32_t>(triangleVertices.size() / 3),
            static_cast<std::uint32_t>(lineVertices.size() / 3),
            lastLoadMs,
            lastRebuildMs,
            lastApplyMs
        };
    }

private:
    static constexpr std::size_t defaultCapacityFloats = 50000;   // ~16.6k vertices
    static constexpr std::size_t defaultLineCapacityFloats = 20000; // ~6.6k line vertices
    static constexpr std::size_t defaultSnapshotCapacityBytes = 1 * 1024 * 1024;

    static constexpr std::uint32_t snapshotMagicEwc1 = 0x31435745; // "EWC1"
    static constexpr std::uint32_t commandMagicEwdc = 0x43445745; // "EWDC"
    static constexpr std::size_t snapshotHeaderBytes = 8 * 4;
    static constexpr std::size_t commandHeaderBytes = 4 * 4;
    static constexpr std::size_t perCommandHeaderBytes = 4 * 4;
    static constexpr std::size_t rectRecordBytes = 20;
    static constexpr std::size_t lineRecordBytes = 20;
    static constexpr std::size_t polyRecordBytes = 12;
    static constexpr std::size_t pointRecordBytes = 8;

    static constexpr std::size_t rectTriangleFloats = 6 * 3;
    static constexpr std::size_t rectOutlineFloats = 8 * 3; // 4 segments, 2 vertices each
    static constexpr std::size_t lineSegmentFloats = 2 * 3;

    struct RectRec { std::uint32_t id; float x; float y; float w; float h; };
    struct LineRec { std::uint32_t id; float x0; float y0; float x1; float y1; };
    struct PolyRec { std::uint32_t id; std::uint32_t offset; std::uint32_t count; };
    struct Point2 { float x; float y; };

    enum class EntityKind : std::uint8_t { Rect = 1, Line = 2, Polyline = 3 };
    struct EntityRef { EntityKind kind; std::uint32_t index; };

    enum class CommandOp : std::uint32_t {
        ClearAll = 1,
        UpsertRect = 2,
        UpsertLine = 3,
        UpsertPolyline = 4,
        DeleteEntity = 5,
    };

    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
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

        const std::uint32_t idx = ref.index;
        const std::uint32_t lastIdx = static_cast<std::uint32_t>(polylines.size() - 1);
        if (idx != lastIdx) {
            polylines[idx] = polylines[lastIdx];
            entities[polylines[idx].id] = EntityRef{EntityKind::Polyline, idx};
        }
        polylines.pop_back();
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
        // Snapshot V2: same binary layout as V1, but we always export as v2.
        const std::uint32_t version = 2;

        const std::size_t totalBytes =
            snapshotHeaderBytes +
            rects.size() * rectRecordBytes +
            lines.size() * lineRecordBytes +
            polylines.size() * polyRecordBytes +
            points.size() * pointRecordBytes;

        snapshotBytes.resize(totalBytes);
        std::uint8_t* dst = snapshotBytes.data();
        std::size_t o = 0;

        writeU32LE(dst, o, snapshotMagicEwc1); o += 4;
        writeU32LE(dst, o, version); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(rects.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(lines.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(polylines.size())); o += 4;
        writeU32LE(dst, o, static_cast<std::uint32_t>(points.size())); o += 4;
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
            lines.size() * lineSegmentFloats;
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
    }
};

EMSCRIPTEN_BINDINGS(cad_engine_module) {
    emscripten::class_<CadEngine>("CadEngine")
        .constructor<>()
        .function("add", &CadEngine::add)
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
        .field("pointCount", &CadEngine::EngineStats::pointCount)
        .field("triangleVertexCount", &CadEngine::EngineStats::triangleVertexCount)
        .field("lineVertexCount", &CadEngine::EngineStats::lineVertexCount)
        .field("lastLoadMs", &CadEngine::EngineStats::lastLoadMs)
        .field("lastRebuildMs", &CadEngine::EngineStats::lastRebuildMs)
        .field("lastApplyMs", &CadEngine::EngineStats::lastApplyMs);
}
