
// engine.cpp now contains only a thin TU; public `CadEngine` lives in engine/engine.h
#include "engine/engine.h"

// Implement CadEngine methods moved out of the header to keep the header small.

#include <cmath>
#include <stdexcept>

// Constructor
CadEngine::CadEngine() {
    triangleVertices.reserve(defaultCapacityFloats);
    lineVertices.reserve(defaultLineCapacityFloats);
    snapshotBytes.reserve(defaultSnapshotCapacityBytes);
}

void CadEngine::clear() noexcept {
    clearWorld();
    generation++;
}

std::uintptr_t CadEngine::allocBytes(std::uint32_t byteCount) {
    void* p = std::malloc(byteCount);
    return reinterpret_cast<std::uintptr_t>(p);
}

void CadEngine::freeBytes(std::uintptr_t ptr) {
    std::free(reinterpret_cast<void*>(ptr));
}

void CadEngine::reserveWorld(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints) {
    rects.reserve(maxRects);
    lines.reserve(maxLines);
    polylines.reserve(maxPolylines);
    points.reserve(maxPoints);

    triangleVertices.reserve(static_cast<std::size_t>(maxRects) * rectTriangleFloats);
    lineVertices.reserve(
        static_cast<std::size_t>(maxRects) * rectOutlineFloats +
        static_cast<std::size_t>(maxLines) * lineSegmentFloats +
        static_cast<std::size_t>(maxPoints) * 2 * 3
    );
}

void CadEngine::loadSnapshotFromPtr(std::uintptr_t ptr, std::uint32_t byteCount) {
    const double t0 = emscripten_get_now();
    const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
    engine::SnapshotData sd = engine::parseSnapshot(src, byteCount);

    clear();
    reserveWorld(static_cast<std::uint32_t>(sd.rects.size()), static_cast<std::uint32_t>(sd.lines.size()), static_cast<std::uint32_t>(sd.polylines.size()), static_cast<std::uint32_t>(sd.points.size()));
    symbols = std::move(sd.symbols);
    nodes = std::move(sd.nodes);
    conduits = std::move(sd.conduits);
    rects = std::move(sd.rects);
    lines = std::move(sd.lines);
    polylines = std::move(sd.polylines);
    points = std::move(sd.points);
    snapshotBytes = std::move(sd.rawBytes);

    const double t1 = emscripten_get_now();
    rebuildRenderBuffers();
    const double t2 = emscripten_get_now();

    lastLoadMs = static_cast<float>(t1 - t0);
    lastRebuildMs = static_cast<float>(t2 - t1);
    lastApplyMs = 0.0f;
    generation++;
}

void CadEngine::applyCommandBuffer(std::uintptr_t ptr, std::uint32_t byteCount) {
    const double t0 = emscripten_get_now();
    const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
    engine::parseCommandBuffer(src, byteCount, &CadEngine::cad_command_callback, this);

    compactPolylinePoints();
    rebuildRenderBuffers();
    rebuildSnapshotBytes();
    generation++;

    const double t1 = emscripten_get_now();
    lastApplyMs = static_cast<float>(t1 - t0);
    lastLoadMs = 0.0f;
    lastRebuildMs = 0.0f;
}

std::uint32_t CadEngine::getVertexCount() const noexcept {
    return static_cast<std::uint32_t>(triangleVertices.size() / 6);
}

std::uintptr_t CadEngine::getVertexDataPtr() const noexcept {
    return reinterpret_cast<std::uintptr_t>(triangleVertices.data());
}

CadEngine::BufferMeta CadEngine::buildMeta(const std::vector<float>& buffer, std::size_t floatsPerVertex) const noexcept {
    const std::uint32_t vertexCount = static_cast<std::uint32_t>(buffer.size() / floatsPerVertex);
    const std::uint32_t capacityVertices = static_cast<std::uint32_t>(buffer.capacity() / floatsPerVertex);
    const std::uint32_t floatCount = static_cast<std::uint32_t>(buffer.size());
    return BufferMeta{generation, vertexCount, capacityVertices, floatCount, reinterpret_cast<std::uintptr_t>(buffer.data())};
}

CadEngine::BufferMeta CadEngine::getPositionBufferMeta() const noexcept { return buildMeta(triangleVertices, 6); }
CadEngine::BufferMeta CadEngine::getLineBufferMeta() const noexcept { return buildMeta(lineVertices, 3); }

CadEngine::ByteBufferMeta CadEngine::getSnapshotBufferMeta() const noexcept { return ByteBufferMeta{generation, static_cast<std::uint32_t>(snapshotBytes.size()), reinterpret_cast<std::uintptr_t>(snapshotBytes.data())}; }

CadEngine::EngineStats CadEngine::getStats() const noexcept {
    return EngineStats{
        generation,
        static_cast<std::uint32_t>(rects.size()),
        static_cast<std::uint32_t>(lines.size()),
        static_cast<std::uint32_t>(polylines.size()),
        static_cast<std::uint32_t>(symbols.size()),
        static_cast<std::uint32_t>(nodes.size()),
        static_cast<std::uint32_t>(conduits.size()),
        static_cast<std::uint32_t>(points.size()),
        static_cast<std::uint32_t>(triangleVertices.size() / 6),
        static_cast<std::uint32_t>(lineVertices.size() / 3),
        lastLoadMs,
        lastRebuildMs,
        lastApplyMs
    };
}

CadEngine::SnapResult CadEngine::snapElectrical(float x, float y, float tolerance) const noexcept {
    return engine::snapElectrical(entities, symbols, nodes, x, y, tolerance);
}

void CadEngine::clearWorld() noexcept {
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

void CadEngine::deleteEntity(std::uint32_t id) noexcept {
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

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b) {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Rect) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& existingRect = rects[it2->second.index];
        existingRect.x = x; existingRect.y = y; existingRect.w = w; existingRect.h = h;
        existingRect.r = r; existingRect.g = g; existingRect.b = b;
        return;
    }

    rects.push_back(RectRec{id, x, y, w, h, r, g, b});
    entities[id] = EntityRef{EntityKind::Rect, static_cast<std::uint32_t>(rects.size() - 1)};
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
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

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
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

void CadEngine::upsertSymbol(
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

void CadEngine::upsertNode(std::uint32_t id, NodeKind kind, std::uint32_t anchorSymbolId, float x, float y) {
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

void CadEngine::upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId) {
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

// Static member callback implementation
void CadEngine::cad_command_callback(void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount) {
    CadEngine* self = reinterpret_cast<CadEngine*>(ctx);
    switch (op) {
        case static_cast<std::uint32_t>(CommandOp::ClearAll): {
            self->clearWorld();
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteEntity): {
            self->deleteEntity(id);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertRect): {
            if (payloadByteCount != 28) throw std::runtime_error("Invalid rect payload size"); // 7 floats * 4 bytes/float
            const float x = readF32(payload, 0);
            const float y = readF32(payload, 4);
            const float w = readF32(payload, 8);
            const float h = readF32(payload, 12);
            const float r = readF32(payload, 16);
            const float g = readF32(payload, 20);
            const float b = readF32(payload, 24);
            self->upsertRect(id, x, y, w, h, r, g, b);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertLine): {
            if (payloadByteCount != 16) throw std::runtime_error("Invalid line payload size");
            const float x0 = readF32(payload, 0);
            const float y0 = readF32(payload, 4);
            const float x1 = readF32(payload, 8);
            const float y1 = readF32(payload, 12);
            self->upsertLine(id, x0, y0, x1, y1);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertPolyline): {
            if (payloadByteCount < 4) throw std::runtime_error("Invalid polyline payload size");
            const std::uint32_t count = readU32(payload, 0);
            const std::size_t expected = 4 + static_cast<std::size_t>(count) * 8;
            if (expected != payloadByteCount) throw std::runtime_error("Invalid polyline payload length");
            if (count < 2) {
                // Treat degenerate polyline as deletion.
                self->deleteEntity(id);
                break;
            }

            const std::uint32_t offset = static_cast<std::uint32_t>(self->points.size());
            self->points.reserve(self->points.size() + count);
            std::size_t p = 4;
            for (std::uint32_t j = 0; j < count; j++) {
                const float x = readF32(payload, p); p += 4;
                const float y = readF32(payload, p); p += 4;
                self->points.push_back(Point2{x, y});
            }
            self->upsertPolyline(id, offset, count);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertSymbol): {
            if (payloadByteCount != 40) throw std::runtime_error("Invalid symbol payload size");
            const std::uint32_t symbolKey = readU32(payload, 0);
            const float x = readF32(payload, 4);
            const float y = readF32(payload, 8);
            const float w = readF32(payload, 12);
            const float h = readF32(payload, 16);
            const float rot = readF32(payload, 20);
            const float sx = readF32(payload, 24);
            const float sy = readF32(payload, 28);
            const float connX = readF32(payload, 32);
            const float connY = readF32(payload, 36);
            self->upsertSymbol(id, symbolKey, x, y, w, h, rot, sx, sy, connX, connY);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertNode): {
            if (payloadByteCount != 16) throw std::runtime_error("Invalid node payload size");
            const std::uint32_t kindU32 = readU32(payload, 0);
            const std::uint32_t anchorId = readU32(payload, 4);
            const float x = readF32(payload, 8);
            const float y = readF32(payload, 12);
            const NodeKind kind = kindU32 == 1 ? NodeKind::Anchored : NodeKind::Free;
            self->upsertNode(id, kind, anchorId, x, y);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertConduit): {
            if (payloadByteCount != 8) throw std::runtime_error("Invalid conduit payload size");
            const std::uint32_t fromNodeId = readU32(payload, 0);
            const std::uint32_t toNodeId = readU32(payload, 4);
            self->upsertConduit(id, fromNodeId, toNodeId);
            break;
        }
        default:
            throw std::runtime_error("Unknown command op");
    }
}

const SymbolRec* CadEngine::findSymbol(std::uint32_t id) const noexcept {
    const auto it = entities.find(id);
    if (it == entities.end()) return nullptr;
    if (it->second.kind != EntityKind::Symbol) return nullptr;
    return &symbols[it->second.index];
}

const NodeRec* CadEngine::findNode(std::uint32_t id) const noexcept {
    const auto it = entities.find(id);
    if (it == entities.end()) return nullptr;
    if (it->second.kind != EntityKind::Node) return nullptr;
    return &nodes[it->second.index];
}

bool CadEngine::resolveNodePosition(std::uint32_t nodeId, Point2& out) const noexcept {
    return engine::resolveNodePosition(entities, symbols, nodes, nodeId, out);
}

void CadEngine::compactPolylinePoints() {
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

void CadEngine::rebuildSnapshotBytes() {
    engine::SnapshotData sd;
    sd.rects = rects;
    sd.lines = lines;
    sd.polylines = polylines;
    sd.points = points;
    sd.symbols = symbols;
    sd.nodes = nodes;
    sd.conduits = conduits;

    snapshotBytes = engine::buildSnapshotBytes(sd);
}

void CadEngine::pushVertex(float x, float y, float z, float r, float g, float b, std::vector<float>& target) {
    target.push_back(x); target.push_back(y); target.push_back(z);
    target.push_back(r); target.push_back(g); target.push_back(b);
}
void CadEngine::pushVertex(float x, float y, float z, std::vector<float>& target) {
    target.push_back(x); target.push_back(y); target.push_back(z);
}

void CadEngine::addRect(float x, float y, float w, float h, float r, float g, float b) {
    const float x0 = x;
    const float y0 = y;
    const float x1 = x + w;
    const float y1 = y + h;
    constexpr float z = 0.0f;

    pushVertex(x0, y0, z, r, g, b, triangleVertices);
    pushVertex(x1, y0, z, r, g, b, triangleVertices);
    pushVertex(x1, y1, z, r, g, b, triangleVertices);

    pushVertex(x0, y0, z, r, g, b, triangleVertices);
    pushVertex(x1, y1, z, r, g, b, triangleVertices);
    pushVertex(x0, y1, z, r, g, b, triangleVertices);
}

void CadEngine::addRectOutline(float x, float y, float w, float h) {
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

void CadEngine::addLineSegment(float x0, float y0, float x1, float y1, float z) {
    pushVertex(x0, y0, z, lineVertices);
    pushVertex(x1, y1, z, lineVertices);
}

void CadEngine::rebuildRenderBuffers() {
    engine::rebuildRenderBuffers(
        rects,
        lines,
        polylines,
        points,
        conduits,
        symbols,
        nodes,
        triangleVertices,
        lineVertices,
        /*resolveCb*/ reinterpret_cast<engine::ResolveNodeCallback>(+[](void* ctx, std::uint32_t nodeId, Point2& out){ CadEngine* self = reinterpret_cast<CadEngine*>(ctx); return self->resolveNodePosition(nodeId, out); }),
        this
    );
}
// EMSCRIPTEN bindings moved to engine/bindings.cpp to keep the engine
// implementation and bindings in the same translation unit when building.
