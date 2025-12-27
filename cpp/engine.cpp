// engine.cpp now contains only a thin TU; public `CadEngine` lives in engine/engine.h
#include "engine/engine.h"

// Implement CadEngine methods moved out of the header to keep the header small.

#include <cmath>
#include <algorithm>
#include <cstring>
#include <cstdio>  // For printf debugging
#include <limits>
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

    bool isEntityVisibleForRender(void* ctx, std::uint32_t id) {
        const auto* engine = static_cast<const CadEngine*>(ctx);
        return engine ? engine->entityManager_.isEntityVisible(id) : true;
    }

    constexpr std::uint64_t kDigestOffset = 14695981039346656037ull;
    constexpr std::uint64_t kDigestPrime = 1099511628211ull;

    std::uint64_t hashU32(std::uint64_t h, std::uint32_t v) {
        h ^= v;
        return h * kDigestPrime;
    }

    std::uint64_t hashBytes(std::uint64_t h, const std::uint8_t* data, std::size_t len) {
        for (std::size_t i = 0; i < len; ++i) {
            h ^= data[i];
            h *= kDigestPrime;
        }
        return h;
    }

    std::uint32_t canonicalizeF32(float v) {
        if (std::isnan(v)) return 0x7fc00000u;
        if (v == 0.0f) return 0u;
        std::uint32_t bits = 0;
        std::memcpy(&bits, &v, sizeof(bits));
        return bits;
    }

    std::uint64_t hashF32(std::uint64_t h, float v) {
        return hashU32(h, canonicalizeF32(v));
    }
}

// Constructor
CadEngine::CadEngine() {
    triangleVertices.reserve(defaultCapacityFloats);
    lineVertices.reserve(defaultLineCapacityFloats);
    snapshotBytes.reserve(defaultSnapshotCapacityBytes);
    eventQueue_.resize(kMaxEvents);
    eventBuffer_.reserve(kMaxEvents + 1);
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

std::uint32_t CadEngine::allocateEntityId() {
    const std::uint32_t id = nextEntityId_;
    nextEntityId_ = (nextEntityId_ == std::numeric_limits<std::uint32_t>::max()) ? nextEntityId_ : (nextEntityId_ + 1);
    return id;
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

    clearWorld();
    reserveWorld(static_cast<std::uint32_t>(sd.rects.size()), static_cast<std::uint32_t>(sd.lines.size()), static_cast<std::uint32_t>(sd.polylines.size()), static_cast<std::uint32_t>(sd.points.size()));

    std::vector<LayerRecord> layerRecords;
    std::vector<std::string> layerNames;
    layerRecords.reserve(sd.layers.size());
    layerNames.reserve(sd.layers.size());
    for (const auto& layer : sd.layers) {
        layerRecords.push_back(LayerRecord{layer.id, layer.order, layer.flags});
        layerNames.push_back(layer.name);
    }
    entityManager_.layerStore.loadSnapshot(layerRecords, layerNames);

    entityManager_.points = sd.points;

    entityManager_.rects.clear();
    entityManager_.rects.reserve(sd.rects.size());
    for (const auto& rec : sd.rects) entityManager_.rects.push_back(rec.rec);

    entityManager_.lines.clear();
    entityManager_.lines.reserve(sd.lines.size());
    for (const auto& rec : sd.lines) entityManager_.lines.push_back(rec.rec);

    entityManager_.polylines.clear();
    entityManager_.polylines.reserve(sd.polylines.size());
    for (const auto& rec : sd.polylines) entityManager_.polylines.push_back(rec.rec);

    entityManager_.circles.clear();
    entityManager_.circles.reserve(sd.circles.size());
    for (const auto& rec : sd.circles) entityManager_.circles.push_back(rec.rec);

    entityManager_.polygons.clear();
    entityManager_.polygons.reserve(sd.polygons.size());
    for (const auto& rec : sd.polygons) entityManager_.polygons.push_back(rec.rec);

    entityManager_.arrows.clear();
    entityManager_.arrows.reserve(sd.arrows.size());
    for (const auto& rec : sd.arrows) entityManager_.arrows.push_back(rec.rec);

    entityManager_.entities.clear();
    entityManager_.entityFlags.clear();
    entityManager_.entityLayers.clear();

    for (std::uint32_t i = 0; i < entityManager_.rects.size(); ++i) {
        const auto& rec = sd.rects[i];
        const std::uint32_t id = rec.rec.id;
        entityManager_.entities[id] = EntityRef{EntityKind::Rect, i};
        entityManager_.entityFlags[id] = rec.flags;
        entityManager_.entityLayers[id] = rec.layerId;
    }
    for (std::uint32_t i = 0; i < entityManager_.lines.size(); ++i) {
        const auto& rec = sd.lines[i];
        const std::uint32_t id = rec.rec.id;
        entityManager_.entities[id] = EntityRef{EntityKind::Line, i};
        entityManager_.entityFlags[id] = rec.flags;
        entityManager_.entityLayers[id] = rec.layerId;
    }
    for (std::uint32_t i = 0; i < entityManager_.polylines.size(); ++i) {
        const auto& rec = sd.polylines[i];
        const std::uint32_t id = rec.rec.id;
        entityManager_.entities[id] = EntityRef{EntityKind::Polyline, i};
        entityManager_.entityFlags[id] = rec.flags;
        entityManager_.entityLayers[id] = rec.layerId;
    }
    for (std::uint32_t i = 0; i < entityManager_.circles.size(); ++i) {
        const auto& rec = sd.circles[i];
        const std::uint32_t id = rec.rec.id;
        entityManager_.entities[id] = EntityRef{EntityKind::Circle, i};
        entityManager_.entityFlags[id] = rec.flags;
        entityManager_.entityLayers[id] = rec.layerId;
    }
    for (std::uint32_t i = 0; i < entityManager_.polygons.size(); ++i) {
        const auto& rec = sd.polygons[i];
        const std::uint32_t id = rec.rec.id;
        entityManager_.entities[id] = EntityRef{EntityKind::Polygon, i};
        entityManager_.entityFlags[id] = rec.flags;
        entityManager_.entityLayers[id] = rec.layerId;
    }
    for (std::uint32_t i = 0; i < entityManager_.arrows.size(); ++i) {
        const auto& rec = sd.arrows[i];
        const std::uint32_t id = rec.rec.id;
        entityManager_.entities[id] = EntityRef{EntityKind::Arrow, i};
        entityManager_.entityFlags[id] = rec.flags;
        entityManager_.entityLayers[id] = rec.layerId;
    }

    if (!sd.texts.empty()) {
        if (!textSystem_.initialized) {
            textSystem_.initialize();
        }
        for (const auto& rec : sd.texts) {
            TextPayloadHeader header = rec.header;
            header.runCount = static_cast<std::uint32_t>(rec.runs.size());
            header.contentLength = static_cast<std::uint32_t>(rec.content.size());
            const char* contentPtr = rec.content.empty() ? nullptr : rec.content.data();
            const TextRunPayload* runsPtr = rec.runs.empty() ? nullptr : rec.runs.data();
            textSystem_.store.upsertText(rec.id, header, runsPtr, header.runCount, contentPtr, header.contentLength);
            textSystem_.store.setLayoutResult(rec.id, rec.layoutWidth, rec.layoutHeight, rec.minX, rec.minY, rec.maxX, rec.maxY);
            entityManager_.entities[rec.id] = EntityRef{EntityKind::Text, rec.id};
            entityManager_.entityFlags[rec.id] = rec.flags;
            entityManager_.entityLayers[rec.id] = rec.layerId;
        }
        textQuadsDirty_ = true;
    }

    entityManager_.drawOrderIds.clear();
    entityManager_.drawOrderIds.reserve(sd.drawOrder.size());
    std::unordered_set<std::uint32_t> seen;
    seen.reserve(sd.drawOrder.size());
    for (const std::uint32_t id : sd.drawOrder) {
        if (entityManager_.entities.find(id) == entityManager_.entities.end()) continue;
        if (seen.insert(id).second) {
            entityManager_.drawOrderIds.push_back(id);
        }
    }
    if (entityManager_.drawOrderIds.size() < entityManager_.entities.size()) {
        std::vector<std::uint32_t> missing;
        missing.reserve(entityManager_.entities.size());
        for (const auto& kv : entityManager_.entities) {
            if (seen.find(kv.first) == seen.end()) missing.push_back(kv.first);
        }
        std::sort(missing.begin(), missing.end());
        entityManager_.drawOrderIds.insert(entityManager_.drawOrderIds.end(), missing.begin(), missing.end());
    }
    pickSystem_.clear();
    for (const auto& r : entityManager_.rects) {
        pickSystem_.update(r.id, PickSystem::computeRectAABB(r));
    }
    for (const auto& l : entityManager_.lines) {
        pickSystem_.update(l.id, PickSystem::computeLineAABB(l));
    }
    for (const auto& pl : entityManager_.polylines) {
        const std::uint32_t end = pl.offset + pl.count;
        if (end <= entityManager_.points.size()) {
            pickSystem_.update(pl.id, PickSystem::computePolylineAABB(pl, entityManager_.points));
        }
    }
    for (const auto& c : entityManager_.circles) {
        pickSystem_.update(c.id, PickSystem::computeCircleAABB(c));
    }
    for (const auto& p : entityManager_.polygons) {
        pickSystem_.update(p.id, PickSystem::computePolygonAABB(p));
    }
    for (const auto& a : entityManager_.arrows) {
        pickSystem_.update(a.id, PickSystem::computeArrowAABB(a));
    }
    for (const auto& rec : sd.texts) {
        pickSystem_.update(rec.id, {rec.minX, rec.minY, rec.maxX, rec.maxY});
    }
    pickSystem_.setDrawOrder(entityManager_.drawOrderIds);

    selectionSet_.clear();
    selectionOrdered_.clear();
    for (const std::uint32_t id : sd.selection) {
        if (entityManager_.entities.find(id) == entityManager_.entities.end()) continue;
        if (!entityManager_.isEntityPickable(id)) continue;
        selectionSet_.insert(id);
    }
    if (!selectionSet_.empty()) {
        rebuildSelectionOrder();
        selectionGeneration_ = 1;
    } else {
        selectionGeneration_ = 0;
    }

    std::uint32_t maxId = 0;
    for (const auto& kv : entityManager_.entities) {
        if (kv.first > maxId) maxId = kv.first;
    }
    if (sd.nextId == 0) {
        nextEntityId_ = maxId + 1;
    } else {
        nextEntityId_ = sd.nextId;
        if (nextEntityId_ <= maxId) nextEntityId_ = maxId + 1;
    }

    const double t1 = emscripten_get_now();
    
    // Lazy rebuild
    renderDirty = true;
    snapshotDirty = true;

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

CadEngine::ByteBufferMeta CadEngine::saveSnapshot() const noexcept {
    if (snapshotDirty) rebuildSnapshotBytes();
    return ByteBufferMeta{generation, static_cast<std::uint32_t>(snapshotBytes.size()), reinterpret_cast<std::uintptr_t>(snapshotBytes.data())};
}

CadEngine::ByteBufferMeta CadEngine::getSnapshotBufferMeta() const noexcept {
    return saveSnapshot();
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
        rebuildAllGeometryCount_,
        lastLoadMs,
        lastRebuildMs,
        lastApplyMs
    };
}

CadEngine::DocumentDigest CadEngine::getDocumentDigest() const noexcept {
    std::uint64_t h = kDigestOffset;

    h = hashU32(h, 0x45444F43u); // "CODE" marker
    h = hashU32(h, kSnapshotVersion);

    const auto layers = entityManager_.layerStore.snapshot();
    h = hashU32(h, static_cast<std::uint32_t>(layers.size()));
    for (const auto& layer : layers) {
        h = hashU32(h, layer.id);
        h = hashU32(h, layer.order);
        h = hashU32(h, layer.flags);
        const std::string name = entityManager_.layerStore.getLayerName(layer.id);
        h = hashU32(h, static_cast<std::uint32_t>(name.size()));
        if (!name.empty()) {
            h = hashBytes(h, reinterpret_cast<const std::uint8_t*>(name.data()), name.size());
        }
    }

    std::vector<std::uint32_t> ids;
    ids.reserve(entityManager_.entities.size());
    for (const auto& kv : entityManager_.entities) ids.push_back(kv.first);
    std::sort(ids.begin(), ids.end());

    h = hashU32(h, static_cast<std::uint32_t>(ids.size()));
    for (const std::uint32_t id : ids) {
        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;
        const EntityRef ref = it->second;

        h = hashU32(h, id);
        h = hashU32(h, static_cast<std::uint32_t>(ref.kind));
        h = hashU32(h, entityManager_.getEntityLayer(id));
        h = hashU32(h, entityManager_.getEntityFlags(id));

        switch (ref.kind) {
            case EntityKind::Rect: {
                const RectRec* r = entityManager_.getRect(id);
                if (!r) break;
                h = hashF32(h, r->x);
                h = hashF32(h, r->y);
                h = hashF32(h, r->w);
                h = hashF32(h, r->h);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Line: {
                const LineRec* r = entityManager_.getLine(id);
                if (!r) break;
                h = hashF32(h, r->x0);
                h = hashF32(h, r->y0);
                h = hashF32(h, r->x1);
                h = hashF32(h, r->y1);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->enabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Polyline: {
                const PolyRec* r = entityManager_.getPolyline(id);
                if (!r) break;
                h = hashU32(h, r->count);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->enabled);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);

                const std::uint32_t offset = r->offset;
                const std::uint32_t count = r->count;
                const auto& points = entityManager_.points;
                for (std::uint32_t i = 0; i < count; ++i) {
                    const std::uint32_t idx = offset + i;
                    if (idx >= points.size()) break;
                    h = hashF32(h, points[idx].x);
                    h = hashF32(h, points[idx].y);
                }
                break;
            }
            case EntityKind::Circle: {
                const CircleRec* r = entityManager_.getCircle(id);
                if (!r) break;
                h = hashF32(h, r->cx);
                h = hashF32(h, r->cy);
                h = hashF32(h, r->rx);
                h = hashF32(h, r->ry);
                h = hashF32(h, r->rot);
                h = hashF32(h, r->sx);
                h = hashF32(h, r->sy);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Polygon: {
                const PolygonRec* r = entityManager_.getPolygon(id);
                if (!r) break;
                h = hashF32(h, r->cx);
                h = hashF32(h, r->cy);
                h = hashF32(h, r->rx);
                h = hashF32(h, r->ry);
                h = hashF32(h, r->rot);
                h = hashF32(h, r->sx);
                h = hashF32(h, r->sy);
                h = hashU32(h, r->sides);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Arrow: {
                const ArrowRec* r = entityManager_.getArrow(id);
                if (!r) break;
                h = hashF32(h, r->ax);
                h = hashF32(h, r->ay);
                h = hashF32(h, r->bx);
                h = hashF32(h, r->by);
                h = hashF32(h, r->head);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Text: {
                const TextRec* r = textSystem_.store.getText(id);
                if (!r) break;
                h = hashF32(h, r->x);
                h = hashF32(h, r->y);
                h = hashF32(h, r->rotation);
                h = hashU32(h, static_cast<std::uint32_t>(r->boxMode));
                h = hashU32(h, static_cast<std::uint32_t>(r->align));
                h = hashF32(h, r->constraintWidth);
                h = hashF32(h, r->layoutWidth);
                h = hashF32(h, r->layoutHeight);
                h = hashF32(h, r->minX);
                h = hashF32(h, r->minY);
                h = hashF32(h, r->maxX);
                h = hashF32(h, r->maxY);

                const std::string_view content = textSystem_.store.getContent(id);
                h = hashU32(h, static_cast<std::uint32_t>(content.size()));
                if (!content.empty()) {
                    h = hashBytes(h, reinterpret_cast<const std::uint8_t*>(content.data()), content.size());
                }

                const auto& runs = textSystem_.store.getRuns(id);
                h = hashU32(h, static_cast<std::uint32_t>(runs.size()));
                for (const auto& run : runs) {
                    h = hashU32(h, run.startIndex);
                    h = hashU32(h, run.length);
                    h = hashU32(h, run.fontId);
                    h = hashF32(h, run.fontSize);
                    h = hashU32(h, run.colorRGBA);
                    h = hashU32(h, static_cast<std::uint32_t>(run.flags));
                }
                break;
            }
            default:
                break;
        }
    }

    h = hashU32(h, static_cast<std::uint32_t>(entityManager_.drawOrderIds.size()));
    for (const std::uint32_t id : entityManager_.drawOrderIds) {
        h = hashU32(h, id);
    }

    h = hashU32(h, static_cast<std::uint32_t>(selectionOrdered_.size()));
    for (const std::uint32_t id : selectionOrdered_) {
        h = hashU32(h, id);
    }

    h = hashU32(h, nextEntityId_);

    return DocumentDigest{
        static_cast<std::uint32_t>(h & 0xFFFFFFFFu),
        static_cast<std::uint32_t>((h >> 32) & 0xFFFFFFFFu)
    };
}

std::vector<LayerRecord> CadEngine::getLayersSnapshot() const {
    return entityManager_.layerStore.snapshot();
}

std::string CadEngine::getLayerName(std::uint32_t layerId) const {
    return entityManager_.layerStore.getLayerName(layerId);
}

void CadEngine::setLayerProps(std::uint32_t layerId, std::uint32_t propsMask, std::uint32_t flagsValue, const std::string& name) {
    entityManager_.layerStore.ensureLayer(layerId);

    const std::uint32_t visibleMask = static_cast<std::uint32_t>(LayerPropMask::Visible);
    const std::uint32_t lockedMask = static_cast<std::uint32_t>(LayerPropMask::Locked);
    const std::uint32_t nameMask = static_cast<std::uint32_t>(LayerPropMask::Name);
    const std::uint32_t flagMask = (propsMask & (visibleMask | lockedMask));

    bool visibilityChanged = false;
    bool lockedChanged = false;
    bool nameChanged = false;

    if (flagMask != 0) {
        const std::uint32_t prevFlags = entityManager_.layerStore.getLayerFlags(layerId);
        entityManager_.layerStore.setLayerFlags(layerId, flagMask, flagsValue);
        const std::uint32_t nextFlags = entityManager_.layerStore.getLayerFlags(layerId);
        visibilityChanged = ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(LayerFlags::Visible)) != 0;
        lockedChanged = ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(LayerFlags::Locked)) != 0;
    }

    if ((propsMask & nameMask) != 0) {
        const std::string prevName = entityManager_.layerStore.getLayerName(layerId);
        entityManager_.layerStore.setLayerName(layerId, name);
        nameChanged = prevName != name;
    }

    if (visibilityChanged) {
        renderDirty = true;
        textQuadsDirty_ = true;
    }

    if (visibilityChanged || lockedChanged) {
        pruneSelection();
    }

    const std::uint32_t changedMask =
        (visibilityChanged ? visibleMask : 0)
        | (lockedChanged ? lockedMask : 0)
        | (nameChanged ? nameMask : 0);

    if (changedMask != 0) {
        recordLayerChanged(layerId, changedMask);
        generation++;
    }
}

bool CadEngine::deleteLayer(std::uint32_t layerId) {
    const bool deleted = entityManager_.layerStore.deleteLayer(layerId);
    if (deleted) {
        renderDirty = true;
        textQuadsDirty_ = true;
        recordLayerChanged(
            layerId,
            static_cast<std::uint32_t>(LayerPropMask::Name)
            | static_cast<std::uint32_t>(LayerPropMask::Visible)
            | static_cast<std::uint32_t>(LayerPropMask::Locked)
        );
        generation++;
    }
    return deleted;
}

std::uint32_t CadEngine::getEntityFlags(std::uint32_t entityId) const {
    return entityManager_.getEntityFlags(entityId);
}

void CadEngine::setEntityFlags(std::uint32_t entityId, std::uint32_t flagsMask, std::uint32_t flagsValue) {
    const std::uint32_t prevFlags = entityManager_.getEntityFlags(entityId);
    entityManager_.setEntityFlags(entityId, flagsMask, flagsValue);
    const std::uint32_t nextFlags = entityManager_.getEntityFlags(entityId);
    if (((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Visible)) != 0) {
        renderDirty = true;
        textQuadsDirty_ = true;
    }
    if (((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Locked)) != 0 ||
        ((prevFlags ^ nextFlags) & static_cast<std::uint32_t>(EntityFlags::Visible)) != 0) {
        pruneSelection();
    }
    if (prevFlags != nextFlags) {
        recordEntityChanged(entityId, static_cast<std::uint32_t>(ChangeMask::Flags));
        generation++;
    }
}

void CadEngine::setEntityLayer(std::uint32_t entityId, std::uint32_t layerId) {
    const std::uint32_t prevLayer = entityManager_.getEntityLayer(entityId);
    entityManager_.setEntityLayer(entityId, layerId);
    if (prevLayer != layerId) {
        renderDirty = true;
        textQuadsDirty_ = true;
        pruneSelection();
        recordEntityChanged(entityId, static_cast<std::uint32_t>(ChangeMask::Layer));
        generation++;
    }
}

std::uint32_t CadEngine::getEntityLayer(std::uint32_t entityId) const {
    return entityManager_.getEntityLayer(entityId);
}

std::uint32_t CadEngine::pick(float x, float y, float tolerance) const noexcept {
    return pickSystem_.pick(x, y, tolerance, viewScale, entityManager_, textSystem_);
}

PickResult CadEngine::pickEx(float x, float y, float tolerance, std::uint32_t pickMask) const noexcept {
    return pickSystem_.pickEx(x, y, tolerance, viewScale, pickMask, entityManager_, textSystem_);
}

std::vector<std::uint32_t> CadEngine::queryArea(float minX, float minY, float maxX, float maxY) const {
    AABB area{
        std::min(minX, maxX),
        std::min(minY, maxY),
        std::max(minX, maxX),
        std::max(minY, maxY)
    };
    std::vector<std::uint32_t> out;
    pickSystem_.queryArea(area, out);
    if (out.empty()) return out;

    std::vector<std::uint32_t> filtered;
    filtered.reserve(out.size());
    for (const std::uint32_t id : out) {
        if (entityManager_.isEntityPickable(id)) {
            filtered.push_back(id);
        }
    }
    return filtered;
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
        if (!entityManager_.isEntityPickable(id)) continue;

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

CadEngine::EntityAabb CadEngine::getEntityAabb(std::uint32_t entityId) const {
    const auto it = entityManager_.entities.find(entityId);
    if (it == entityManager_.entities.end()) return EntityAabb{0, 0, 0, 0, 0};

    switch (it->second.kind) {
        case EntityKind::Rect: {
            if (it->second.index >= entityManager_.rects.size()) break;
            const RectRec& r = entityManager_.rects[it->second.index];
            const AABB aabb = PickSystem::computeRectAABB(r);
            return EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Circle: {
            if (it->second.index >= entityManager_.circles.size()) break;
            const CircleRec& c = entityManager_.circles[it->second.index];
            const AABB aabb = PickSystem::computeCircleAABB(c);
            return EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Polygon: {
            if (it->second.index >= entityManager_.polygons.size()) break;
            const PolygonRec& p = entityManager_.polygons[it->second.index];
            const AABB aabb = PickSystem::computePolygonAABB(p);
            return EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Line: {
            if (it->second.index >= entityManager_.lines.size()) break;
            const LineRec& l = entityManager_.lines[it->second.index];
            const AABB aabb = PickSystem::computeLineAABB(l);
            return EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Polyline: {
            if (it->second.index >= entityManager_.polylines.size()) break;
            const PolyRec& pl = entityManager_.polylines[it->second.index];
            if (pl.count < 2) break;
            const AABB aabb = PickSystem::computePolylineAABB(pl, entityManager_.points);
            return EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Arrow: {
            if (it->second.index >= entityManager_.arrows.size()) break;
            const ArrowRec& a = entityManager_.arrows[it->second.index];
            const AABB aabb = PickSystem::computeArrowAABB(a);
            return EntityAabb{aabb.minX, aabb.minY, aabb.maxX, aabb.maxY, 1};
        }
        case EntityKind::Text: {
            float minX = 0.0f, minY = 0.0f, maxX = 0.0f, maxY = 0.0f;
            if (textSystem_.getBounds(entityId, minX, minY, maxX, maxY)) {
                return EntityAabb{minX, minY, maxX, maxY, 1};
            }
            return EntityAabb{0, 0, 0, 0, 0};
        }
        default:
            break;
    }

    return EntityAabb{0, 0, 0, 0, 0};
}

CadEngine::OverlayBufferMeta CadEngine::getSelectionOutlineMeta() const {
    selectionOutlinePrimitives_.clear();
    selectionOutlineData_.clear();

    auto pushPrimitive = [&](OverlayKind kind, std::uint32_t count) {
        const std::uint32_t offset = static_cast<std::uint32_t>(selectionOutlineData_.size());
        selectionOutlinePrimitives_.push_back(OverlayPrimitive{
            static_cast<std::uint16_t>(kind),
            0,
            count,
            offset
        });
    };

    for (const std::uint32_t id : selectionOrdered_) {
        if (!entityManager_.isEntityPickable(id)) continue;
        const auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Line) {
            if (it->second.index >= entityManager_.lines.size()) continue;
            const LineRec& l = entityManager_.lines[it->second.index];
            pushPrimitive(OverlayKind::Segment, 2);
            selectionOutlineData_.push_back(l.x0);
            selectionOutlineData_.push_back(l.y0);
            selectionOutlineData_.push_back(l.x1);
            selectionOutlineData_.push_back(l.y1);
            continue;
        }

        if (it->second.kind == EntityKind::Arrow) {
            if (it->second.index >= entityManager_.arrows.size()) continue;
            const ArrowRec& a = entityManager_.arrows[it->second.index];
            pushPrimitive(OverlayKind::Segment, 2);
            selectionOutlineData_.push_back(a.ax);
            selectionOutlineData_.push_back(a.ay);
            selectionOutlineData_.push_back(a.bx);
            selectionOutlineData_.push_back(a.by);
            continue;
        }

        if (it->second.kind == EntityKind::Polyline) {
            if (it->second.index >= entityManager_.polylines.size()) continue;
            const PolyRec& pl = entityManager_.polylines[it->second.index];
            if (pl.count < 2) continue;
            if (pl.offset + pl.count > entityManager_.points.size()) continue;
            pushPrimitive(OverlayKind::Polyline, pl.count);
            for (std::uint32_t k = 0; k < pl.count; ++k) {
                const Point2& pt = entityManager_.points[pl.offset + k];
                selectionOutlineData_.push_back(pt.x);
                selectionOutlineData_.push_back(pt.y);
            }
            continue;
        }

        const EntityAabb aabb = getEntityAabb(id);
        if (!aabb.valid) continue;
        pushPrimitive(OverlayKind::Polygon, 4);
        selectionOutlineData_.push_back(aabb.minX);
        selectionOutlineData_.push_back(aabb.minY);
        selectionOutlineData_.push_back(aabb.maxX);
        selectionOutlineData_.push_back(aabb.minY);
        selectionOutlineData_.push_back(aabb.maxX);
        selectionOutlineData_.push_back(aabb.maxY);
        selectionOutlineData_.push_back(aabb.minX);
        selectionOutlineData_.push_back(aabb.maxY);
    }

    return OverlayBufferMeta{
        generation,
        static_cast<std::uint32_t>(selectionOutlinePrimitives_.size()),
        static_cast<std::uint32_t>(selectionOutlineData_.size()),
        reinterpret_cast<std::uintptr_t>(selectionOutlinePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(selectionOutlineData_.data()),
    };
}

CadEngine::OverlayBufferMeta CadEngine::getSelectionHandleMeta() const {
    selectionHandlePrimitives_.clear();
    selectionHandleData_.clear();

    auto pushPrimitive = [&](std::uint32_t count) {
        const std::uint32_t offset = static_cast<std::uint32_t>(selectionHandleData_.size());
        selectionHandlePrimitives_.push_back(OverlayPrimitive{
            static_cast<std::uint16_t>(OverlayKind::Point),
            0,
            count,
            offset
        });
    };

    for (const std::uint32_t id : selectionOrdered_) {
        if (!entityManager_.isEntityPickable(id)) continue;
        const auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;

        if (it->second.kind == EntityKind::Line) {
            if (it->second.index >= entityManager_.lines.size()) continue;
            const LineRec& l = entityManager_.lines[it->second.index];
            pushPrimitive(2);
            selectionHandleData_.push_back(l.x0);
            selectionHandleData_.push_back(l.y0);
            selectionHandleData_.push_back(l.x1);
            selectionHandleData_.push_back(l.y1);
            continue;
        }

        if (it->second.kind == EntityKind::Arrow) {
            if (it->second.index >= entityManager_.arrows.size()) continue;
            const ArrowRec& a = entityManager_.arrows[it->second.index];
            pushPrimitive(2);
            selectionHandleData_.push_back(a.ax);
            selectionHandleData_.push_back(a.ay);
            selectionHandleData_.push_back(a.bx);
            selectionHandleData_.push_back(a.by);
            continue;
        }

        if (it->second.kind == EntityKind::Polyline) {
            if (it->second.index >= entityManager_.polylines.size()) continue;
            const PolyRec& pl = entityManager_.polylines[it->second.index];
            if (pl.count < 2) continue;
            if (pl.offset + pl.count > entityManager_.points.size()) continue;
            pushPrimitive(pl.count);
            for (std::uint32_t k = 0; k < pl.count; ++k) {
                const Point2& pt = entityManager_.points[pl.offset + k];
                selectionHandleData_.push_back(pt.x);
                selectionHandleData_.push_back(pt.y);
            }
            continue;
        }

        const EntityAabb aabb = getEntityAabb(id);
        if (!aabb.valid) continue;
        pushPrimitive(4);
        // Handle order must match pick_system.cpp: 0=BL, 1=BR, 2=TR, 3=TL
        selectionHandleData_.push_back(aabb.minX);
        selectionHandleData_.push_back(aabb.minY);
        selectionHandleData_.push_back(aabb.maxX);
        selectionHandleData_.push_back(aabb.minY);
        selectionHandleData_.push_back(aabb.maxX);
        selectionHandleData_.push_back(aabb.maxY);
        selectionHandleData_.push_back(aabb.minX);
        selectionHandleData_.push_back(aabb.maxY);
    }

    return OverlayBufferMeta{
        generation,
        static_cast<std::uint32_t>(selectionHandlePrimitives_.size()),
        static_cast<std::uint32_t>(selectionHandleData_.size()),
        reinterpret_cast<std::uintptr_t>(selectionHandlePrimitives_.data()),
        reinterpret_cast<std::uintptr_t>(selectionHandleData_.data()),
    };
}

std::vector<std::uint32_t> CadEngine::getSelectionIds() const {
    return selectionOrdered_;
}

void CadEngine::rebuildSelectionOrder() {
    selectionOrdered_.clear();
    if (selectionSet_.empty()) return;

    selectionOrdered_.reserve(selectionSet_.size());
    std::unordered_set<std::uint32_t> seen;
    seen.reserve(selectionSet_.size());

    for (const auto& id : entityManager_.drawOrderIds) {
        if (selectionSet_.find(id) == selectionSet_.end()) continue;
        if (seen.insert(id).second) selectionOrdered_.push_back(id);
    }

    std::vector<std::uint32_t> missing;
    missing.reserve(selectionSet_.size());
    for (const auto& id : selectionSet_) {
        if (seen.find(id) == seen.end()) missing.push_back(id);
    }
    if (!missing.empty()) {
        std::sort(missing.begin(), missing.end());
        selectionOrdered_.insert(selectionOrdered_.end(), missing.begin(), missing.end());
    }
}

bool CadEngine::pruneSelection() {
    if (selectionSet_.empty()) return false;
    bool changed = false;
    for (auto it = selectionSet_.begin(); it != selectionSet_.end(); ) {
        const std::uint32_t id = *it;
        if (entityManager_.entities.find(id) == entityManager_.entities.end() || !entityManager_.isEntityPickable(id)) {
            it = selectionSet_.erase(it);
            changed = true;
            continue;
        }
        ++it;
    }

    if (changed) {
        rebuildSelectionOrder();
        selectionGeneration_++;
        recordSelectionChanged();
    }
    return changed;
}

void CadEngine::clearSelection() {
    if (selectionSet_.empty()) return;
    selectionSet_.clear();
    selectionOrdered_.clear();
    selectionGeneration_++;
    recordSelectionChanged();
}

void CadEngine::setSelection(const std::uint32_t* ids, std::uint32_t idCount, SelectionMode mode) {
    bool changed = false;

    auto applyInsert = [&](std::uint32_t id) {
        if (selectionSet_.find(id) == selectionSet_.end()) {
            selectionSet_.insert(id);
            changed = true;
        }
    };
    auto applyErase = [&](std::uint32_t id) {
        const auto it = selectionSet_.find(id);
        if (it != selectionSet_.end()) {
            selectionSet_.erase(it);
            changed = true;
        }
    };

    if (mode == SelectionMode::Replace) {
        if (!selectionSet_.empty()) {
            selectionSet_.clear();
            changed = true;
        }
    }

    for (std::uint32_t i = 0; i < idCount; i++) {
        const std::uint32_t id = ids[i];
        if (entityManager_.entities.find(id) == entityManager_.entities.end()) continue;
        if (!entityManager_.isEntityPickable(id)) continue;

        switch (mode) {
            case SelectionMode::Replace:
            case SelectionMode::Add:
                applyInsert(id);
                break;
            case SelectionMode::Remove:
                applyErase(id);
                break;
            case SelectionMode::Toggle:
                if (selectionSet_.find(id) != selectionSet_.end()) {
                    applyErase(id);
                } else {
                    applyInsert(id);
                }
                break;
            default:
                break;
        }
    }

    if (changed) {
        rebuildSelectionOrder();
        selectionGeneration_++;
        recordSelectionChanged();
    }
}

void CadEngine::selectByPick(const PickResult& pick, std::uint32_t modifiers) {
    SelectionMode mode = SelectionMode::Replace;
    const std::uint32_t toggleMask =
        static_cast<std::uint32_t>(SelectionModifier::Ctrl)
        | static_cast<std::uint32_t>(SelectionModifier::Meta);
    if ((modifiers & toggleMask) != 0) {
        mode = SelectionMode::Toggle;
    } else if ((modifiers & static_cast<std::uint32_t>(SelectionModifier::Shift)) != 0) {
        mode = SelectionMode::Add;
    }

    if (pick.id == 0) {
        if (mode == SelectionMode::Replace) clearSelection();
        return;
    }

    const std::uint32_t id = pick.id;
    if (entityManager_.entities.find(id) == entityManager_.entities.end()) return;
    if (!entityManager_.isEntityPickable(id)) return;

    setSelection(&id, 1, mode);
}

void CadEngine::marqueeSelect(float minX, float minY, float maxX, float maxY, SelectionMode mode, int hitMode) {
    const std::vector<std::uint32_t> ids = queryMarquee(minX, minY, maxX, maxY, hitMode);
    if (ids.empty()) {
        if (mode == SelectionMode::Replace) clearSelection();
        return;
    }
    setSelection(ids.data(), static_cast<std::uint32_t>(ids.size()), mode);
}

std::vector<std::uint32_t> CadEngine::getDrawOrderSnapshot() const {
    return entityManager_.drawOrderIds;
}

void CadEngine::reorderEntities(const std::uint32_t* ids, std::uint32_t idCount, ReorderAction action, std::uint32_t refId) {
    (void)refId;
    if (idCount == 0) return;

    auto& order = entityManager_.drawOrderIds;
    if (order.empty()) return;

    std::unordered_set<std::uint32_t> moveSet;
    moveSet.reserve(idCount * 2);
    for (std::uint32_t i = 0; i < idCount; i++) {
        const std::uint32_t id = ids[i];
        if (entityManager_.entities.find(id) == entityManager_.entities.end()) continue;
        moveSet.insert(id);
    }
    if (moveSet.empty()) return;

    bool changed = false;

    switch (action) {
        case ReorderAction::BringToFront: {
            std::vector<std::uint32_t> keep;
            std::vector<std::uint32_t> moved;
            keep.reserve(order.size());
            moved.reserve(moveSet.size());
            for (const auto id : order) {
                if (moveSet.find(id) != moveSet.end()) {
                    moved.push_back(id);
                } else {
                    keep.push_back(id);
                }
            }
            if (!moved.empty()) {
                keep.insert(keep.end(), moved.begin(), moved.end());
                order.swap(keep);
                changed = true;
            }
            break;
        }
        case ReorderAction::SendToBack: {
            std::vector<std::uint32_t> keep;
            std::vector<std::uint32_t> moved;
            keep.reserve(order.size());
            moved.reserve(moveSet.size());
            for (const auto id : order) {
                if (moveSet.find(id) != moveSet.end()) {
                    moved.push_back(id);
                } else {
                    keep.push_back(id);
                }
            }
            if (!moved.empty()) {
                moved.insert(moved.end(), keep.begin(), keep.end());
                order.swap(moved);
                changed = true;
            }
            break;
        }
        case ReorderAction::BringForward: {
            if (order.size() < 2) break;
            for (std::size_t i = order.size() - 1; i > 0; --i) {
                const std::uint32_t curr = order[i - 1];
                const std::uint32_t next = order[i];
                if (moveSet.find(curr) != moveSet.end() && moveSet.find(next) == moveSet.end()) {
                    std::swap(order[i - 1], order[i]);
                    changed = true;
                }
            }
            break;
        }
        case ReorderAction::SendBackward: {
            if (order.size() < 2) break;
            for (std::size_t i = 1; i < order.size(); ++i) {
                const std::uint32_t curr = order[i];
                const std::uint32_t prev = order[i - 1];
                if (moveSet.find(curr) != moveSet.end() && moveSet.find(prev) == moveSet.end()) {
                    std::swap(order[i - 1], order[i]);
                    changed = true;
                }
            }
            break;
        }
        default:
            break;
    }

    if (!changed) return;
    pickSystem_.setDrawOrder(order);
    renderDirty = true;
    recordOrderChanged();
    generation++;
    if (!selectionSet_.empty()) rebuildSelectionOrder();
}

void CadEngine::clearWorld() noexcept {
    entityManager_.clear();
    pickSystem_.clear();
    textSystem_.clear();
    viewScale = 1.0f;
    triangleVertices.clear();
    lineVertices.clear();
    renderRanges_.clear();
    snapshotBytes.clear();
    selectionSet_.clear();
    selectionOrdered_.clear();
    selectionGeneration_ = 0;
    nextEntityId_ = 1;
    lastLoadMs = 0.0f;
    lastRebuildMs = 0.0f;
    lastApplyMs = 0.0f;
    rebuildAllGeometryCount_ = 0;
    pendingFullRebuild_ = false;
    renderDirty = true;
    snapshotDirty = true;
    textQuadsDirty_ = true;
    clearEventState();
    recordDocChanged(
        static_cast<std::uint32_t>(ChangeMask::Geometry)
        | static_cast<std::uint32_t>(ChangeMask::Style)
        | static_cast<std::uint32_t>(ChangeMask::Flags)
        | static_cast<std::uint32_t>(ChangeMask::Layer)
        | static_cast<std::uint32_t>(ChangeMask::Order)
        | static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds)
    );
    recordSelectionChanged();
    recordOrderChanged();
}

void CadEngine::clearEventState() {
    eventHead_ = 0;
    eventTail_ = 0;
    eventCount_ = 0;
    eventOverflowed_ = false;
    eventOverflowGeneration_ = 0;
    pendingEntityChanges_.clear();
    pendingEntityCreates_.clear();
    pendingEntityDeletes_.clear();
    pendingLayerChanges_.clear();
    pendingDocMask_ = 0;
    pendingSelectionChanged_ = false;
    pendingOrderChanged_ = false;
    pendingHistoryChanged_ = false;
}

void CadEngine::recordDocChanged(std::uint32_t mask) {
    if (eventOverflowed_) return;
    pendingDocMask_ |= mask;
}

void CadEngine::recordEntityChanged(std::uint32_t id, std::uint32_t mask) {
    if (eventOverflowed_) return;
    if (pendingEntityDeletes_.find(id) != pendingEntityDeletes_.end()) return;
    pendingEntityChanges_[id] |= mask;
    recordDocChanged(mask);
}

void CadEngine::recordEntityCreated(std::uint32_t id, std::uint32_t kind) {
    if (eventOverflowed_) return;
    pendingEntityDeletes_.erase(id);
    pendingEntityChanges_.erase(id);
    pendingEntityCreates_[id] = kind;
    std::uint32_t docMask =
        static_cast<std::uint32_t>(ChangeMask::Geometry)
        | static_cast<std::uint32_t>(ChangeMask::Style)
        | static_cast<std::uint32_t>(ChangeMask::Layer)
        | static_cast<std::uint32_t>(ChangeMask::Flags)
        | static_cast<std::uint32_t>(ChangeMask::Bounds);
    if (kind == static_cast<std::uint32_t>(EntityKind::Text)) {
        docMask |= static_cast<std::uint32_t>(ChangeMask::Text);
    }
    recordDocChanged(docMask);
    recordOrderChanged();
}

void CadEngine::recordEntityDeleted(std::uint32_t id) {
    if (eventOverflowed_) return;
    pendingEntityDeletes_.insert(id);
    pendingEntityChanges_.erase(id);
    pendingEntityCreates_.erase(id);
    recordDocChanged(
        static_cast<std::uint32_t>(ChangeMask::Geometry)
        | static_cast<std::uint32_t>(ChangeMask::Layer)
        | static_cast<std::uint32_t>(ChangeMask::Bounds)
    );
    recordOrderChanged();
}

void CadEngine::recordLayerChanged(std::uint32_t layerId, std::uint32_t mask) {
    if (eventOverflowed_) return;
    pendingLayerChanges_[layerId] |= mask;
    recordDocChanged(static_cast<std::uint32_t>(ChangeMask::Layer));
}

void CadEngine::recordSelectionChanged() {
    if (eventOverflowed_) return;
    pendingSelectionChanged_ = true;
}

void CadEngine::recordOrderChanged() {
    if (eventOverflowed_) return;
    pendingOrderChanged_ = true;
    recordDocChanged(static_cast<std::uint32_t>(ChangeMask::Order));
}

void CadEngine::recordHistoryChanged() {
    if (eventOverflowed_) return;
    pendingHistoryChanged_ = true;
}

bool CadEngine::pushEvent(const EngineEvent& ev) {
    if (eventOverflowed_) return false;
    if (eventCount_ >= kMaxEvents) {
        eventOverflowed_ = true;
        eventOverflowGeneration_ = generation;
        eventHead_ = 0;
        eventTail_ = 0;
        eventCount_ = 0;
        return false;
    }
    eventQueue_[eventTail_] = ev;
    eventTail_ = (eventTail_ + 1) % kMaxEvents;
    eventCount_++;
    return true;
}

void CadEngine::flushPendingEvents() {
    if (eventOverflowed_) {
        pendingEntityChanges_.clear();
        pendingEntityCreates_.clear();
        pendingEntityDeletes_.clear();
        pendingLayerChanges_.clear();
        pendingDocMask_ = 0;
        pendingSelectionChanged_ = false;
        pendingOrderChanged_ = false;
        pendingHistoryChanged_ = false;
        return;
    }

    if (pendingDocMask_ == 0 &&
        pendingEntityChanges_.empty() &&
        pendingEntityCreates_.empty() &&
        pendingEntityDeletes_.empty() &&
        pendingLayerChanges_.empty() &&
        !pendingSelectionChanged_ &&
        !pendingOrderChanged_ &&
        !pendingHistoryChanged_) {
        return;
    }

    auto pushOrOverflow = [&](const EngineEvent& ev) -> bool {
        if (!pushEvent(ev)) {
            pendingEntityChanges_.clear();
            pendingEntityCreates_.clear();
            pendingEntityDeletes_.clear();
            pendingLayerChanges_.clear();
            pendingDocMask_ = 0;
            pendingSelectionChanged_ = false;
            pendingOrderChanged_ = false;
            pendingHistoryChanged_ = false;
            return false;
        }
        return true;
    };

    if (pendingDocMask_ != 0) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::DocChanged),
                0,
                pendingDocMask_,
                0,
                0,
                0,
            })) {
            return;
        }
    }

    if (!pendingLayerChanges_.empty()) {
        std::vector<std::uint32_t> layerIds;
        layerIds.reserve(pendingLayerChanges_.size());
        for (const auto& kv : pendingLayerChanges_) layerIds.push_back(kv.first);
        std::sort(layerIds.begin(), layerIds.end());
        for (const std::uint32_t id : layerIds) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::LayerChanged),
                    0,
                    id,
                    pendingLayerChanges_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!pendingEntityCreates_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(pendingEntityCreates_.size());
        for (const auto& kv : pendingEntityCreates_) ids.push_back(kv.first);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::EntityCreated),
                    0,
                    id,
                    pendingEntityCreates_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!pendingEntityChanges_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(pendingEntityChanges_.size());
        for (const auto& kv : pendingEntityChanges_) ids.push_back(kv.first);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::EntityChanged),
                    0,
                    id,
                    pendingEntityChanges_[id],
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (!pendingEntityDeletes_.empty()) {
        std::vector<std::uint32_t> ids;
        ids.reserve(pendingEntityDeletes_.size());
        for (const auto& id : pendingEntityDeletes_) ids.push_back(id);
        std::sort(ids.begin(), ids.end());
        for (const std::uint32_t id : ids) {
            if (!pushOrOverflow(EngineEvent{
                    static_cast<std::uint16_t>(EventType::EntityDeleted),
                    0,
                    id,
                    0,
                    0,
                    0,
                })) {
                return;
            }
        }
    }

    if (pendingSelectionChanged_) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::SelectionChanged),
                0,
                selectionGeneration_,
                static_cast<std::uint32_t>(selectionOrdered_.size()),
                0,
                0,
            })) {
            return;
        }
    }

    if (pendingOrderChanged_) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::OrderChanged),
                0,
                generation,
                static_cast<std::uint32_t>(entityManager_.drawOrderIds.size()),
                0,
                0,
            })) {
            return;
        }
    }

    if (pendingHistoryChanged_) {
        if (!pushOrOverflow(EngineEvent{
                static_cast<std::uint16_t>(EventType::HistoryChanged),
                0,
                generation,
                0,
                0,
                0,
            })) {
            return;
        }
    }

    pendingEntityChanges_.clear();
    pendingEntityCreates_.clear();
    pendingEntityDeletes_.clear();
    pendingLayerChanges_.clear();
    pendingDocMask_ = 0;
    pendingSelectionChanged_ = false;
    pendingOrderChanged_ = false;
    pendingHistoryChanged_ = false;
}

CadEngine::EventBufferMeta CadEngine::pollEvents(std::uint32_t maxEvents) {
    flushPendingEvents();

    eventBuffer_.clear();
    if (eventOverflowed_) {
        eventBuffer_.push_back(EngineEvent{
            static_cast<std::uint16_t>(EventType::Overflow),
            0,
            eventOverflowGeneration_,
            0,
            0,
            0,
        });
        return EventBufferMeta{
            generation,
            static_cast<std::uint32_t>(eventBuffer_.size()),
            reinterpret_cast<std::uintptr_t>(eventBuffer_.data()),
        };
    }

    if (eventCount_ == 0 || maxEvents == 0) {
        return EventBufferMeta{generation, 0, 0};
    }

    const std::size_t count = std::min<std::size_t>(maxEvents, eventCount_);
    eventBuffer_.reserve(count);
    for (std::size_t i = 0; i < count; ++i) {
        eventBuffer_.push_back(eventQueue_[eventHead_]);
        eventHead_ = (eventHead_ + 1) % kMaxEvents;
        eventCount_--;
    }

    return EventBufferMeta{
        generation,
        static_cast<std::uint32_t>(eventBuffer_.size()),
        reinterpret_cast<std::uintptr_t>(eventBuffer_.data()),
    };
}

void CadEngine::ackResync(std::uint32_t resyncGeneration) {
    if (!eventOverflowed_) return;
    if (resyncGeneration < eventOverflowGeneration_) return;
    eventOverflowed_ = false;
    eventOverflowGeneration_ = 0;
    eventHead_ = 0;
    eventTail_ = 0;
    eventCount_ = 0;
    pendingEntityChanges_.clear();
    pendingEntityCreates_.clear();
    pendingEntityDeletes_.clear();
    pendingLayerChanges_.clear();
    pendingDocMask_ = 0;
    pendingSelectionChanged_ = false;
    pendingOrderChanged_ = false;
    pendingHistoryChanged_ = false;
}

void CadEngine::trackNextEntityId(std::uint32_t id) {
    if (id >= nextEntityId_) {
        nextEntityId_ = id + 1;
    }
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
    const bool existed = (it != entityManager_.entities.end());
    entityManager_.deleteEntity(id);
    if (existed) {
        recordEntityDeleted(id);
    }
    pruneSelection();
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a) {
    upsertRect(id, x, y, w, h, r, g, b, a, r, g, b, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    trackNextEntityId(id);
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertRect(id, x, y, w, h, r, g, b, a, sr, sg, sb, sa, strokeEnabled, strokeWidthPx);

    RectRec rec; rec.x = x; rec.y = y; rec.w = w; rec.h = h;
    pickSystem_.update(id, PickSystem::computeRectAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Rect));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Geometry)
            | static_cast<std::uint32_t>(ChangeMask::Style)
            | static_cast<std::uint32_t>(ChangeMask::Bounds));
    }
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1) {
    upsertLine(id, x0, y0, x1, y1, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    trackNextEntityId(id);
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertLine(id, x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx);

    LineRec rec; rec.x0 = x0; rec.y0 = y0; rec.x1 = x1; rec.y1 = y1;
    pickSystem_.update(id, PickSystem::computeLineAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Line));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Geometry)
            | static_cast<std::uint32_t>(ChangeMask::Style)
            | static_cast<std::uint32_t>(ChangeMask::Bounds));
    }
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count) {
    upsertPolyline(id, offset, count, 0.0f, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f);
}

void CadEngine::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    renderDirty = true;
    snapshotDirty = true;
    trackNextEntityId(id);
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertPolyline(id, offset, count, r, g, b, a, enabled, strokeWidthPx);

    PolyRec rec; rec.offset = offset; rec.count = count;
    pickSystem_.update(id, PickSystem::computePolylineAABB(rec, entityManager_.points));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Polyline));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Geometry)
            | static_cast<std::uint32_t>(ChangeMask::Style)
            | static_cast<std::uint32_t>(ChangeMask::Bounds));
    }
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
    trackNextEntityId(id);
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertCircle(id, cx, cy, rx, ry, rot, sx, sy, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);

    CircleRec rec; rec.cx = cx; rec.cy = cy; rec.rx = rx; rec.ry = ry;
    pickSystem_.update(id, PickSystem::computeCircleAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Circle));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Geometry)
            | static_cast<std::uint32_t>(ChangeMask::Style)
            | static_cast<std::uint32_t>(ChangeMask::Bounds));
    }
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
    trackNextEntityId(id);
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertPolygon(id, cx, cy, rx, ry, rot, sx, sy, sides, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);

    PolygonRec rec; rec.cx = cx; rec.cy = cy; rec.rx = rx; rec.ry = ry; rec.rot = rot;
    pickSystem_.update(id, PickSystem::computePolygonAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Polygon));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Geometry)
            | static_cast<std::uint32_t>(ChangeMask::Style)
            | static_cast<std::uint32_t>(ChangeMask::Bounds));
    }
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
    trackNextEntityId(id);
    bool isNew = (entityManager_.entities.find(id) == entityManager_.entities.end());
    entityManager_.upsertArrow(id, ax, ay, bx, by, head, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx);

    ArrowRec rec; rec.ax = ax; rec.ay = ay; rec.bx = bx; rec.by = by; rec.head = head;
    pickSystem_.update(id, PickSystem::computeArrowAABB(rec));
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Arrow));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Geometry)
            | static_cast<std::uint32_t>(ChangeMask::Style)
            | static_cast<std::uint32_t>(ChangeMask::Bounds));
    }
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
            if (!self->selectionSet_.empty()) self->rebuildSelectionOrder();
            self->recordOrderChanged();
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
    sd.rects.reserve(entityManager_.rects.size());
    for (const auto& rec : entityManager_.rects) {
        engine::RectSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.rects.push_back(std::move(snap));
    }

    sd.lines.reserve(entityManager_.lines.size());
    for (const auto& rec : entityManager_.lines) {
        engine::LineSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.lines.push_back(std::move(snap));
    }

    sd.polylines.reserve(entityManager_.polylines.size());
    for (const auto& rec : entityManager_.polylines) {
        engine::PolySnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.polylines.push_back(std::move(snap));
    }

    sd.points = entityManager_.points;

    sd.circles.reserve(entityManager_.circles.size());
    for (const auto& rec : entityManager_.circles) {
        engine::CircleSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.circles.push_back(std::move(snap));
    }

    sd.polygons.reserve(entityManager_.polygons.size());
    for (const auto& rec : entityManager_.polygons) {
        engine::PolygonSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.polygons.push_back(std::move(snap));
    }

    sd.arrows.reserve(entityManager_.arrows.size());
    for (const auto& rec : entityManager_.arrows) {
        engine::ArrowSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.arrows.push_back(std::move(snap));
    }

    const auto layerRecords = entityManager_.layerStore.snapshot();
    sd.layers.reserve(layerRecords.size());
    for (const auto& layer : layerRecords) {
        engine::LayerSnapshot snap{};
        snap.id = layer.id;
        snap.order = layer.order;
        snap.flags = layer.flags;
        snap.name = entityManager_.layerStore.getLayerName(layer.id);
        sd.layers.push_back(std::move(snap));
    }

    sd.drawOrder = entityManager_.drawOrderIds;
    sd.selection = selectionOrdered_;

    const auto textIds = textSystem_.store.getAllTextIds();
    sd.texts.reserve(textIds.size());
    for (const std::uint32_t textId : textIds) {
        const TextRec* rec = textSystem_.store.getText(textId);
        if (!rec) continue;
        engine::TextSnapshot snap{};
        snap.id = textId;
        snap.layerId = entityManager_.getEntityLayer(textId);
        snap.flags = entityManager_.getEntityFlags(textId);
        snap.header.x = rec->x;
        snap.header.y = rec->y;
        snap.header.rotation = rec->rotation;
        snap.header.boxMode = static_cast<std::uint8_t>(rec->boxMode);
        snap.header.align = static_cast<std::uint8_t>(rec->align);
        snap.header.reserved[0] = 0;
        snap.header.reserved[1] = 0;
        snap.header.constraintWidth = rec->constraintWidth;
        snap.layoutWidth = rec->layoutWidth;
        snap.layoutHeight = rec->layoutHeight;
        snap.minX = rec->minX;
        snap.minY = rec->minY;
        snap.maxX = rec->maxX;
        snap.maxY = rec->maxY;

        const std::string_view content = textSystem_.store.getContent(textId);
        snap.content.assign(content.begin(), content.end());

        const auto& runs = textSystem_.store.getRuns(textId);
        snap.runs.reserve(runs.size());
        for (const auto& run : runs) {
            TextRunPayload payload{};
            payload.startIndex = run.startIndex;
            payload.length = run.length;
            payload.fontId = run.fontId;
            payload.fontSize = run.fontSize;
            payload.colorRGBA = run.colorRGBA;
            payload.flags = static_cast<std::uint8_t>(run.flags);
            payload.reserved[0] = 0;
            payload.reserved[1] = 0;
            payload.reserved[2] = 0;
            snap.runs.push_back(payload);
        }
        snap.header.runCount = static_cast<std::uint32_t>(snap.runs.size());
        snap.header.contentLength = static_cast<std::uint32_t>(snap.content.size());

        sd.texts.push_back(std::move(snap));
    }

    sd.nextId = nextEntityId_;

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
    rebuildAllGeometryCount_++;
    
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
        const_cast<CadEngine*>(this),
        &isEntityVisibleForRender,
        &renderRanges_
    );
    renderDirty = false;
    pendingFullRebuild_ = false;
    
    const double t1 = emscripten_get_now();
    lastRebuildMs = static_cast<float>(t1 - t0);
}

bool CadEngine::refreshEntityRenderRange(std::uint32_t id) const {
    if (renderDirty) return false;
    const auto rangeIt = renderRanges_.find(id);
    if (rangeIt == renderRanges_.end()) return false;
    const auto entIt = entityManager_.entities.find(id);
    if (entIt == entityManager_.entities.end()) return false;

    std::vector<float> temp;
    temp.reserve(rangeIt->second.count);
    const bool appended = engine::buildEntityRenderData(
        id,
        entIt->second,
        entityManager_.rects,
        entityManager_.lines,
        entityManager_.polylines,
        entityManager_.points,
        entityManager_.circles,
        entityManager_.polygons,
        entityManager_.arrows,
        viewScale,
        temp,
        const_cast<CadEngine*>(this),
        &isEntityVisibleForRender
    );

    if (!appended) return false;
    if (temp.size() != rangeIt->second.count) {
        pendingFullRebuild_ = true;
        return false;
    }
    const std::size_t start = rangeIt->second.offset;
    if (start + temp.size() > triangleVertices.size()) {
        pendingFullRebuild_ = true;
        return false;
    }

    std::copy(temp.begin(), temp.end(), triangleVertices.begin() + static_cast<std::ptrdiff_t>(start));
    return true;
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
    trackNextEntityId(id);
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
    
    if (isNew) {
        entityManager_.registerTextEntity(id);
    } else {
        entityManager_.ensureEntityMetadata(id);
    }
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(id, minX, minY, maxX, maxY)) {
        pickSystem_.update(id, {minX, minY, maxX, maxY});
    }
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Text));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Text)
            | static_cast<std::uint32_t>(ChangeMask::Bounds)
            | static_cast<std::uint32_t>(ChangeMask::Style));
    }
    
    return true;
}

bool CadEngine::deleteText(std::uint32_t id) {
    auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end() || it->second.kind != EntityKind::Text) {
        return false;
    }
    
    // Use TextSystem to delete
    textSystem_.deleteText(id);

    entityManager_.deleteEntity(id);
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    pickSystem_.remove(id);
    pruneSelection();
    recordEntityDeleted(id);

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
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));

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
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));
    
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
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds)
        | static_cast<std::uint32_t>(ChangeMask::Style));

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
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));

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
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));

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
    textSystem_.rebuildQuadBuffer([this](std::uint32_t textId) {
        return entityManager_.isEntityVisible(textId);
    }, entityManager_.drawOrderIds);
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
    if (renderDirty) {
        rebuildRenderBuffers();
    }

    // 1. Reset Session
    session_ = InteractionSession{};
    session_.active = true;
    session_.mode = mode;
    session_.specificId = specificId;
    session_.vertexIndex = vertexIndex;
    session_.startX = startX;
    session_.startY = startY;

    std::vector<std::uint32_t> activeIds;

    if (mode != TransformMode::Move && specificId != 0) {
        if (!entityManager_.isEntityPickable(specificId)) {
            session_.active = false;
            return;
        }
        activeIds.push_back(specificId);
    } else if (!selectionOrdered_.empty()) {
        activeIds = selectionOrdered_;
    } else if (ids && idCount > 0) {
        activeIds.assign(ids, ids + idCount);
    }

    // 2. Capture Snapshots
    session_.initialIds.reserve(activeIds.size());
    session_.snapshots.reserve(activeIds.size());

    for (const std::uint32_t id : activeIds) {
        if (!entityManager_.isEntityPickable(id)) continue;
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

    if (session_.initialIds.empty()) {
        session_.active = false;
    }
}

void CadEngine::updateTransform(float worldX, float worldY) {
    if (!session_.active) return;
    bool updated = false;
    
    float totalDx = worldX - session_.startX;
    float totalDy = worldY - session_.startY;
    
    if (session_.mode == TransformMode::Move) {
        for (const auto& snap : session_.snapshots) {
            std::uint32_t id = snap.id;
            
             auto it = entityManager_.entities.find(id);
             if (it == entityManager_.entities.end()) continue;
             
             if (it->second.kind == EntityKind::Rect) {
                  for (auto& r : entityManager_.rects) { 
                      if (r.id == id) { 
                          r.x = snap.x + totalDx; 
                          r.y = snap.y + totalDy; 
                          refreshEntityRenderRange(id);
                          updated = true;
                          break; 
                      } 
                  }
             } else if (it->second.kind == EntityKind::Circle) {
                  for (auto& c : entityManager_.circles) { 
                      if (c.id == id) { 
                          c.cx = snap.x + totalDx; 
                          c.cy = snap.y + totalDy; 
                          refreshEntityRenderRange(id);
                          updated = true;
                          break; 
                      } 
                  }
             } else if (it->second.kind == EntityKind::Polygon) {
                  for (auto& p : entityManager_.polygons) { 
                      if (p.id == id) { 
                          p.cx = snap.x + totalDx; 
                          p.cy = snap.y + totalDy; 
                          refreshEntityRenderRange(id);
                          updated = true;
                          break; 
                      } 
                  }
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
                       updated = true;
                   }
             } else if (it->second.kind == EntityKind::Line) {
                 if (snap.points.size() >= 2) {
                     for (auto& l : entityManager_.lines) { 
                         if (l.id == id) { 
                             l.x0 = snap.points[0].x + totalDx; 
                             l.y0 = snap.points[0].y + totalDy; 
                             l.x1 = snap.points[1].x + totalDx; 
                             l.y1 = snap.points[1].y + totalDy; 
                             refreshEntityRenderRange(id);
                             updated = true;
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
                            refreshEntityRenderRange(id);
                            updated = true;
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
                         refreshEntityRenderRange(id);
                         updated = true;
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
                                  refreshEntityRenderRange(id);
                                  updated = true;
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
                                  refreshEntityRenderRange(id);
                                  updated = true;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  l.x1 = snap->points[1].x + totalDx;
                                  l.y1 = snap->points[1].y + totalDy;
                                  refreshEntityRenderRange(id);
                                  updated = true;
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
                                  refreshEntityRenderRange(id);
                                  updated = true;
                              } else if (idx == 1 && snap->points.size() > 1) {
                                  a.bx = snap->points[1].x + totalDx;
                                  a.by = snap->points[1].y + totalDy;
                                  refreshEntityRenderRange(id);
                                  updated = true;
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
            return;
        }

	        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) {
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
                refreshEntityRenderRange(id);
                updated = true;
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
                refreshEntityRenderRange(id);
                updated = true;
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
                refreshEntityRenderRange(id);
                updated = true;
                break;
            }
        }
    }

    if (updated) {
        generation++;
    }
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
    snapshotDirty = true;
    if (pendingFullRebuild_) {
        renderDirty = true;
    }
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
