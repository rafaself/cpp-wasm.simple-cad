// engine.cpp now contains only a thin TU; public `CadEngine` lives in engine/engine.h
#include "engine/engine.h"

// Implement CadEngine methods moved out of the header to keep the header small.

#include <cmath>
#include <algorithm>
#include <cstring>
#include <cstdio>  // For printf debugging

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
        r.strokeWidthPx = 1.0f;
    }
    for (auto& l : lines) {
        l.r = 0.0f;
        l.g = 0.0f;
        l.b = 0.0f;
        l.a = 1.0f;
        l.enabled = 1.0f;
        l.strokeWidthPx = 1.0f;
    }
    for (auto& pl : polylines) {
        pl.r = 0.0f;
        pl.g = 0.0f;
        pl.b = 0.0f;
        pl.a = 1.0f;
        pl.sr = 0.0f;
        pl.sg = 0.0f;
        pl.sb = 0.0f;
        pl.sa = 1.0f;
        pl.enabled = 1.0f;
        pl.strokeEnabled = 1.0f;
        pl.strokeWidthPx = 1.0f;
    }
    for (auto& c : conduits) {
        c.r = 0.0f;
        c.g = 0.0f;
        c.b = 0.0f;
        c.a = 1.0f;
        c.enabled = 1.0f;
        c.strokeWidthPx = 1.0f;
    }

    // Rebuild entity index and default draw order (snapshot does not persist these).
    entities.clear();
    drawOrderIds.clear();
    drawOrderIds.reserve(rects.size() + lines.size() + polylines.size() + conduits.size());
    for (std::uint32_t i = 0; i < rects.size(); i++) entities[rects[i].id] = EntityRef{EntityKind::Rect, i};
    for (std::uint32_t i = 0; i < lines.size(); i++) entities[lines[i].id] = EntityRef{EntityKind::Line, i};
    for (std::uint32_t i = 0; i < polylines.size(); i++) entities[polylines[i].id] = EntityRef{EntityKind::Polyline, i};
    for (std::uint32_t i = 0; i < symbols.size(); i++) entities[symbols[i].id] = EntityRef{EntityKind::Symbol, i};
    for (std::uint32_t i = 0; i < nodes.size(); i++) entities[nodes[i].id] = EntityRef{EntityKind::Node, i};
    for (std::uint32_t i = 0; i < conduits.size(); i++) entities[conduits[i].id] = EntityRef{EntityKind::Conduit, i};

    drawOrderIds.reserve(entities.size());
    for (const auto& kv : entities) drawOrderIds.push_back(kv.first);
    std::sort(drawOrderIds.begin(), drawOrderIds.end());

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
    circles.clear();
    polygons.clear();
    arrows.clear();
    symbols.clear();
    nodes.clear();
    conduits.clear();
    entities.clear();
    drawOrderIds.clear();
    viewScale = 1.0f;
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
    if (!drawOrderIds.empty()) {
        for (std::size_t i = 0; i < drawOrderIds.size(); i++) {
            if (drawOrderIds[i] == id) {
                drawOrderIds.erase(drawOrderIds.begin() + static_cast<std::ptrdiff_t>(i));
                break;
            }
        }
    }

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

    if (ref.kind == EntityKind::Circle) {
        const std::uint32_t idx = ref.index;
        const std::uint32_t lastIdx = static_cast<std::uint32_t>(circles.size() - 1);
        if (idx != lastIdx) {
            circles[idx] = circles[lastIdx];
            entities[circles[idx].id] = EntityRef{EntityKind::Circle, idx};
        }
        circles.pop_back();
        return;
    }

    if (ref.kind == EntityKind::Polygon) {
        const std::uint32_t idx = ref.index;
        const std::uint32_t lastIdx = static_cast<std::uint32_t>(polygons.size() - 1);
        if (idx != lastIdx) {
            polygons[idx] = polygons[lastIdx];
            entities[polygons[idx].id] = EntityRef{EntityKind::Polygon, idx};
        }
        polygons.pop_back();
        return;
    }

    if (ref.kind == EntityKind::Arrow) {
        const std::uint32_t idx = ref.index;
        const std::uint32_t lastIdx = static_cast<std::uint32_t>(arrows.size() - 1);
        if (idx != lastIdx) {
            arrows[idx] = arrows[lastIdx];
            entities[arrows[idx].id] = EntityRef{EntityKind::Arrow, idx};
        }
        arrows.pop_back();
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
    upsertRect(id, x, y, w, h, r, g, b, a, r, g, b, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Rect) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& existingRect = rects[it2->second.index];
        existingRect.x = x; existingRect.y = y; existingRect.w = w; existingRect.h = h;
        existingRect.r = r; existingRect.g = g; existingRect.b = b; existingRect.a = a;
        existingRect.sr = sr; existingRect.sg = sg; existingRect.sb = sb; existingRect.sa = sa; existingRect.strokeEnabled = strokeEnabled; existingRect.strokeWidthPx = strokeWidthPx;
        return;
    }

    rects.push_back(RectRec{id, x, y, w, h, r, g, b, a, sr, sg, sb, sa, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Rect, static_cast<std::uint32_t>(rects.size() - 1)};
    drawOrderIds.push_back(id);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
    // Back-compat overload: default to solid black.
    upsertLine(id, x0, y0, x1, y1, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;

    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Line) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& l = lines[it2->second.index];
        l.x0 = x0; l.y0 = y0; l.x1 = x1; l.y1 = y1;
        l.r = r; l.g = g; l.b = b; l.a = a; l.enabled = enabled; l.strokeWidthPx = strokeWidthPx;
        return;
    }

    lines.push_back(LineRec{id, x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Line, static_cast<std::uint32_t>(lines.size() - 1)};
    drawOrderIds.push_back(id);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
    // Back-compat overload: default to solid black.
    upsertPolyline(id, offset, count, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
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
        pl.r = r; pl.g = g; pl.b = b; pl.a = a; pl.enabled = enabled; pl.strokeWidthPx = strokeWidthPx;
        // Default stroke to same as main color for compat
        pl.sr = r; pl.sg = g; pl.sb = b; pl.sa = a; pl.strokeEnabled = enabled;
        return;
    }

    polylines.push_back(PolyRec{id, offset, count, r, g, b, a, r, g, b, a, enabled, enabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Polyline, static_cast<std::uint32_t>(polylines.size() - 1)};
    drawOrderIds.push_back(id);
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
    // Back-compat overload: default to solid black.
    upsertConduit(id, fromNodeId, toNodeId, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
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
        c.r = r; c.g = g; c.b = b; c.a = a; c.enabled = enabled; c.strokeWidthPx = strokeWidthPx;
        return;
    }

    conduits.push_back(ConduitRec{id, fromNodeId, toNodeId, r, g, b, a, enabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Conduit, static_cast<std::uint32_t>(conduits.size() - 1)};
    drawOrderIds.push_back(id);
}

void CadEngine::upsertCircle(
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
) {
    renderDirty = true;
    snapshotDirty = true;

    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Circle) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& c = circles[it2->second.index];
        c.cx = cx; c.cy = cy; c.rx = rx; c.ry = ry; c.rot = rot; c.sx = sx; c.sy = sy;
        c.r = fillR; c.g = fillG; c.b = fillB; c.a = fillA;
        c.sr = strokeR; c.sg = strokeG; c.sb = strokeB; c.sa = strokeA;
        c.strokeEnabled = strokeEnabled; c.strokeWidthPx = strokeWidthPx;
        return;
    }

    circles.push_back(CircleRec{id, cx, cy, rx, ry, rot, sx, sy, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Circle, static_cast<std::uint32_t>(circles.size() - 1)};
    drawOrderIds.push_back(id);
}

void CadEngine::upsertPolygon(
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
) {
    renderDirty = true;
    snapshotDirty = true;

    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Polygon) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& p = polygons[it2->second.index];
        p.cx = cx; p.cy = cy; p.rx = rx; p.ry = ry; p.rot = rot; p.sx = sx; p.sy = sy;
        p.sides = sides;
        p.r = fillR; p.g = fillG; p.b = fillB; p.a = fillA;
        p.sr = strokeR; p.sg = strokeG; p.sb = strokeB; p.sa = strokeA;
        p.strokeEnabled = strokeEnabled; p.strokeWidthPx = strokeWidthPx;
        return;
    }

    polygons.push_back(PolygonRec{id, cx, cy, rx, ry, rot, sx, sy, sides, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Polygon, static_cast<std::uint32_t>(polygons.size() - 1)};
    drawOrderIds.push_back(id);
}

void CadEngine::upsertArrow(
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
) {
    renderDirty = true;
    snapshotDirty = true;

    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Arrow) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& a = arrows[it2->second.index];
        a.ax = ax; a.ay = ay; a.bx = bx; a.by = by; a.head = head;
        a.sr = strokeR; a.sg = strokeG; a.sb = strokeB; a.sa = strokeA;
        a.strokeEnabled = strokeEnabled; a.strokeWidthPx = strokeWidthPx;
        return;
    }

    arrows.push_back(ArrowRec{id, ax, ay, bx, by, head, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Arrow, static_cast<std::uint32_t>(arrows.size() - 1)};
    drawOrderIds.push_back(id);
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
        case static_cast<std::uint32_t>(CommandOp::SetViewScale): {
            if (payloadByteCount != sizeof(ViewScalePayload)) return EngineError::InvalidPayloadSize;
            ViewScalePayload p;
            std::memcpy(&p, payload, sizeof(ViewScalePayload));
            const float s = (p.scale > 1e-6f && std::isfinite(p.scale)) ? p.scale : 1.0f;
            self->viewScale = s;
            self->renderDirty = true;
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetDrawOrder): {
            if (payloadByteCount < sizeof(DrawOrderPayloadHeader)) return EngineError::InvalidPayloadSize;
            DrawOrderPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(DrawOrderPayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(DrawOrderPayloadHeader) + static_cast<std::size_t>(count) * 4;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            self->drawOrderIds.clear();
            self->drawOrderIds.reserve(count);
            std::size_t o = sizeof(DrawOrderPayloadHeader);
            for (std::uint32_t i = 0; i < count; i++) {
                std::uint32_t sid;
                std::memcpy(&sid, payload + o, sizeof(std::uint32_t));
                o += sizeof(std::uint32_t);
                self->drawOrderIds.push_back(sid);
            }
            self->renderDirty = true;
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertRect): {
            if (payloadByteCount != sizeof(RectPayload)) return EngineError::InvalidPayloadSize;
            RectPayload p;
            std::memcpy(&p, payload, sizeof(RectPayload));
            self->upsertRect(id, p.x, p.y, p.w, p.h, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertLine): {
            if (payloadByteCount != sizeof(LinePayload)) return EngineError::InvalidPayloadSize;
            LinePayload p;
            std::memcpy(&p, payload, sizeof(LinePayload));
            self->upsertLine(id, p.x0, p.y0, p.x1, p.y1, p.r, p.g, p.b, p.a, p.enabled, p.strokeWidthPx);
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
            self->upsertPolyline(id, offset, count, hdr.r, hdr.g, hdr.b, hdr.a, hdr.enabled, hdr.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertCircle): {
            if (payloadByteCount != sizeof(CirclePayload)) return EngineError::InvalidPayloadSize;
            CirclePayload p;
            std::memcpy(&p, payload, sizeof(CirclePayload));
            self->upsertCircle(id, p.cx, p.cy, p.rx, p.ry, p.rot, p.sx, p.sy, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertPolygon): {
            if (payloadByteCount != sizeof(PolygonPayload)) return EngineError::InvalidPayloadSize;
            PolygonPayload p;
            std::memcpy(&p, payload, sizeof(PolygonPayload));
            self->upsertPolygon(id, p.cx, p.cy, p.rx, p.ry, p.rot, p.sx, p.sy, p.sides, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertArrow): {
            if (payloadByteCount != sizeof(ArrowPayload)) return EngineError::InvalidPayloadSize;
            ArrowPayload p;
            std::memcpy(&p, payload, sizeof(ArrowPayload));
            self->upsertArrow(id, p.ax, p.ay, p.bx, p.by, p.head, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
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
            self->upsertConduit(id, p.fromNodeId, p.toNodeId, p.r, p.g, p.b, p.a, p.enabled, p.strokeWidthPx);
            break;
        }
        // =======================================================================
        // Text Commands
        // =======================================================================
        case static_cast<std::uint32_t>(CommandOp::UpsertText): {
            printf("[DEBUG] UpsertText command received: id=%u payloadBytes=%u\n", id, payloadByteCount);
            
            // Variable-length payload: [TextPayloadHeader][TextRunPayload * runCount][UTF-8 content]
            if (payloadByteCount < sizeof(TextPayloadHeader)) return EngineError::InvalidPayloadSize;
            
            TextPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(TextPayloadHeader));
            
            printf("[DEBUG] UpsertText header: x=%.2f y=%.2f runCount=%u contentLen=%u\n", 
                hdr.x, hdr.y, hdr.runCount, hdr.contentLength);
            
            const std::size_t runsSize = static_cast<std::size_t>(hdr.runCount) * sizeof(TextRunPayload);
            const std::size_t expected = sizeof(TextPayloadHeader) + runsSize + hdr.contentLength;
            if (payloadByteCount != expected) return EngineError::InvalidPayloadSize;
            
            const TextRunPayload* runs = reinterpret_cast<const TextRunPayload*>(payload + sizeof(TextPayloadHeader));
            const char* content = reinterpret_cast<const char*>(payload + sizeof(TextPayloadHeader) + runsSize);
            
            if (!self->upsertText(id, hdr, runs, hdr.runCount, content, hdr.contentLength)) {
                return EngineError::InvalidOperation;
            }
            printf("[DEBUG] UpsertText: successfully stored text id=%u\n", id);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteText): {
            // No payload for delete, just use the id
            if (!self->deleteText(id)) {
                // Not an error if text doesn't exist - idempotent delete
            }
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextCaret): {
            if (payloadByteCount != sizeof(TextCaretPayload)) return EngineError::InvalidPayloadSize;
            TextCaretPayload p;
            std::memcpy(&p, payload, sizeof(TextCaretPayload));
            self->setTextCaret(p.textId, p.caretIndex);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextSelection): {
            if (payloadByteCount != sizeof(TextSelectionPayload)) return EngineError::InvalidPayloadSize;
            TextSelectionPayload p;
            std::memcpy(&p, payload, sizeof(TextSelectionPayload));
            self->setTextSelection(p.textId, p.selectionStart, p.selectionEnd);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::InsertTextContent): {
            // Variable-length payload: [TextInsertPayloadHeader][UTF-8 content]
            if (payloadByteCount < sizeof(TextInsertPayloadHeader)) return EngineError::InvalidPayloadSize;
            
            TextInsertPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(TextInsertPayloadHeader));
            
            const std::size_t expected = sizeof(TextInsertPayloadHeader) + hdr.byteLength;
            if (payloadByteCount != expected) return EngineError::InvalidPayloadSize;
            
            const char* content = reinterpret_cast<const char*>(payload + sizeof(TextInsertPayloadHeader));
            if (!self->insertTextContent(hdr.textId, hdr.insertIndex, content, hdr.byteLength)) {
                return EngineError::InvalidOperation;
            }
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteTextContent): {
            if (payloadByteCount != sizeof(TextDeletePayload)) return EngineError::InvalidPayloadSize;
            TextDeletePayload p;
            std::memcpy(&p, payload, sizeof(TextDeletePayload));
            if (!self->deleteTextContent(p.textId, p.startIndex, p.endIndex)) {
                return EngineError::InvalidOperation;
            }
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
        circles,
        polygons,
        arrows,
        symbols,
        nodes,
        entities,
        drawOrderIds,
        viewScale,
        triangleVertices,
        lineVertices,
        /*resolveCb*/ reinterpret_cast<engine::ResolveNodeCallback>(+[](void* ctx, std::uint32_t nodeId, Point2& out){ const CadEngine* self = reinterpret_cast<const CadEngine*>(ctx); return self->resolveNodePosition(nodeId, out); }),
        const_cast<CadEngine*>(this) 
    );
    renderDirty = false;
    
    const double t1 = emscripten_get_now();
    lastRebuildMs = static_cast<float>(t1 - t0);
}

// =============================================================================
// Text System Implementation
// =============================================================================

bool CadEngine::initializeTextSystem() {
    if (textInitialized_) return true;
    
    // Initialize font manager
    if (!fontManager_.initialize()) {
        return false;
    }
    
    // Initialize layout engine with font manager and text store
    textLayoutEngine_.initialize(&fontManager_, &textStore_);
    
    // Initialize glyph atlas with font manager
    if (!glyphAtlas_.initialize(&fontManager_)) {
        fontManager_.shutdown();
        return false;
    }
    
    textInitialized_ = true;
    return true;
}

bool CadEngine::loadFont(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize) {
    const std::uint8_t* fontData = reinterpret_cast<const std::uint8_t*>(fontDataPtr);
    if (!textInitialized_) {
        if (!initializeTextSystem()) {
            return false;
        }
    }
    // Use registerFont to associate with specific fontId
    return fontManager_.registerFont(fontId, fontData, dataSize, "", false, false);
}

bool CadEngine::upsertText(
    std::uint32_t id,
    const TextPayloadHeader& header,
    const TextRunPayload* runs,
    std::uint32_t runCount,
    const char* content,
    std::uint32_t contentLength
) {
    if (!textInitialized_) {
        if (!initializeTextSystem()) {
            return false;
        }
    }
    
    // Store in TextStore
    if (!textStore_.upsertText(id, header, runs, runCount, content, contentLength)) {
        return false;
    }
    
    // Register in entity map
    auto it = entities.find(id);
    if (it != entities.end()) {
        // Entity exists - if it's not a Text, we have a conflict (shouldn't happen if JS is correct)
        if (it->second.kind != EntityKind::Text) {
            // Delete the old entity first
            deleteEntity(id);
        }
    }
    
    // Add/update entity ref
    entities[id] = EntityRef{EntityKind::Text, id}; // For text, index == id (TextStore uses id as key)
    
    // Layout the text
    textLayoutEngine_.layoutText(id);
    
    renderDirty = true;
    snapshotDirty = true;
    generation++;
    
    return true;
}

bool CadEngine::deleteText(std::uint32_t id) {
    auto it = entities.find(id);
    if (it == entities.end() || it->second.kind != EntityKind::Text) {
        return false;
    }
    
    // Remove from TextStore
    textStore_.deleteText(id);
    
    // Clear layout cache
    textLayoutEngine_.clearLayout(id);
    
    // Remove from entity map
    entities.erase(it);
    
    renderDirty = true;
    snapshotDirty = true;
    generation++;
    
    return true;
}

void CadEngine::setTextCaret(std::uint32_t textId, std::uint32_t caretIndex) {
    textStore_.setCaret(textId, caretIndex);
}

void CadEngine::setTextSelection(std::uint32_t textId, std::uint32_t selectionStart, std::uint32_t selectionEnd) {
    textStore_.setSelection(textId, selectionStart, selectionEnd);
}

bool CadEngine::insertTextContent(
    std::uint32_t textId,
    std::uint32_t insertIndex,
    const char* content,
    std::uint32_t byteLength
) {
    if (!textStore_.insertContent(textId, insertIndex, content, byteLength)) {
        return false;
    }
    
    // Re-layout the text
    textLayoutEngine_.layoutText(textId);
    
    renderDirty = true;
    snapshotDirty = true;
    generation++;
    
    return true;
}

bool CadEngine::deleteTextContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex) {
    if (!textStore_.deleteContent(textId, startIndex, endIndex)) {
        return false;
    }
    
    // Re-layout the text
    textLayoutEngine_.layoutText(textId);
    
    renderDirty = true;
    snapshotDirty = true;
    generation++;
    
    return true;
    return true;
}

bool CadEngine::setTextConstraintWidth(std::uint32_t textId, float width) {
    if (!textInitialized_) return false;

    if (!textStore_.setConstraintWidth(textId, width)) {
        return false;
    }

    // Re-layout immediately to ensure up-to-date bounds
    textLayoutEngine_.layoutText(textId);

    renderDirty = true;
    snapshotDirty = true;
    generation++;

    return true;
}

TextHitResult CadEngine::hitTestText(std::uint32_t textId, float localX, float localY) const {
    if (!textInitialized_) {
        return TextHitResult{0, 0, true};
    }
    return textLayoutEngine_.hitTest(textId, localX, localY);
}

TextCaretPosition CadEngine::getTextCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!textInitialized_) {
        return TextCaretPosition{0.0f, 0.0f, 0.0f, 0};
    }
    return textLayoutEngine_.getCaretPosition(textId, charIndex);
}

bool CadEngine::getTextBounds(std::uint32_t textId, float& outMinX, float& outMinY, float& outMaxX, float& outMaxY) const {
    const TextRec* text = textStore_.getText(textId);
    if (!text) {
        return false;
    }
    outMinX = text->minX;
    outMinY = text->minY;
    outMaxX = text->maxX;
    outMaxY = text->maxY;
    return true;
}

void CadEngine::rebuildTextQuadBuffer() {
    if (!textInitialized_) {
        textQuadBuffer_.clear();
        return;
    }
    
    textQuadBuffer_.clear();
    
    // Get all text IDs
    const auto textIds = textStore_.getAllTextIds();
    
    // For each text entity, generate quads for its glyphs
    
    // For each text entity, generate quads for its glyphs
    for (std::uint32_t textId : textIds) {
        const TextRec* text = textStore_.getText(textId);
        if (!text) continue;
        
        const auto* layout = textLayoutEngine_.getLayout(textId);
        if (!layout) {
            printf("[DEBUG] rebuildTextQuadBuffer: textId=%u has no layout\n", textId);
            continue;
        }
        
        // Get the runs for color info
        const auto& runs = textStore_.getRuns(textId);
        

        
        const float baseX = text->x;
        const float baseY = text->y;
        constexpr float z = 0.0f; // Text at z=0 for now
        
        // Track Y offset for lines (Y grows upward in this coordinate system)
        // First line starts at baseY, subsequent lines go DOWN (decreasing Y)
        float yOffset = 0.0f;
        
        // Process each line
        for (const auto& line : layout->lines) {
            // Baseline is at yOffset - line.ascent (ascent goes UP from baseline)
            // For Y-up: baseline is below the top of the line
            const float baseline = yOffset - line.ascent;
            
            // Accumulated pen position for glyph X (horizontal advance)
            float penX = 0.0f;
            
            // Process glyphs in this line using the index range
            for (std::uint32_t gi = line.startGlyph; gi < line.startGlyph + line.glyphCount; ++gi) {
                if (gi >= layout->glyphs.size()) break;
                const auto& glyph = layout->glyphs[gi];
                
                // Get atlas entry for this glyph
                // Note: We need to know the fontId for the glyph, which requires looking up the run
                std::uint32_t fontId = 0;
                float fontSize = 16.0f;
                float r = 0.0f, g = 0.0f, b = 0.0f, a = 1.0f;
                
                // Find the run this glyph belongs to for font and color
                for (const auto& run : runs) {
                    if (glyph.clusterIndex >= run.startIndex && glyph.clusterIndex < run.startIndex + run.length) {
                        fontId = run.fontId;
                        fontSize = run.fontSize;
                        // Extract color from RGBA packed value
                        std::uint32_t rgba = run.colorRGBA;
                        r = static_cast<float>((rgba >> 24) & 0xFF) / 255.0f;
                        g = static_cast<float>((rgba >> 16) & 0xFF) / 255.0f;
                        b = static_cast<float>((rgba >> 8) & 0xFF) / 255.0f;
                        a = static_cast<float>(rgba & 0xFF) / 255.0f;
                        break;
                    }
                }
                
                const auto* atlasEntry = glyphAtlas_.getGlyph(fontId, glyph.glyphId);
                if (!atlasEntry || atlasEntry->width == 0.0f || atlasEntry->height == 0.0f) {
                    // Still advance penX for whitespace/missing glyphs
                    penX += glyph.xAdvance;
                    continue;
                }
                
                // Calculate glyph position in world space
                // Scale factor: fontSize / atlasEntry->fontSize (which is msdfSize)
                const float scale = fontSize / atlasEntry->fontSize;
                
                // Glyph X position: baseX + penX + xOffset (HarfBuzz offset is relative to pen)
                // Glyph Y position: baseY + baseline + yOffset + (bearingY - height) * fontSize
                // Note: bearingY is now the Top of the bitmap relative to baseline (positive up)
                // Layout coordinates (penX, xOffset, yOffset) are already in pixels from TextLayoutEngine
                // So we do NOT multiply them by 'scale' (which is for MSDF bitmap sizing only)
                const float glyphX = baseX + (penX + glyph.xOffset) + atlasEntry->bearingX * fontSize;
                const float glyphY = baseY + baseline + glyph.yOffset + (atlasEntry->bearingY - atlasEntry->height) * fontSize;
                const float glyphW = atlasEntry->width * fontSize;
                const float glyphH = atlasEntry->height * fontSize;
                
                // UV coordinates - use the pre-computed normalized UVs
                const float u0 = atlasEntry->u0;
                const float v0 = atlasEntry->v0;
                const float u1 = atlasEntry->u1;
                const float v1 = atlasEntry->v1;
                
                // Emit 6 vertices (2 triangles) for this glyph quad
                // Format: x, y, z, u, v, r, g, b, a
                // Triangle 1: top-left, top-right, bottom-right
                // NOTE: World Y is UP. Texture V is DOWN (0 at top).
                // So we map v1 (bottom of texture) to glyphY (bottom of quad)
                // And v0 (top of texture) to glyphY + glyphH (top of quad)
                
                // Vertex 0: Bottom-Left (but using top-left logic structure?)
                // Let's explicitly define corners according to TRIANGLE STRIP or TRIANGLES topology logic
                // The previous code was:
                // (X, Y) -> v0   (Bottom-Left -> Top Tex) INVERTED
                // (X+W, Y) -> v0 (Bottom-Right -> Top Tex) INVERTED
                // (X+W, Y+H) -> v1 (Top-Right -> Bottom Tex) INVERTED
                
                // Correct mapping:
                // Bottom-Left (X, Y) -> v1 (Bottom of texture)
                // Bottom-Right (X+W, Y) -> v1 (Bottom of texture)
                // Top-Right (X+W, Y+H) -> v0 (Top of texture)
                // Top-Left (X, Y+H) -> v0 (Top of texture)
                
                // Triangle 1: (X, Y), (X+W, Y), (X+W, Y+H) -> BL, BR, TR
                textQuadBuffer_.push_back(glyphX);          textQuadBuffer_.push_back(glyphY);          textQuadBuffer_.push_back(z);
                textQuadBuffer_.push_back(u0);              textQuadBuffer_.push_back(v1);              // BL -> Bottom UV
                textQuadBuffer_.push_back(r);               textQuadBuffer_.push_back(g);               textQuadBuffer_.push_back(b);               textQuadBuffer_.push_back(a);
                
                textQuadBuffer_.push_back(glyphX + glyphW); textQuadBuffer_.push_back(glyphY);          textQuadBuffer_.push_back(z);
                textQuadBuffer_.push_back(u1);              textQuadBuffer_.push_back(v1);              // BR -> Bottom UV
                textQuadBuffer_.push_back(r);               textQuadBuffer_.push_back(g);               textQuadBuffer_.push_back(b);               textQuadBuffer_.push_back(a);
                
                textQuadBuffer_.push_back(glyphX + glyphW); textQuadBuffer_.push_back(glyphY + glyphH); textQuadBuffer_.push_back(z);
                textQuadBuffer_.push_back(u1);              textQuadBuffer_.push_back(v0);              // TR -> Top UV
                textQuadBuffer_.push_back(r);               textQuadBuffer_.push_back(g);               textQuadBuffer_.push_back(b);               textQuadBuffer_.push_back(a);
                
                // Triangle 2: (X, Y), (X+W, Y+H), (X, Y+H) -> BL, TR, TL
                textQuadBuffer_.push_back(glyphX);          textQuadBuffer_.push_back(glyphY);          textQuadBuffer_.push_back(z);
                textQuadBuffer_.push_back(u0);              textQuadBuffer_.push_back(v1);              // BL -> Bottom UV
                textQuadBuffer_.push_back(r);               textQuadBuffer_.push_back(g);               textQuadBuffer_.push_back(b);               textQuadBuffer_.push_back(a);
                
                textQuadBuffer_.push_back(glyphX + glyphW); textQuadBuffer_.push_back(glyphY + glyphH); textQuadBuffer_.push_back(z);
                textQuadBuffer_.push_back(u1);              textQuadBuffer_.push_back(v0);              // TR -> Top UV
                textQuadBuffer_.push_back(r);               textQuadBuffer_.push_back(g);               textQuadBuffer_.push_back(b);               textQuadBuffer_.push_back(a);

                textQuadBuffer_.push_back(glyphX);          textQuadBuffer_.push_back(glyphY + glyphH); textQuadBuffer_.push_back(z);
                textQuadBuffer_.push_back(u0);              textQuadBuffer_.push_back(v0);              // TL -> Top UV
                textQuadBuffer_.push_back(r);               textQuadBuffer_.push_back(g);               textQuadBuffer_.push_back(b);               textQuadBuffer_.push_back(a);
                
                // Advance pen position by glyph advance
                penX += glyph.xAdvance;
            }
            
            // Move yOffset to next line (decreasing Y for Y-up system)
            yOffset -= line.lineHeight;
        }
    }
}

CadEngine::BufferMeta CadEngine::getTextQuadBufferMeta() const noexcept {
    constexpr std::size_t floatsPerVertex = 9; // x, y, z, u, v, r, g, b, a
    return buildMeta(textQuadBuffer_, floatsPerVertex);
}

CadEngine::TextureBufferMeta CadEngine::getAtlasTextureMeta() const noexcept {
    if (!textInitialized_) {
        return TextureBufferMeta{0, 0, 0, 0, 0};
    }
    return TextureBufferMeta{
        glyphAtlas_.getVersion(),
        glyphAtlas_.getWidth(),
        glyphAtlas_.getHeight(),
        static_cast<std::uint32_t>(glyphAtlas_.getTextureDataSize()),
        reinterpret_cast<std::uintptr_t>(glyphAtlas_.getTextureData())
    };
}

bool CadEngine::isAtlasDirty() const noexcept {
    if (!textInitialized_) return false;
    return glyphAtlas_.isDirty();
}

void CadEngine::clearAtlasDirty() {
    if (textInitialized_) {
        glyphAtlas_.clearDirty();
    }
}

CadEngine::TextContentMeta CadEngine::getTextContentMeta(std::uint32_t textId) const noexcept {
    if (!textInitialized_) {
        return TextContentMeta{0, 0, false};
    }
    
    std::string_view content = textStore_.getContent(textId);
    if (content.data() == nullptr) {
        return TextContentMeta{0, 0, false};
    }
    
    return TextContentMeta{
        static_cast<std::uint32_t>(content.size()),
        reinterpret_cast<std::uintptr_t>(content.data()),
        true
    };
}

std::vector<CadEngine::TextSelectionRect> CadEngine::getTextSelectionRects(std::uint32_t textId, std::uint32_t start, std::uint32_t end) const {
    if (!textInitialized_) {
        return {};
    }
    return textLayoutEngine_.getSelectionRects(textId, start, end);
}
