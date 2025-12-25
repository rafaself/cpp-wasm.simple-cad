// engine.cpp now contains only a thin TU; public `CadEngine` lives in engine/engine.h
#include "engine/engine.h"

// Implement CadEngine methods moved out of the header to keep the header small.

#include <cmath>
#include <algorithm>
#include <cstring>
#include <cstdio>  // For printf debugging
#include <string_view>

// Helpers moved to text_system.cpp
namespace {
    // Map logical index (grapheme/codepoint approximation) to UTF-8 byte offset.
    // This treats any non-continuation byte as a logical step; true grapheme
    // clustering is TODO but this keeps logical indices decoupled from bytes.
    std::uint32_t logicalToByteIndex(std::string_view content, std::uint32_t logicalIndex) {
        std::uint32_t bytePos = 0;
        std::uint32_t logicalCount = 0;
        const std::size_t n = content.size();
        while (bytePos < n && logicalCount < logicalIndex) {
            const unsigned char c = static_cast<unsigned char>(content[bytePos]);
            // Continuation bytes have top bits 10xxxxxx
            if ((c & 0xC0) != 0x80) {
                logicalCount++;
            }
            bytePos++;
        }
        return static_cast<std::uint32_t>(bytePos);
    }

    std::uint32_t byteToLogicalIndex(std::string_view content, std::uint32_t byteIndex) {
        std::uint32_t logicalCount = 0;
        const std::size_t n = content.size();
        const std::size_t limit = std::min<std::size_t>(n, byteIndex);
        for (std::size_t i = 0; i < limit; ++i) {
            const unsigned char c = static_cast<unsigned char>(content[i]);
            if ((c & 0xC0) != 0x80) {
                logicalCount++;
            }
        }
        return logicalCount;
    }

    float pointToSegmentDistanceSq(float px, float py, float ax, float ay, float bx, float by) {
        const float l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
        if (l2 == 0.0f) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
        float t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
        t = std::max(0.0f, std::min(1.0f, t));
        const float ex = ax + t * (bx - ax);
        const float ey = ay + t * (by - ay);
        return (px - ex) * (px - ex) + (py - ey) * (py - ey);
    }
}

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
    entityManager_.reserve(maxRects, maxLines, maxPolylines, maxPoints);

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
    
    // Move data to EntityManager
    entityManager_.symbols = std::move(sd.symbols);
    entityManager_.nodes = std::move(sd.nodes);
    entityManager_.conduits = std::move(sd.conduits);
    entityManager_.rects = std::move(sd.rects);
    entityManager_.lines = std::move(sd.lines);
    entityManager_.polylines = std::move(sd.polylines);
    entityManager_.points = std::move(sd.points);
    
    snapshotBytes = std::move(sd.rawBytes);

    // Snapshot does not persist runtime-only styling fields; default them to stable values.
    for (auto& r : entityManager_.rects) {
        r.sr = r.r;
        r.sg = r.g;
        r.sb = r.b;
        r.sa = 1.0f;
        r.strokeEnabled = 1.0f;
        r.strokeWidthPx = 1.0f;
    }
    for (auto& l : entityManager_.lines) {
        l.r = 0.0f;
        l.g = 0.0f;
        l.b = 0.0f;
        l.a = 1.0f;
        l.enabled = 1.0f;
        l.strokeWidthPx = 1.0f;
    }
    for (auto& pl : entityManager_.polylines) {
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
    for (auto& c : entityManager_.conduits) {
        c.r = 0.0f;
        c.g = 0.0f;
        c.b = 0.0f;
        c.a = 1.0f;
        c.enabled = 1.0f;
        c.strokeWidthPx = 1.0f;
    }

    // Rebuild entity index and default draw order (snapshot does not persist these).
    entityManager_.entities.clear();
    entityManager_.drawOrderIds.clear();
    entityManager_.drawOrderIds.reserve(entityManager_.rects.size() + entityManager_.lines.size() + entityManager_.polylines.size() + entityManager_.conduits.size());
    
    for (std::uint32_t i = 0; i < entityManager_.rects.size(); i++) entityManager_.entities[entityManager_.rects[i].id] = EntityRef{EntityKind::Rect, i};
    for (std::uint32_t i = 0; i < entityManager_.lines.size(); i++) entityManager_.entities[entityManager_.lines[i].id] = EntityRef{EntityKind::Line, i};
    for (std::uint32_t i = 0; i < entityManager_.polylines.size(); i++) entityManager_.entities[entityManager_.polylines[i].id] = EntityRef{EntityKind::Polyline, i};
    for (std::uint32_t i = 0; i < entityManager_.symbols.size(); i++) entityManager_.entities[entityManager_.symbols[i].id] = EntityRef{EntityKind::Symbol, i};
    for (std::uint32_t i = 0; i < entityManager_.nodes.size(); i++) entityManager_.entities[entityManager_.nodes[i].id] = EntityRef{EntityKind::Node, i};
    for (std::uint32_t i = 0; i < entityManager_.conduits.size(); i++) entityManager_.entities[entityManager_.conduits[i].id] = EntityRef{EntityKind::Conduit, i};

    // Draw order
    entityManager_.drawOrderIds.reserve(entityManager_.entities.size());
    for (const auto& kv : entityManager_.entities) entityManager_.drawOrderIds.push_back(kv.first);
    std::sort(entityManager_.drawOrderIds.begin(), entityManager_.drawOrderIds.end());

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
        static_cast<std::uint32_t>(entityManager_.rects.size()),
        static_cast<std::uint32_t>(entityManager_.lines.size()),
        static_cast<std::uint32_t>(entityManager_.polylines.size()),
        static_cast<std::uint32_t>(entityManager_.symbols.size()),
        static_cast<std::uint32_t>(entityManager_.nodes.size()),
        static_cast<std::uint32_t>(entityManager_.conduits.size()),
        static_cast<std::uint32_t>(entityManager_.points.size()),
        static_cast<std::uint32_t>(triangleVertices.size() / 7),
        static_cast<std::uint32_t>(lineVertices.size() / 7),
        lastLoadMs,
        lastRebuildMs,
        lastApplyMs
    };
}

CadEngine::SnapResult CadEngine::snapElectrical(float x, float y, float tolerance) const noexcept {
    return engine::snapElectrical(entityManager_.entities, entityManager_.symbols, entityManager_.nodes, x, y, tolerance);
}

std::uint32_t CadEngine::pick(float x, float y, float tolerance) const noexcept {
    // Iterate draw order in reverse (top-most first)
    if (entityManager_.drawOrderIds.empty()) return 0;

    for (auto it = entityManager_.drawOrderIds.rbegin(); it != entityManager_.drawOrderIds.rend(); ++it) {
        std::uint32_t id = *it;
        auto refIt = entityManager_.entities.find(id);
        if (refIt == entityManager_.entities.end()) continue;

        EntityRef ref = refIt->second;
        bool hit = false;

        switch (ref.kind) {
            case EntityKind::Rect: {
                if (ref.index < entityManager_.rects.size()) {
                    const auto& r = entityManager_.rects[ref.index];
                    // Simple AABB check + rotation support if we had rotation in rect (but rects are AABB in this engine mostly?)
                    // RectRec: x, y, w, h.
                    // Check if point in rect.
                    // Tolerance expands the rect.
                    if (x >= r.x - tolerance && x <= r.x + r.w + tolerance &&
                        y >= r.y - tolerance && y <= r.y + r.h + tolerance) {
                        hit = true;
                    }
                }
                break;
            }
            case EntityKind::Circle: {
                if (ref.index < entityManager_.circles.size()) {
                    const auto& c = entityManager_.circles[ref.index];
                    // Dist check
                    float dx = x - c.cx;
                    float dy = y - c.cy;
                    float dist2 = dx*dx + dy*dy;
                    float r = c.rx; // Assuming circular for picking or use max axis
                    if (dist2 <= (r + tolerance) * (r + tolerance)) {
                        hit = true;
                    }
                }
                break;
            }
            case EntityKind::Line: {
                if (ref.index < entityManager_.lines.size()) {
                    const auto& l = entityManager_.lines[ref.index];
                    if (l.enabled == 0.0f) break;

                    const float sw = l.strokeWidthPx > 0.0f ? l.strokeWidthPx : 1.0f;
                    const float swWorld = sw / (viewScale > 1e-6f ? viewScale : 1.0f);
                    const float effTol = tolerance + swWorld * 0.5f;

                    if (pointToSegmentDistanceSq(x, y, l.x0, l.y0, l.x1, l.y1) <= effTol * effTol) {
                        hit = true;
                    }
                }
                break;
            }
            case EntityKind::Polyline: {
                if (ref.index < entityManager_.polylines.size()) {
                    const auto& pl = entityManager_.polylines[ref.index];
                    if (pl.enabled == 0.0f) break;

                    const float sw = pl.strokeWidthPx > 0.0f ? pl.strokeWidthPx : 1.0f;
                    const float swWorld = sw / (viewScale > 1e-6f ? viewScale : 1.0f);
                    const float effTol = tolerance + swWorld * 0.5f;
                    const float effTolSq = effTol * effTol;

                    std::uint32_t start = pl.offset;
                    std::uint32_t end = pl.offset + pl.count;
                    if (end > entityManager_.points.size()) end = static_cast<std::uint32_t>(entityManager_.points.size());

                    if (end > start + 1) {
                         for (std::uint32_t i = start; i < end - 1; ++i) {
                             const auto& p0 = entityManager_.points[i];
                             const auto& p1 = entityManager_.points[i+1];
                             if (pointToSegmentDistanceSq(x, y, p0.x, p0.y, p1.x, p1.y) <= effTolSq) {
                                 hit = true;
                                 break;
                             }
                         }
                    }
                }
                break;
            }
            default:
                break;
        }

        if (hit) return id;
    }

    return 0; // 0 is invalid ID
}

void CadEngine::clearWorld() noexcept {
    entityManager_.clear();
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
    
    // Check if it's text first, as text is managed by CadEngine/TextStore logic
    auto it = entityManager_.entities.find(id);
    if (it != entityManager_.entities.end() && it->second.kind == EntityKind::Text) {
         deleteText(id);
         return;
    }

    // Delegate to EntityManager for all geometry
    entityManager_.deleteEntity(id);
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a) {
    upsertRect(id, x, y, w, h, r, g, b, a, r, g, b, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    entityManager_.upsertRect(id, x, y, w, h, r, g, b, a, sr, sg, sb, sa, strokeEnabled, strokeWidthPx);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
    upsertLine(id, x0, y0, x1, y1, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    entityManager_.upsertLine(id, x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
    upsertPolyline(id, offset, count, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    entityManager_.upsertPolyline(id, offset, count, r, g, b, a, enabled, strokeWidthPx);
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
    entityManager_.upsertSymbol(id, symbolKey, x, y, w, h, rotation, scaleX, scaleY, connX, connY);
}

void CadEngine::upsertNode(std::uint32_t id, NodeKind kind, std::uint32_t anchorSymbolId, float x, float y) {
    renderDirty = true;
    snapshotDirty = true;
    entityManager_.upsertNode(id, kind, anchorSymbolId, x, y);
}

void CadEngine::upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId) {
    upsertConduit(id, fromNodeId, toNodeId, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertConduit(std::uint32_t id, std::uint32_t fromNodeId, std::uint32_t toNodeId, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    entityManager_.upsertConduit(id, fromNodeId, toNodeId, r, g, b, a, enabled, strokeWidthPx);
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
    entityManager_.upsertCircle(id, cx, cy, rx, ry, rot, sx, sy, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);
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
    entityManager_.upsertPolygon(id, cx, cy, rx, ry, rot, sx, sy, sides, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);
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
    entityManager_.upsertArrow(id, ax, ay, bx, by, head, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);
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
            self->entityManager_.drawOrderIds.clear();
            self->entityManager_.drawOrderIds.reserve(count);
            std::size_t o = sizeof(DrawOrderPayloadHeader);
            for (std::uint32_t i = 0; i < count; i++) {
                std::uint32_t sid;
                std::memcpy(&sid, payload + o, sizeof(std::uint32_t));
                o += sizeof(std::uint32_t);
                self->entityManager_.drawOrderIds.push_back(sid);
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

            const std::uint32_t offset = static_cast<std::uint32_t>(self->entityManager_.points.size());
            self->entityManager_.points.reserve(self->entityManager_.points.size() + count);
            std::size_t p = sizeof(PolylinePayloadHeader);
            for (std::uint32_t j = 0; j < count; j++) {
                Point2 pt;
                std::memcpy(&pt, payload + p, sizeof(Point2));
                p += sizeof(Point2);
                self->entityManager_.points.push_back(pt);
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
        case static_cast<std::uint32_t>(CommandOp::ApplyTextStyle): {
            using engine::text::ApplyTextStylePayload;
            if (payloadByteCount < engine::text::applyTextStyleHeaderBytes) {
                return EngineError::InvalidPayloadSize;
            }
            ApplyTextStylePayload p;
            std::memcpy(&p, payload, engine::text::applyTextStyleHeaderBytes);
            const std::size_t expected = engine::text::applyTextStyleHeaderBytes + p.styleParamsLen;
            if (payloadByteCount != expected) {
                return EngineError::InvalidPayloadSize;
            }
            if (id != 0 && id != p.textId) {
                return EngineError::InvalidPayloadSize;
            }
            const std::uint8_t* params = payload + engine::text::applyTextStyleHeaderBytes;
            if (!self->applyTextStyle(p, params, p.styleParamsLen)) {
                return EngineError::InvalidOperation;
            }
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextAlign): {
            if (payloadByteCount != sizeof(TextAlignmentPayload)) return EngineError::InvalidPayloadSize;
            TextAlignmentPayload p;
            std::memcpy(&p, payload, sizeof(TextAlignmentPayload));
            if (!self->setTextAlign(p.textId, static_cast<TextAlign>(p.align))) {
                return EngineError::InvalidOperation;
            }
            break;
        }
        default:
            return EngineError::UnknownCommand;
    }
    return EngineError::Ok;
}

bool CadEngine::applyTextStyle(const engine::text::ApplyTextStylePayload& payload, const std::uint8_t* params, std::uint32_t paramsLen) {
    if (!textSystem_.applyTextStyle(payload, params, paramsLen)) {
        return false;
    }
    
    // Updates are handled internally by TextSystem, but CadEngine needs to update its global state
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;
    
    return true;
}

engine::text::TextStyleSnapshot CadEngine::getTextStyleSnapshot(std::uint32_t textId) const {
    engine::text::TextStyleSnapshot out{};
    if (!textSystem_.initialized) {
        return out;
    }

    // Ensure layout is current
    const_cast<CadEngine*>(this)->textSystem_.layoutEngine.layoutDirtyTexts();

    const std::string_view content = textSystem_.store.getContent(textId);
    const auto runs = textSystem_.store.getRuns(textId);
    const auto caretOpt = textSystem_.store.getCaretState(textId);
    if (!caretOpt) {
        return out;
    }

    const TextRec* rec = textSystem_.store.getText(textId);
    if (rec) {
        out.align = static_cast<std::uint8_t>(rec->align);
    }

    auto cs = *caretOpt;
    std::uint32_t selStart = cs.selectionStart;
    std::uint32_t selEnd = cs.selectionEnd;
    if (selStart > selEnd) std::swap(selStart, selEnd);

    // Logical indices
    out.selectionStartLogical = byteToLogicalIndex(content, selStart);
    out.selectionEndLogical = byteToLogicalIndex(content, selEnd);
    out.selectionStartByte = selStart;
    out.selectionEndByte = selEnd;
    out.caretByte = cs.caretIndex;
    out.caretLogical = byteToLogicalIndex(content, cs.caretIndex);

    // Caret position (line info)
    const TextCaretPosition cp = getTextCaretPosition(textId, cs.caretIndex);
    out.x = cp.x;
    out.y = cp.y;
    out.lineHeight = cp.height;
    out.lineIndex = static_cast<std::uint16_t>(cp.lineIndex);

    // Tri-state computation
    auto triStateAttr = [&](TextStyleFlags flag) -> int {
        // Special case for caret (collapsed selection)
        if (selStart == selEnd) {
            // 1. Check for explicit zero-length run at caret (typing style)
            for (const auto& r : runs) {
                if (r.length == 0 && r.startIndex == selStart) {
                    return hasFlag(r.flags, flag) ? 1 : 0;
                }
            }
            // 2. Check for run containing caret
            for (const auto& r : runs) {
                if (selStart > r.startIndex && selStart < (r.startIndex + r.length)) {
                     return hasFlag(r.flags, flag) ? 1 : 0;
                }
                // Sticky behavior: if at end of run, usually inherit from it
                if (selStart > 0 && selStart == (r.startIndex + r.length)) {
                     return hasFlag(r.flags, flag) ? 1 : 0;
                }
            }
            return 0; // Default off
        }

        // Range selection
        int state = -1; // -1 unset, 0 off, 1 on, 2 mixed
        for (const auto& r : runs) {
            const std::uint32_t rStart = r.startIndex;
            const std::uint32_t rEnd = r.startIndex + r.length;
            const std::uint32_t oStart = std::max(rStart, selStart);
            const std::uint32_t oEnd = std::min(rEnd, selEnd);
            
            if (oStart >= oEnd) continue;
            
            const bool on = hasFlag(r.flags, flag);
            const int v = on ? 1 : 0;
            if (state == -1) state = v; else if (state != v) state = 2;
            if (state == 2) break;
        }
        if (state == -1) state = 0;
        return state;
    };

    const int boldState = triStateAttr(TextStyleFlags::Bold);
    const int italicState = triStateAttr(TextStyleFlags::Italic);
    const int underlineState = triStateAttr(TextStyleFlags::Underline);
    // Note: Engine uses 'Strike' internally but frontend maps to 'Strikethrough'. Assuming enum match or mapped correctly.
    // Check text_types.h for exact enum name. Using local usage from previous lines.
    const int strikeState = triStateAttr(TextStyleFlags::Strike);

    auto pack2bits = [](int s) -> std::uint8_t {
        switch (s) {
            case 0: return 0; // off
            case 1: return 1; // on
            case 2: return 2; // mixed
            default: return 0;
        }
    };

    out.styleTriStateFlags =
        static_cast<std::uint8_t>(
            (pack2bits(boldState) & 0x3) |
            ((pack2bits(italicState) & 0x3) << 2) |
            ((pack2bits(underlineState) & 0x3) << 4) |
            ((pack2bits(strikeState) & 0x3) << 6)
        );

    out.textGeneration = generation;
    out.styleTriStateParamsLen = 0;
    return out;
}

const SymbolRec* CadEngine::findSymbol(std::uint32_t id) const noexcept {
    const auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end()) return nullptr;
    if (it->second.kind != EntityKind::Symbol) return nullptr;
    return &entityManager_.symbols[it->second.index];
}

const NodeRec* CadEngine::findNode(std::uint32_t id) const noexcept {
    const auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end()) return nullptr;
    if (it->second.kind != EntityKind::Node) return nullptr;
    return &entityManager_.nodes[it->second.index];
}

bool CadEngine::resolveNodePosition(std::uint32_t nodeId, Point2& out) const noexcept {
    return engine::resolveNodePosition(entityManager_.entities, entityManager_.symbols, entityManager_.nodes, nodeId, out);
}

void CadEngine::compactPolylinePoints() {
    std::size_t total = 0;
    for (const auto& pl : entityManager_.polylines) total += pl.count;
    std::vector<Point2> next;
    next.reserve(total);

    for (auto& pl : entityManager_.polylines) {
        const std::uint32_t start = pl.offset;
        const std::uint32_t end = pl.offset + pl.count;
        if (end > entityManager_.points.size()) {
            pl.offset = static_cast<std::uint32_t>(next.size());
            pl.count = 0;
            continue;
        }
        pl.offset = static_cast<std::uint32_t>(next.size());
        for (std::uint32_t i = start; i < end; i++) next.push_back(entityManager_.points[i]);
    }

    entityManager_.points.swap(next);
}

void CadEngine::rebuildSnapshotBytes() const {
    engine::SnapshotData sd;
    sd.rects = entityManager_.rects;
    sd.lines = entityManager_.lines;
    sd.polylines = entityManager_.polylines;
    sd.points = entityManager_.points;
    sd.symbols = entityManager_.symbols;
    sd.nodes = entityManager_.nodes;
    sd.conduits = entityManager_.conduits;

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
        entityManager_.rects,
        entityManager_.lines,
        entityManager_.polylines,
        entityManager_.points,
        entityManager_.conduits,
        entityManager_.circles,
        entityManager_.polygons,
        entityManager_.arrows,
        entityManager_.symbols,
        entityManager_.nodes,
        entityManager_.entities,
        entityManager_.drawOrderIds,
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
    textSystem_.initialize();
    markTextQuadsDirty();
    return true;
}

bool CadEngine::loadFont(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize) {
    const std::uint8_t* fontData = reinterpret_cast<const std::uint8_t*>(fontDataPtr);
    if (!textSystem_.initialized) {
        if (!initializeTextSystem()) {
            return false;
        }
    }
    // Use registerFont to associate with specific fontId
    bool ok = textSystem_.fontManager.registerFont(fontId, fontData, dataSize, "", false, false);
    if (ok) markTextQuadsDirty();
    return ok;
}

bool CadEngine::upsertText(
    std::uint32_t id,
    const TextPayloadHeader& header,
    const TextRunPayload* runs,
    std::uint32_t runCount,
    const char* content,
    std::uint32_t contentLength
) {
    if (!textSystem_.initialized) {
        if (!initializeTextSystem()) {
            return false;
        }
    }
    
    // Register in entity map if new or replacing non-text
    auto it = entityManager_.entities.find(id);
    if (it != entityManager_.entities.end()) {
        if (it->second.kind != EntityKind::Text) {
            deleteEntity(id);
        }
    }
    
    // Use TextSystem to upsert
    if (!textSystem_.upsertText(id, header, runs, runCount, content, contentLength)) {
        return false;
    }
    
    // Ensure it's registered in global entity map (TextStore uses ID as key, so index/ref is just ID)
    entityManager_.entities[id] = EntityRef{EntityKind::Text, id};
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;
    
    return true;
}

bool CadEngine::deleteText(std::uint32_t id) {
    auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end() || it->second.kind != EntityKind::Text) {
        return false;
    }
    
    // Use TextSystem to delete
    textSystem_.deleteText(id);
    
    // Remove from entity map
    entityManager_.entities.erase(it);
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;
    
    return true;
}

void CadEngine::setTextCaret(std::uint32_t textId, std::uint32_t caretIndex) {
    textSystem_.store.setCaret(textId, caretIndex);
}

void CadEngine::setTextSelection(std::uint32_t textId, std::uint32_t selectionStart, std::uint32_t selectionEnd) {
    textSystem_.store.setSelection(textId, selectionStart, selectionEnd);
}

bool CadEngine::insertTextContent(
    std::uint32_t textId,
    std::uint32_t insertIndex,
    const char* content,
    std::uint32_t byteLength
) {
    if (!textSystem_.insertContent(textId, insertIndex, content, byteLength)) {
        return false;
    }
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;
    
    return true;
}

bool CadEngine::deleteTextContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex) {
    if (!textSystem_.deleteContent(textId, startIndex, endIndex)) {
        return false;
    }
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;
    
    return true;
}

bool CadEngine::setTextAlign(std::uint32_t textId, TextAlign align) {
    if (!textSystem_.setTextAlign(textId, align)) {
        return false;
    }

    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    return true;
}

bool CadEngine::setTextConstraintWidth(std::uint32_t textId, float width) {
    if (!textSystem_.initialized) return false;

    if (!textSystem_.store.setConstraintWidth(textId, width)) {
        return false;
    }

    // Re-layout immediately to ensure up-to-date bounds
    textSystem_.layoutEngine.layoutText(textId);

    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    return true;
}

bool CadEngine::setTextPosition(std::uint32_t textId, float x, float y, TextBoxMode boxMode, float constraintWidth) {
    if (!textSystem_.initialized) return false;

    TextRec* rec = textSystem_.store.getTextMutable(textId);
    if (!rec) {
        return false;
    }

    rec->x = x;
    rec->y = y;
    rec->boxMode = boxMode;
    if (boxMode == TextBoxMode::FixedWidth) {
        rec->constraintWidth = constraintWidth;
    }

    // Mark dirty so layout refreshes bounds (min/max) and quads rebuild at new origin.
    textSystem_.store.markDirty(textId);

    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    return true;
}

TextHitResult CadEngine::hitTestText(std::uint32_t textId, float localX, float localY) const {
    if (!textSystem_.initialized) {
        return TextHitResult{0, 0, true};
    }
    return textSystem_.layoutEngine.hitTest(textId, localX, localY);
}

TextCaretPosition CadEngine::getTextCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!textSystem_.initialized) {
        return TextCaretPosition{0.0f, 0.0f, 0.0f, 0};
    }
    return textSystem_.layoutEngine.getCaretPosition(textId, charIndex);
}

bool CadEngine::getTextBounds(std::uint32_t textId, float& outMinX, float& outMinY, float& outMaxX, float& outMaxY) const {
    // Ensure layout is up-to-date before returning bounds
    // Note: This is safe even if text wasn't dirty (no-op in that case)
    const_cast<CadEngine*>(this)->textSystem_.layoutEngine.layoutDirtyTexts();
    
    const TextRec* text = textSystem_.store.getText(textId);
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
    textSystem_.rebuildQuadBuffer();
}

CadEngine::BufferMeta CadEngine::getTextQuadBufferMeta() const noexcept {
    constexpr std::size_t floatsPerVertex = 9; // x, y, z, u, v, r, g, b, a
    return buildMeta(textSystem_.quadBuffer, floatsPerVertex);
}

CadEngine::TextureBufferMeta CadEngine::getAtlasTextureMeta() const noexcept {
    if (!textSystem_.initialized) {
        return TextureBufferMeta{0, 0, 0, 0, 0};
    }
    return TextureBufferMeta{
        textSystem_.glyphAtlas.getVersion(),
        textSystem_.glyphAtlas.getWidth(),
        textSystem_.glyphAtlas.getHeight(),
        static_cast<std::uint32_t>(textSystem_.glyphAtlas.getTextureDataSize()),
        reinterpret_cast<std::uintptr_t>(textSystem_.glyphAtlas.getTextureData())
    };
}

bool CadEngine::isAtlasDirty() const noexcept {
    if (!textSystem_.initialized) return false;
    return textSystem_.glyphAtlas.isDirty();
}

void CadEngine::clearAtlasDirty() {
    textSystem_.clearAtlasDirty();
}

CadEngine::TextContentMeta CadEngine::getTextContentMeta(std::uint32_t textId) const noexcept {
    if (!textSystem_.initialized) {
        return TextContentMeta{0, 0, false};
    }
    
    std::string_view content = textSystem_.store.getContent(textId);
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
    if (!textSystem_.initialized) {
        return {};
    }
    // Ensure layout is up to date since this might be called right after input/styling
    const_cast<CadEngine*>(this)->textSystem_.layoutEngine.layoutDirtyTexts();
    return textSystem_.layoutEngine.getSelectionRects(textId, start, end);
}

std::uint32_t CadEngine::getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getVisualPrevCharIndex(textId, charIndex);
}

std::uint32_t CadEngine::getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getVisualNextCharIndex(textId, charIndex);
}

std::uint32_t CadEngine::getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getWordLeftIndex(textId, charIndex);
}

std::uint32_t CadEngine::getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getWordRightIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineStartIndex(textId, charIndex);
}


std::uint32_t CadEngine::getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineEndIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineUpIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineDownIndex(textId, charIndex);
}
