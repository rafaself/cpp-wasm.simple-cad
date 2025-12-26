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
    entityManager_.rects = std::move(sd.rects);
    entityManager_.lines = std::move(sd.lines);
    entityManager_.polylines = std::move(sd.polylines);
    entityManager_.points = std::move(sd.points);
    // Ignore electrical entities from snapshot if any (symbols, nodes, conduits)
    
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

    // Rebuild entity index and default draw order (snapshot does not persist these).
    entityManager_.entities.clear();
    entityManager_.drawOrderIds.clear();
    entityManager_.drawOrderIds.reserve(entityManager_.rects.size() + entityManager_.lines.size() + entityManager_.polylines.size());
    
    for (std::uint32_t i = 0; i < entityManager_.rects.size(); i++) entityManager_.entities[entityManager_.rects[i].id] = EntityRef{EntityKind::Rect, i};
    for (std::uint32_t i = 0; i < entityManager_.lines.size(); i++) entityManager_.entities[entityManager_.lines[i].id] = EntityRef{EntityKind::Line, i};
    for (std::uint32_t i = 0; i < entityManager_.polylines.size(); i++) entityManager_.entities[entityManager_.polylines[i].id] = EntityRef{EntityKind::Polyline, i};

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
        static_cast<std::uint32_t>(entityManager_.points.size()),
        static_cast<std::uint32_t>(triangleVertices.size() / 7),
        static_cast<std::uint32_t>(lineVertices.size() / 7),
        lastLoadMs,
        lastRebuildMs,
        lastApplyMs
    };
}

std::uint32_t CadEngine::pick(float x, float y, float tolerance) const noexcept {
    return pickSystem_.pick(x, y, tolerance, viewScale, entityManager_, textSystem_);
}

PickResult CadEngine::pickEx(float x, float y, float tolerance, std::uint32_t pickMask) const noexcept {
    return pickSystem_.pickEx(x, y, tolerance, viewScale, pickMask, entityManager_, textSystem_);
}

namespace {
    constexpr float kPi = 3.14159265358979323846f;
    constexpr float kTwoPi = 2.0f * kPi;

    inline bool aabbIntersects(const AABB& a, const AABB& b) {
        if (a.maxX < b.minX) return false;
        if (a.minX > b.maxX) return false;
        if (a.maxY < b.minY) return false;
        if (a.minY > b.maxY) return false;
        return true;
    }

    inline bool aabbInside(const AABB& a, const AABB& container) {
        return a.minX >= container.minX && a.maxX <= container.maxX && a.minY >= container.minY && a.maxY <= container.maxY;
    }

    inline bool segmentIntersectsAabb(float x0, float y0, float x1, float y1, const AABB& r) {
        // Liang–Barsky line clipping for AABB intersection.
        float t0 = 0.0f;
        float t1 = 1.0f;
        const float dx = x1 - x0;
        const float dy = y1 - y0;

        auto clip = [&](float p, float q) -> bool {
            if (p == 0.0f) return q >= 0.0f;
            const float t = q / p;
            if (p < 0.0f) {
                if (t > t1) return false;
                if (t > t0) t0 = t;
            } else {
                if (t < t0) return false;
                if (t < t1) t1 = t;
            }
            return true;
        };

        if (!clip(-dx, x0 - r.minX)) return false;
        if (!clip( dx, r.maxX - x0)) return false;
        if (!clip(-dy, y0 - r.minY)) return false;
        if (!clip( dy, r.maxY - y0)) return false;
        return t0 <= t1;
    }

    inline AABB rectAabbExact(const RectRec& r) {
        return { r.x, r.y, r.x + r.w, r.y + r.h };
    }

    inline AABB ellipseAabbTight(const CircleRec& c) {
        const float rx = std::abs(c.rx * c.sx);
        const float ry = std::abs(c.ry * c.sy);
        const float rot = c.rot;
        const float cosR = rot ? std::cos(rot) : 1.0f;
        const float sinR = rot ? std::sin(rot) : 0.0f;
        const float ex = std::sqrt(rx * rx * cosR * cosR + ry * ry * sinR * sinR);
        const float ey = std::sqrt(rx * rx * sinR * sinR + ry * ry * cosR * cosR);
        return { c.cx - ex, c.cy - ey, c.cx + ex, c.cy + ey };
    }

    inline AABB polygonAabbTight(const PolygonRec& p) {
        const std::uint32_t sides = std::min<std::uint32_t>(1024u, std::max<std::uint32_t>(3u, p.sides));
        const float rot = p.rot;
        const float cosR = rot ? std::cos(rot) : 1.0f;
        const float sinR = rot ? std::sin(rot) : 0.0f;

        float minX = std::numeric_limits<float>::infinity();
        float minY = std::numeric_limits<float>::infinity();
        float maxX = -std::numeric_limits<float>::infinity();
        float maxY = -std::numeric_limits<float>::infinity();

        for (std::uint32_t i = 0; i < sides; i++) {
            const float t = (static_cast<float>(i) / static_cast<float>(sides)) * kTwoPi - kPi * 0.5f;
            const float dx = std::cos(t) * p.rx * p.sx;
            const float dy = std::sin(t) * p.ry * p.sy;
            const float x = p.cx + dx * cosR - dy * sinR;
            const float y = p.cy + dx * sinR + dy * cosR;
            minX = std::min(minX, x);
            minY = std::min(minY, y);
            maxX = std::max(maxX, x);
            maxY = std::max(maxY, y);
        }

        if (!std::isfinite(minX) || !std::isfinite(minY) || !std::isfinite(maxX) || !std::isfinite(maxY)) {
            return { p.cx, p.cy, p.cx, p.cy };
        }
        return { minX, minY, maxX, maxY };
    }
}

std::vector<std::uint32_t> CadEngine::queryMarquee(float minX, float minY, float maxX, float maxY, int mode) const {
    const AABB sel{
        std::min(minX, maxX),
        std::min(minY, maxY),
        std::max(minX, maxX),
        std::max(minY, maxY),
    };

    std::vector<std::uint32_t> candidates;
    pickSystem_.queryArea(sel, candidates);
    if (candidates.empty()) return {};

    std::vector<std::uint32_t> out;
    out.reserve(candidates.size());

    const bool window = mode == 0;

    for (const std::uint32_t id : candidates) {
        const auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        bool hit = false;
        switch (it->second.kind) {
            case EntityKind::Rect: {
                if (it->second.index >= entityManager_.rects.size()) break;
                const RectRec& r = entityManager_.rects[it->second.index];
                const AABB aabb = rectAabbExact(r);
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            case EntityKind::Circle: {
                if (it->second.index >= entityManager_.circles.size()) break;
                const CircleRec& c = entityManager_.circles[it->second.index];
                const AABB aabb = ellipseAabbTight(c);
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            case EntityKind::Polygon: {
                if (it->second.index >= entityManager_.polygons.size()) break;
                const PolygonRec& p = entityManager_.polygons[it->second.index];
                const AABB aabb = polygonAabbTight(p);
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            case EntityKind::Line: {
                if (it->second.index >= entityManager_.lines.size()) break;
                const LineRec& l = entityManager_.lines[it->second.index];
                if (window) {
                    hit = aabbInside(PickSystem::computeLineAABB(l), sel);
                } else {
                    hit = segmentIntersectsAabb(l.x0, l.y0, l.x1, l.y1, sel);
                }
                break;
            }
            case EntityKind::Polyline: {
                if (it->second.index >= entityManager_.polylines.size()) break;
                const PolyRec& pl = entityManager_.polylines[it->second.index];
                if (pl.count < 2) break;
                const std::uint32_t start = pl.offset;
                const std::uint32_t end = pl.offset + pl.count;
                if (end > entityManager_.points.size()) break;

                const AABB aabb = PickSystem::computePolylineAABB(pl, entityManager_.points);
                if (window) {
                    hit = aabbInside(aabb, sel);
                } else {
                    // CROSSING: true if any segment intersects selection rect.
                    for (std::uint32_t i = start; i + 1 < end; i++) {
                        const Point2& p0 = entityManager_.points[i];
                        const Point2& p1 = entityManager_.points[i + 1];
                        if (segmentIntersectsAabb(p0.x, p0.y, p1.x, p1.y, sel)) {
                            hit = true;
                            break;
                        }
                    }
                }
                break;
            }
            case EntityKind::Arrow: {
                if (it->second.index >= entityManager_.arrows.size()) break;
                const ArrowRec& a = entityManager_.arrows[it->second.index];
                if (window) {
                    hit = aabbInside(PickSystem::computeArrowAABB(a), sel);
                } else {
                    hit = segmentIntersectsAabb(a.ax, a.ay, a.bx, a.by, sel);
                }
                break;
            }
            case EntityKind::Text: {
                const TextRec* tr = textSystem_.store.getText(id);
                if (!tr) break;
                const AABB aabb{ tr->minX, tr->minY, tr->maxX, tr->maxY };
                hit = window ? aabbInside(aabb, sel) : aabbIntersects(aabb, sel);
                break;
            }
            default:
                break;
        }

        if (hit) out.push_back(id);
    }

    return out;
}

void CadEngine::clearWorld() noexcept {
    entityManager_.clear();
    pickSystem_.clear();
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
    
    pickSystem_.remove(id);

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
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertRect(id, x, y, w, h, r, g, b, a, sr, sg, sb, sa, strokeEnabled, strokeWidthPx);

    RectRec rec; rec.x = x; rec.y = y; rec.w = w; rec.h = h;
    pickSystem_.update(id, PickSystem::computeRectAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
    upsertLine(id, x0, y0, x1, y1, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertLine(id, x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx);

    LineRec rec; rec.x0 = x0; rec.y0 = y0; rec.x1 = x1; rec.y1 = y1;
    pickSystem_.update(id, PickSystem::computeLineAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
    upsertPolyline(id, offset, count, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertPolyline(id, offset, count, r, g, b, a, enabled, strokeWidthPx);

    PolyRec rec; rec.offset = offset; rec.count = count;
    pickSystem_.update(id, PickSystem::computePolylineAABB(rec, entityManager_.points));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
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
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertCircle(id, cx, cy, rx, ry, rot, sx, sy, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);

    CircleRec rec; rec.cx = cx; rec.cy = cy; rec.rx = rx; rec.ry = ry;
    pickSystem_.update(id, PickSystem::computeCircleAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
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
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertPolygon(id, cx, cy, rx, ry, rot, sx, sy, sides, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);

    PolygonRec rec; rec.cx = cx; rec.cy = cy; rec.rx = rx; rec.ry = ry; rec.rot = rot;
    pickSystem_.update(id, PickSystem::computePolygonAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
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
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertArrow(id, ax, ay, bx, by, head, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);

    ArrowRec rec; rec.ax = ax; rec.ay = ay; rec.bx = bx; rec.by = by; rec.head = head;
    pickSystem_.update(id, PickSystem::computeArrowAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
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
            self->pickSystem_.setDrawOrder(self->entityManager_.drawOrderIds);
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

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(payload.textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(payload.textId, {minX, minY, maxX, maxY});
    }
    
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
void CadEngine::compactPolylinePoints() {
    entityManager_.compactPolylinePoints();
}

void CadEngine::rebuildSnapshotBytes() const {
    engine::SnapshotData sd;
    sd.rects = entityManager_.rects;
    sd.lines = entityManager_.lines;
    sd.polylines = entityManager_.polylines;
    sd.points = entityManager_.points;

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
        entityManager_.circles,
        entityManager_.polygons,
        entityManager_.arrows,
        entityManager_.entities,
        entityManager_.drawOrderIds,
        viewScale,
        triangleVertices,
        lineVertices,
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
    bool isNew = (it == entityManager_.entities.end());
    if (!isNew && it->second.kind != EntityKind::Text) {
        deleteEntity(id);
        isNew = true;
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

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(id, minX, minY, maxX, maxY)) {
        pickSystem_.update(id, {minX, minY, maxX, maxY});
    }
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    
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

    pickSystem_.remove(id);

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
    
    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }

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

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    
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

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }

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

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }

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

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }

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

// ==============================================================================
// Interaction Session Implementation
// ==============================================================================

void CadEngine::beginTransform(
    const std::uint32_t* ids, 
    std::uint32_t idCount, 
    TransformMode mode, 
    std::uint32_t specificId, 
    int32_t vertexIndex, 
    float startX, 
    float startY
) {
    // 1. Reset Session
    session_ = InteractionSession{};
    session_.active = true;
    session_.mode = mode;
    session_.specificId = specificId;
    session_.vertexIndex = vertexIndex;
    session_.startX = startX;
    session_.startY = startY;

    // 2. Capture Snapshots
    session_.initialIds.reserve(idCount);
    session_.snapshots.reserve(idCount);

    for (std::uint32_t i = 0; i < idCount; i++) {
        std::uint32_t id = ids[i];
        session_.initialIds.push_back(id);

        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue; // Should not happen in valid flow

	        TransformSnapshot snap;
	        snap.id = id;
	        snap.x = 0.0f;
	        snap.y = 0.0f;
	        snap.w = 0.0f;
	        snap.h = 0.0f;
	        
	        // Capture based on entity type
	        if (it->second.kind == EntityKind::Rect) {
	            for (const auto& r : entityManager_.rects) {
	                if (r.id == id) {
	                    snap.x = r.x;
	                    snap.y = r.y;
	                    snap.w = r.w;
	                    snap.h = r.h;
	                    break;
	                }
	            }
	        } else if (it->second.kind == EntityKind::Circle) {
	             for (const auto& c : entityManager_.circles) {
	                if (c.id == id) {
	                    snap.x = c.cx;
	                    snap.y = c.cy;
	                    snap.w = c.rx;
	                    snap.h = c.ry;
	                    break;
	                }
	            }
	        } else if (it->second.kind == EntityKind::Polygon) {
	             for (const auto& p : entityManager_.polygons) {
	                if (p.id == id) {
	                    snap.x = p.cx;
	                    snap.y = p.cy;
	                    snap.w = p.rx;
	                    snap.h = p.ry;
	                    break;
	                }
	            }
        } else if (it->second.kind == EntityKind::Text) {
             // Text handled via TextStore
             const TextRec* tr = textSystem_.store.getText(id);
             if (tr) {
                 snap.x = tr->x;
                 snap.y = tr->y;
             }
        } else if (it->second.kind == EntityKind::Line) {
            for (const auto& l : entityManager_.lines) {
                 if (l.id == id) {
                     snap.points.push_back({l.x0, l.y0});
                     snap.points.push_back({l.x1, l.y1});
                     break;
                 }
            }
        } else if (it->second.kind == EntityKind::Polyline) {
             for (const auto& pl : entityManager_.polylines) {
                 if (pl.id == id) {
                     for (std::uint32_t k = 0; k < pl.count; k++) {
                         if (pl.offset + k < entityManager_.points.size()) {
                             snap.points.push_back(entityManager_.points[pl.offset + k]);
                         }
                     }
                     break;
                 }
             }
        } else if (it->second.kind == EntityKind::Arrow) {
             for (const auto& a : entityManager_.arrows) {
                if (a.id == id) {
                    snap.points.push_back({a.ax, a.ay});
                    snap.points.push_back({a.bx, a.by});
                    break;
                }
             }
        }

        session_.snapshots.push_back(std::move(snap));
    }
}

void CadEngine::updateTransform(float worldX, float worldY) {
    if (!session_.active) return;
    
    float totalDx = worldX - session_.startX;
    float totalDy = worldY - session_.startY;
    
    if (session_.mode == TransformMode::Move) {
        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            
             auto it = entityManager_.entities.find(id);
             if (it == entityManager_.entities.end()) continue;
             
             if (it->second.kind == EntityKind::Rect) {
                  for (auto& r : entityManager_.rects) { if (r.id == id) { r.x = snap.x + totalDx; r.y = snap.y + totalDy; break; } }
             } else if (it->second.kind == EntityKind::Circle) {
                  for (auto& c : entityManager_.circles) { if (c.id == id) { c.cx = snap.x + totalDx; c.cy = snap.y + totalDy; break; } }
             } else if (it->second.kind == EntityKind::Polygon) {
                  for (auto& p : entityManager_.polygons) { if (p.id == id) { p.cx = snap.x + totalDx; p.cy = snap.y + totalDy; break; } }
             } else if (it->second.kind == EntityKind::Text) {
                  TextRec* tr = textSystem_.store.getTextMutable(id); 
                  if (tr) {
                       tr->x = snap.x + totalDx;
                       tr->y = snap.y + totalDy;
                       textQuadsDirty_ = true;
                       float minX, minY, maxX, maxY;
                       if (textSystem_.getBounds(id, minX, minY, maxX, maxY)) {
                           pickSystem_.update(id, {minX, minY, maxX, maxY});
                       }
                   }
             } else if (it->second.kind == EntityKind::Line) {
                 if (snap.points.size() >= 2) {
                     for (auto& l : entityManager_.lines) { 
                         if (l.id == id) { 
                             l.x0 = snap.points[0].x + totalDx; 
                             l.y0 = snap.points[0].y + totalDy; 
                             l.x1 = snap.points[1].x + totalDx; 
                             l.y1 = snap.points[1].y + totalDy; 
                             break; 
                         } 
                     }
                 }
             } else if (it->second.kind == EntityKind::Arrow) {
                 if (snap.points.size() >= 2) {
                    for (auto& a : entityManager_.arrows) {
                        if (a.id == id) {
                            a.ax = snap.points[0].x + totalDx;
                            a.ay = snap.points[0].y + totalDy;
                            a.bx = snap.points[1].x + totalDx;
                            a.by = snap.points[1].y + totalDy;
                            break;
                        }
                    }
                 }
             } else if (it->second.kind == EntityKind::Polyline) {
                 for (auto& pl : entityManager_.polylines) {
                     if (pl.id == id) {
                         for (std::uint32_t k = 0; k < pl.count && k < snap.points.size(); k++) {
                             if (pl.offset + k < entityManager_.points.size()) {
                                 entityManager_.points[pl.offset + k].x = snap.points[k].x + totalDx;
                                 entityManager_.points[pl.offset + k].y = snap.points[k].y + totalDy;
                             }
                         }
                         break;
                     }
                 }
             }
        }
	    } else if (session_.mode == TransformMode::VertexDrag) {
	        std::uint32_t id = session_.specificId;
	        int32_t idx = session_.vertexIndex;
        
        const TransformSnapshot* snap = nullptr;
        for (const auto& s : session_.snapshots) { if (s.id == id) { snap = &s; break; } }
        
        if (snap && idx >= 0) {
             auto it = entityManager_.entities.find(id);
             if (it != entityManager_.entities.end()) {
                 if (it->second.kind == EntityKind::Polyline) {
                      for (auto& pl : entityManager_.polylines) {
                          if (pl.id == id) {
                              if (static_cast<std::uint32_t>(idx) < pl.count && static_cast<std::uint32_t>(idx) < snap->points.size()) {
                                  float nx = snap->points[idx].x + totalDx;
                                  float ny = snap->points[idx].y + totalDy;
                                  entityManager_.points[pl.offset + idx].x = nx;
                                  entityManager_.points[pl.offset + idx].y = ny;
                              }
                              break;
                          }
                      }
                 } else if (it->second.kind == EntityKind::Line) {
                      for (auto& l : entityManager_.lines) {
                          if (l.id == id) {
                              if (idx == 0 && snap->points.size() > 0) {
                                  l.x0 = snap->points[0].x + totalDx;
                                  l.y0 = snap->points[0].y + totalDy;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  l.x1 = snap->points[1].x + totalDx;
                                  l.y1 = snap->points[1].y + totalDy;
                              }
                              break;
                          }
                      }
                 } else if (it->second.kind == EntityKind::Arrow) {
                      for (auto& a : entityManager_.arrows) {
                          if (a.id == id) {
                              if (idx == 0 && snap->points.size() > 0) {
                                  a.ax = snap->points[0].x + totalDx;
                                  a.ay = snap->points[0].y + totalDy;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  a.bx = snap->points[1].x + totalDx;
                                  a.by = snap->points[1].y + totalDy;
                              }
                              break;
                          }
                      }
                 }
	             }
	        }
	    }
	    else if (session_.mode == TransformMode::Resize) {
	        std::uint32_t id = session_.specificId;
	        const int32_t handleIndex = session_.vertexIndex;

	        const TransformSnapshot* snap = nullptr;
	        for (const auto& s : session_.snapshots) {
	            if (s.id == id) { snap = &s; break; }
	        }

	        if (!snap || handleIndex < 0 || handleIndex > 3) {
	            renderDirty = true;
	            snapshotDirty = true;
	            return;
	        }

	        auto it = entityManager_.entities.find(id);
	        if (it == entityManager_.entities.end()) {
	            renderDirty = true;
	            snapshotDirty = true;
	            return;
	        }

	        // Compute original AABB from snapshot (in world space).
	        float origMinX = 0.0f, origMinY = 0.0f, origMaxX = 0.0f, origMaxY = 0.0f;
	        if (it->second.kind == EntityKind::Rect) {
	            origMinX = snap->x;
	            origMinY = snap->y;
	            origMaxX = snap->x + snap->w;
	            origMaxY = snap->y + snap->h;
	        } else if (it->second.kind == EntityKind::Circle || it->second.kind == EntityKind::Polygon) {
	            // Snapshot stores rx/ry in w/h for circles/polygons.
	            origMinX = snap->x - snap->w;
	            origMaxX = snap->x + snap->w;
	            origMinY = snap->y - snap->h;
	            origMaxY = snap->y + snap->h;
	        } else {
	            renderDirty = true;
	            snapshotDirty = true;
	            return;
	        }

	        // Handle index order matches frontend (geometry.ts): 0=BL, 1=BR, 2=TR, 3=TL
	        float anchorX = 0.0f, anchorY = 0.0f;
	        switch (handleIndex) {
	            case 0: anchorX = origMaxX; anchorY = origMaxY; break; // BL -> anchor TR
	            case 1: anchorX = origMinX; anchorY = origMaxY; break; // BR -> anchor TL
	            case 2: anchorX = origMinX; anchorY = origMinY; break; // TR -> anchor BL
	            case 3: anchorX = origMaxX; anchorY = origMinY; break; // TL -> anchor BR
	            default: break;
	        }

	        const float minX = std::min(anchorX, worldX);
	        const float maxX = std::max(anchorX, worldX);
	        const float minY = std::min(anchorY, worldY);
	        const float maxY = std::max(anchorY, worldY);

	        const float w = std::max(1e-3f, maxX - minX);
	        const float h = std::max(1e-3f, maxY - minY);

	        if (it->second.kind == EntityKind::Rect) {
	            for (auto& r : entityManager_.rects) {
	                if (r.id != id) continue;
	                r.x = minX;
	                r.y = minY;
	                r.w = w;
	                r.h = h;
	                pickSystem_.update(id, PickSystem::computeRectAABB(r));
	                break;
	            }
	        } else if (it->second.kind == EntityKind::Circle) {
	            for (auto& c : entityManager_.circles) {
	                if (c.id != id) continue;
	                c.cx = (minX + maxX) * 0.5f;
	                c.cy = (minY + maxY) * 0.5f;
	                c.rx = w * 0.5f;
	                c.ry = h * 0.5f;
	                pickSystem_.update(id, PickSystem::computeCircleAABB(c));
	                break;
	            }
	        } else if (it->second.kind == EntityKind::Polygon) {
	            for (auto& p : entityManager_.polygons) {
	                if (p.id != id) continue;
	                p.cx = (minX + maxX) * 0.5f;
	                p.cy = (minY + maxY) * 0.5f;
	                p.rx = w * 0.5f;
	                p.ry = h * 0.5f;
	                pickSystem_.update(id, PickSystem::computePolygonAABB(p));
	                break;
	            }
	        }
	    }

	    renderDirty = true;
	    snapshotDirty = true;
	}

void CadEngine::commitTransform() {
    if (!session_.active) return;
    
    commitResultIds.clear();
    commitResultOpCodes.clear();
    commitResultPayloads.clear();
    
    std::uint32_t n = static_cast<std::uint32_t>(session_.snapshots.size());
    commitResultIds.reserve(n);
    commitResultOpCodes.reserve(n);
    commitResultPayloads.reserve(n * 4);
    
    if (session_.mode == TransformMode::Move) {
        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            float curX = 0, curY = 0;
            auto it = entityManager_.entities.find(id);
             if (it == entityManager_.entities.end()) continue;
             
             if (it->second.kind == EntityKind::Rect) {
                  for (auto& r : entityManager_.rects) { if (r.id == id) { curX = r.x; curY = r.y; break; } }
             } else if (it->second.kind == EntityKind::Circle) {
                  for (auto& c : entityManager_.circles) { if (c.id == id) { curX = c.cx; curY = c.cy; break; } }
             } else if (it->second.kind == EntityKind::Text) {
                  const TextRec* tr = textSystem_.store.getText(id); if (tr) { curX = tr->x; curY = tr->y; }
             } else if (it->second.kind == EntityKind::Polygon) {
                   for (auto& p : entityManager_.polygons) { if (p.id == id) { curX = p.cx; curY = p.cy; break; } }
             } else if (it->second.kind == EntityKind::Line) {
                 for (auto& l : entityManager_.lines) { if (l.id == id) { curX = l.x0; curY = l.y0; break; } }
             } else if (it->second.kind == EntityKind::Arrow) {
                  for (auto& a : entityManager_.arrows) { if (a.id == id) { curX = a.ax; curY = a.ay; break; } }
             } else if (it->second.kind == EntityKind::Polyline) {
                  for (auto& pl : entityManager_.polylines) { 
                      if (pl.id == id && pl.count > 0) { 
                          curX = entityManager_.points[pl.offset].x; 
                          curY = entityManager_.points[pl.offset].y; 
                          break; 
                      } 
                  }
             }

             float origX = 0, origY = 0;
             if (snap.points.empty()) {
                  origX = snap.x; origY = snap.y;
             } else {
                  origX = snap.points[0].x; origY = snap.points[0].y;
             }
             
             float dx = curX - origX;
             float dy = curY - origY;
             
             commitResultIds.push_back(id);
             commitResultOpCodes.push_back(static_cast<uint8_t>(TransformOpCode::MOVE));
             commitResultPayloads.push_back(dx);
             commitResultPayloads.push_back(dy);
             commitResultPayloads.push_back(0.0f);
             commitResultPayloads.push_back(0.0f);
        }
    } else if (session_.mode == TransformMode::VertexDrag) {
        std::uint32_t id = session_.specificId;
        int32_t idx = session_.vertexIndex;
        float cx = 0, cy = 0;
        bool found = false;
        
         auto it = entityManager_.entities.find(id);
         if (it != entityManager_.entities.end()) {
             if (it->second.kind == EntityKind::Polyline) {
                   for (const auto& pl : entityManager_.polylines) {
                       if (pl.id == id) {
                           if (idx >= 0 && static_cast<std::uint32_t>(idx) < pl.count) {
                               cx = entityManager_.points[pl.offset + idx].x;
                               cy = entityManager_.points[pl.offset + idx].y;
                               found = true;
                           }
                           break;
                       }
                   }
             } else if (it->second.kind == EntityKind::Line) {
                  for (const auto& l : entityManager_.lines) {
                      if (l.id == id) {
                          if (idx == 0) { cx = l.x0; cy = l.y0; found = true; }
                          else if (idx == 1) { cx = l.x1; cy = l.y1; found = true; }
                          break;
                      }
                  }
             } else if (it->second.kind == EntityKind::Arrow) {
                   for (const auto& a : entityManager_.arrows) {
                      if (a.id == id) {
                          if (idx == 0) { cx = a.ax; cy = a.ay; found = true; }
                          else if (idx == 1) { cx = a.bx; cy = a.by; found = true; }
                          break;
                      }
                  }
             }
         }
         
	         if (found) {
	             commitResultIds.push_back(id);
	             commitResultOpCodes.push_back(static_cast<uint8_t>(TransformOpCode::VERTEX_SET));
	             commitResultPayloads.push_back(static_cast<float>(idx));
	             commitResultPayloads.push_back(cx);
	             commitResultPayloads.push_back(cy);
	             commitResultPayloads.push_back(0.0f);
	         }
	    } else if (session_.mode == TransformMode::Resize) {
	        for (const auto& snap : session_.snapshots) {
	            const std::uint32_t id = snap.id;
	            auto it = entityManager_.entities.find(id);
	            if (it == entityManager_.entities.end()) continue;

	            float outX = 0.0f;
	            float outY = 0.0f;
	            float outW = 0.0f;
	            float outH = 0.0f;
	            bool found = false;

	            if (it->second.kind == EntityKind::Rect) {
	                for (const auto& r : entityManager_.rects) {
	                    if (r.id != id) continue;
	                    outX = r.x;
	                    outY = r.y;
	                    outW = r.w;
	                    outH = r.h;
	                    found = true;
	                    break;
	                }
	            } else if (it->second.kind == EntityKind::Circle) {
	                for (const auto& c : entityManager_.circles) {
	                    if (c.id != id) continue;
	                    outX = c.cx;
	                    outY = c.cy;
	                    outW = c.rx * 2.0f;
	                    outH = c.ry * 2.0f;
	                    found = true;
	                    break;
	                }
	            } else if (it->second.kind == EntityKind::Polygon) {
	                for (const auto& p : entityManager_.polygons) {
	                    if (p.id != id) continue;
	                    outX = p.cx;
	                    outY = p.cy;
	                    outW = p.rx * 2.0f;
	                    outH = p.ry * 2.0f;
	                    found = true;
	                    break;
	                }
	            }

	            if (!found) continue;

	            commitResultIds.push_back(id);
	            commitResultOpCodes.push_back(static_cast<uint8_t>(TransformOpCode::RESIZE));
	            commitResultPayloads.push_back(outX);
	            commitResultPayloads.push_back(outY);
	            commitResultPayloads.push_back(outW);
	            commitResultPayloads.push_back(outH);
	        }
	    }

	    session_ = InteractionSession{};
	}

void CadEngine::cancelTransform() {
    if (!session_.active) return;
    
    for (const auto& snap : session_.snapshots) {
        std::uint32_t id = snap.id;
         auto it = entityManager_.entities.find(id);
         if (it == entityManager_.entities.end()) continue;
         
         if (it->second.kind == EntityKind::Rect) {
             for (auto& r : entityManager_.rects) {
                 if (r.id == id) {
                     r.x = snap.x;
                     r.y = snap.y;
                     r.w = snap.w;
                     r.h = snap.h;
                     pickSystem_.update(id, PickSystem::computeRectAABB(r));
                     break;
                 }
             }
         } else if (it->second.kind == EntityKind::Circle) {
              for (auto& c : entityManager_.circles) {
                  if (c.id == id) {
                      c.cx = snap.x;
                      c.cy = snap.y;
                      c.rx = snap.w;
                      c.ry = snap.h;
                      pickSystem_.update(id, PickSystem::computeCircleAABB(c));
                      break;
                  }
              }
         } else if (it->second.kind == EntityKind::Polygon) {
              for (auto& p : entityManager_.polygons) {
                  if (p.id == id) {
                      p.cx = snap.x;
                      p.cy = snap.y;
                      p.rx = snap.w;
                      p.ry = snap.h;
                      pickSystem_.update(id, PickSystem::computePolygonAABB(p));
                      break;
                  }
              }
         } else if (it->second.kind == EntityKind::Text) {
             TextRec* tr = textSystem_.store.getTextMutable(id);
             if (tr) {
                 tr->x = snap.x;
                 tr->y = snap.y;
                 textQuadsDirty_ = true;
                 float minX, minY, maxX, maxY;
                 if (textSystem_.getBounds(id, minX, minY, maxX, maxY)) {
                     pickSystem_.update(id, {minX, minY, maxX, maxY});
                 }
             }
         } else if (it->second.kind == EntityKind::Polyline) {
             for (auto& pl : entityManager_.polylines) {
                 if (pl.id == id) {
                     for (std::uint32_t k = 0; k < pl.count && k < snap.points.size(); k++) {
                         entityManager_.points[pl.offset + k] = snap.points[k];
                     }
                     break;
                 }
             }
         } else if (it->second.kind == EntityKind::Line) {
               for (auto& l : entityManager_.lines) {
                   if (l.id == id && snap.points.size() >= 2) {
                       l.x0 = snap.points[0].x; l.y0 = snap.points[0].y;
                       l.x1 = snap.points[1].x; l.y1 = snap.points[1].y;
                       break;
                   }
               }
          } else if (it->second.kind == EntityKind::Arrow) {
               for (auto& a : entityManager_.arrows) {
                   if (a.id == id && snap.points.size() >= 2) {
                       a.ax = snap.points[0].x; a.ay = snap.points[0].y;
                       a.bx = snap.points[1].x; a.by = snap.points[1].y;
                       break;
                   }
               }
          }
    }
    
    renderDirty = true;
    session_ = InteractionSession{};
}
