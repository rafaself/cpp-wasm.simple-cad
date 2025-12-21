// engine.cpp now contains only a thin TU; public `CadEngine` lives in engine/engine.h
#include "engine/engine.h"

// Implement CadEngine methods moved out of the header to keep the header small.

#include <cmath>
#include <cstring>

// Constructor
CadEngine::CadEngine() {
    triangleVertices.reserve(defaultCapacityFloats);
    lineVertices.reserve(defaultLineCapacityFloats);
    snapshotBytes.reserve(defaultSnapshotCapacityBytes);
    renderDirty = false;
    snapshotDirty = false;
    lastError = EngineError::Ok;
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
        static_cast<std::size_t>(maxPoints) * 2 * 7
    );
}

void CadEngine::loadSnapshotFromPtr(std::uintptr_t ptr, std::uint32_t byteCount) {
    clearError();
    const double t0 = emscripten_get_now();
    const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
    engine::SnapshotData sd;
    EngineError err = engine::parseSnapshot(src, byteCount, sd);
    if (err != EngineError::Ok) {
        setError(err);
        return;
    }

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

    // Snapshot does not persist runtime-only styling fields; default them to stable values.
    for (auto& r : rects) {
        r.sr = r.r;
        r.sg = r.g;
        r.sb = r.b;
        r.sa = 1.0f;
        r.strokeEnabled = 1.0f;
    }
    for (auto& l : lines) {
        l.r = 0.0f;
        l.g = 0.0f;
        l.b = 0.0f;
        l.a = 1.0f;
        l.enabled = 1.0f;
    }
    for (auto& pl : polylines) {
        pl.r = 0.0f;
        pl.g = 0.0f;
        pl.b = 0.0f;
        pl.a = 1.0f;
        pl.enabled = 1.0f;
    }
    for (auto& c : conduits) {
        c.r = 0.0f;
        c.g = 0.0f;
        c.b = 0.0f;
        c.a = 1.0f;
        c.enabled = 1.0f;
    }

    const double t1 = emscripten_get_now();
    
    // Lazy rebuild
    renderDirty = true;
    snapshotDirty = false; // Snapshot loaded is already valid byte-wise

    const double t2 = emscripten_get_now();

    lastLoadMs = static_cast<float>(t1 - t0);
    lastRebuildMs = static_cast<float>(t2 - t1); 
    lastApplyMs = 0.0f;
    generation++;
}

void CadEngine::applyCommandBuffer(std::uintptr_t ptr, std::uint32_t byteCount) {
    clearError();
    const double t0 = emscripten_get_now();
    const std::uint8_t* src = reinterpret_cast<const std::uint8_t*>(ptr);
    EngineError err = engine::parseCommandBuffer(src, byteCount, &CadEngine::cad_command_callback, this);
    if (err != EngineError::Ok) {
        setError(err);
        return;
    }

    compactPolylinePoints();
    
    // Lazy rebuild
    renderDirty = true;
    snapshotDirty = true;
    generation++;

    const double t1 = emscripten_get_now();
    lastApplyMs = static_cast<float>(t1 - t0);
    lastLoadMs = 0.0f;
    lastRebuildMs = 0.0f;
}

std::uint32_t CadEngine::getVertexCount() const noexcept {
    if (renderDirty) rebuildRenderBuffers();
    return static_cast<std::uint32_t>(triangleVertices.size() / 7);
}

std::uintptr_t CadEngine::getVertexDataPtr() const noexcept {
    if (renderDirty) rebuildRenderBuffers();
    return reinterpret_cast<std::uintptr_t>(triangleVertices.data());
}

CadEngine::BufferMeta CadEngine::buildMeta(const std::vector<float>& buffer, std::size_t floatsPerVertex) const noexcept {
    const std::uint32_t vertexCount = static_cast<std::uint32_t>(buffer.size() / floatsPerVertex);
    const std::uint32_t capacityVertices = static_cast<std::uint32_t>(buffer.capacity() / floatsPerVertex);
    const std::uint32_t floatCount = static_cast<std::uint32_t>(buffer.size());
    return BufferMeta{generation, vertexCount, capacityVertices, floatCount, reinterpret_cast<std::uintptr_t>(buffer.data())};
}

CadEngine::BufferMeta CadEngine::getPositionBufferMeta() const noexcept { 
    if (renderDirty) rebuildRenderBuffers();
    return buildMeta(triangleVertices, 7); 
}
CadEngine::BufferMeta CadEngine::getLineBufferMeta() const noexcept { 
    if (renderDirty) rebuildRenderBuffers();
    return buildMeta(lineVertices, 7); 
}

CadEngine::ByteBufferMeta CadEngine::getSnapshotBufferMeta() const noexcept { 
    if (snapshotDirty) rebuildSnapshotBytes();
    return ByteBufferMeta{generation, static_cast<std::uint32_t>(snapshotBytes.size()), reinterpret_cast<std::uintptr_t>(snapshotBytes.data())}; 
}

CadEngine::EngineStats CadEngine::getStats() const noexcept {
    if (renderDirty) rebuildRenderBuffers();
    return EngineStats{
        generation,
        static_cast<std::uint32_t>(rects.size()),
        static_cast<std::uint32_t>(lines.size()),
        static_cast<std::uint32_t>(polylines.size()),
        static_cast<std::uint32_t>(symbols.size()),
        static_cast<std::uint32_t>(nodes.size()),
        static_cast<std::uint32_t>(conduits.size()),
        static_cast<std::uint32_t>(points.size()),
        static_cast<std::uint32_t>(triangleVertices.size() / 7),
        static_cast<std::uint32_t>(lineVertices.size() / 7),
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
    renderDirty = true;
    snapshotDirty = true;
}

void CadEngine::deleteEntity(std::uint32_t id) noexcept {
    renderDirty = true;
    snapshotDirty = true;
    
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

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a) {
    // Back-compat overload: treat fill as stroke too.
    upsertRect(id, x, y, w, h, 0.0f, r, g, b, a, r, g, b, 1.0f, 1.0f);
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float z, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled) {
    renderDirty = true;
    snapshotDirty = true;
    
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Rect) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& existingRect = rects[it2->second.index];
        existingRect.x = x; existingRect.y = y; existingRect.w = w; existingRect.h = h; existingRect.z = z;
        existingRect.r = r; existingRect.g = g; existingRect.b = b; existingRect.a = a;
        existingRect.sr = sr; existingRect.sg = sg; existingRect.sb = sb; existingRect.sa = sa; existingRect.strokeEnabled = strokeEnabled;
        return;
    }

    rects.push_back(RectRec{id, x, y, w, h, z, r, g, b, a, sr, sg, sb, sa, strokeEnabled});
    entities[id] = EntityRef{EntityKind::Rect, static_cast<std::uint32_t>(rects.size() - 1)};
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
    // Back-compat overload: default to solid black and z=0.
    upsertLine(id, x0, y0, x1, y1, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float z, float r, float g, float b, float a, float enabled) {
    renderDirty = true;
    snapshotDirty = true;

    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Line) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& l = lines[it2->second.index];
        l.x0 = x0; l.y0 = y0; l.x1 = x1; l.y1 = y1; l.z = z;
        l.r = r; l.g = g; l.b = b; l.a = a; l.enabled = enabled;
        return;
    }

    lines.push_back(LineRec{id, x0, y0, x1, y1, z, r, g, b, a, enabled});
    entities[id] = EntityRef{EntityKind::Line, static_cast<std::uint32_t>(lines.size() - 1)};
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
    // Back-compat overload: default to solid black and z=0.
    upsertPolyline(id, offset, count, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float z, float r, float g, float b, float a, float enabled) {
    renderDirty = true;
    snapshotDirty = true;

    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Polyline) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& pl = polylines[it2->second.index];
        pl.offset = offset;
        pl.count = count;
        pl.z = z;
        pl.r = r; pl.g = g; pl.b = b; pl.a = a; pl.enabled = enabled;
        return;
    }

    polylines.push_back(PolyRec{id, offset, count, z, r, g, b, a, enabled});
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
    renderDirty = true;
    snapshotDirty = true;

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
    renderDirty = true;
    snapshotDirty = true;

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
    // Back-compat overload: default to solid black and z=0.
    upsertConduit(id, fromNodeId, toNodeId, 0.0f, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f);
}

void CadEngine::upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId, float z, float r, float g, float b, float a, float enabled) {
    renderDirty = true;
    snapshotDirty = true;

    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Conduit) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& c = conduits[it2->second.index];
        c.fromNodeId = fromNodeId;
        c.toNodeId = toNodeId;
        c.z = z;
        c.r = r; c.g = g; c.b = b; c.a = a; c.enabled = enabled;
        return;
    }

    conduits.push_back(ConduitRec{id, fromNodeId, toNodeId, z, r, g, b, a, enabled});
    entities[id] = EntityRef{EntityKind::Conduit, static_cast<std::uint32_t>(conduits.size() - 1)};
}

// Static member callback implementation
EngineError CadEngine::cad_command_callback(void* ctx, std::uint32_t op, std::uint32_t id, const std::uint8_t* payload, std::uint32_t payloadByteCount) {
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
            if (payloadByteCount != sizeof(RectPayload)) return EngineError::InvalidPayloadSize;
            RectPayload p;
            std::memcpy(&p, payload, sizeof(RectPayload));
            self->upsertRect(id, p.x, p.y, p.w, p.h, p.z, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertLine): {
            if (payloadByteCount != sizeof(LinePayload)) return EngineError::InvalidPayloadSize;
            LinePayload p;
            std::memcpy(&p, payload, sizeof(LinePayload));
            self->upsertLine(id, p.x0, p.y0, p.x1, p.y1, p.z, p.r, p.g, p.b, p.a, p.enabled);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertPolyline): {
            if (payloadByteCount < sizeof(PolylinePayloadHeader)) return EngineError::InvalidPayloadSize;
            PolylinePayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(PolylinePayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(PolylinePayloadHeader) + static_cast<std::size_t>(count) * 8;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            if (count < 2) {
                // Treat degenerate polyline as deletion.
                self->deleteEntity(id);
                break;
            }

            const std::uint32_t offset = static_cast<std::uint32_t>(self->points.size());
            self->points.reserve(self->points.size() + count);
            std::size_t p = sizeof(PolylinePayloadHeader);
            for (std::uint32_t j = 0; j < count; j++) {
                Point2 pt;
                std::memcpy(&pt, payload + p, sizeof(Point2));
                p += sizeof(Point2);
                self->points.push_back(pt);
            }
            self->upsertPolyline(id, offset, count, hdr.z, hdr.r, hdr.g, hdr.b, hdr.a, hdr.enabled);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertSymbol): {
            if (payloadByteCount != sizeof(SymbolPayload)) return EngineError::InvalidPayloadSize;
            SymbolPayload p;
            std::memcpy(&p, payload, sizeof(SymbolPayload));
            self->upsertSymbol(id, p.symbolKey, p.x, p.y, p.w, p.h, p.rotation, p.scaleX, p.scaleY, p.connX, p.connY);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertNode): {
            if (payloadByteCount != sizeof(NodePayload)) return EngineError::InvalidPayloadSize;
            NodePayload p;
            std::memcpy(&p, payload, sizeof(NodePayload));
            const NodeKind kind = p.kind == 1 ? NodeKind::Anchored : NodeKind::Free;
            self->upsertNode(id, kind, p.anchorId, p.x, p.y);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertConduit): {
            if (payloadByteCount != sizeof(ConduitPayload)) return EngineError::InvalidPayloadSize;
            ConduitPayload p;
            std::memcpy(&p, payload, sizeof(ConduitPayload));
            self->upsertConduit(id, p.fromNodeId, p.toNodeId, p.z, p.r, p.g, p.b, p.a, p.enabled);
            break;
        }
        default:
            return EngineError::UnknownCommand;
    }
    return EngineError::Ok;
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

void CadEngine::rebuildSnapshotBytes() const {
    engine::SnapshotData sd;
    sd.rects = rects;
    sd.lines = lines;
    sd.polylines = polylines;
    sd.points = points;
    sd.symbols = symbols;
    sd.nodes = nodes;
    sd.conduits = conduits;

    snapshotBytes = engine::buildSnapshotBytes(sd);
    snapshotDirty = false;
}

void CadEngine::pushVertex(float x, float y, float z, float r, float g, float b, std::vector<float>& target) const {
    target.push_back(x); target.push_back(y); target.push_back(z);
    target.push_back(r); target.push_back(g); target.push_back(b);
}
void CadEngine::pushVertex(float x, float y, float z, std::vector<float>& target) const {
    target.push_back(x); target.push_back(y); target.push_back(z);
}

void CadEngine::addRect(float x, float y, float w, float h, float r, float g, float b) const {
    // This overload is likely deprecated or unused for internal logic now, 
    // but kept for API compatibility if needed. It assumes full opacity if called directly.
    // However, the main render loop uses engine::rebuildRenderBuffers -> addRectToBuffers 
    // which operates on RectRec (containing 'a').
    // Let's implement it assuming full opacity or just delegate to helper.
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

void CadEngine::addRectOutline(float x, float y, float w, float h) const {
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

void CadEngine::addLineSegment(float x0, float y0, float x1, float y1, float z) const {
    pushVertex(x0, y0, z, lineVertices);
    pushVertex(x1, y1, z, lineVertices);
}

void CadEngine::rebuildRenderBuffers() const {
    const double t0 = emscripten_get_now();
    
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
        /*resolveCb*/ reinterpret_cast<engine::ResolveNodeCallback>(+[](void* ctx, std::uint32_t nodeId, Point2& out){ const CadEngine* self = reinterpret_cast<const CadEngine*>(ctx); return self->resolveNodePosition(nodeId, out); }),
        const_cast<CadEngine*>(this) 
    );
    renderDirty = false;
    
    const double t1 = emscripten_get_now();
    lastRebuildMs = static_cast<float>(t1 - t0);
}
