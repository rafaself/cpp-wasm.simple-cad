// CadEngine snapshot and serialization methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"
#include "engine/persistence/snapshot.h"
#include "engine/core/string_utils.h"
#include <unordered_set>
#include <cmath>

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
    std::uint32_t maxLayerId = 0;
    for (const auto& layer : sd.layers) {
        if (layer.id > maxLayerId) maxLayerId = layer.id;
        LayerRecord lr{layer.id, layer.order, layer.flags,
            layer.strokeR, layer.strokeG, layer.strokeB, layer.strokeA,
            layer.fillR, layer.fillG, layer.fillB, layer.fillA,
            layer.strokeWidth
        };
        layerRecords.push_back(lr);
        layerNames.push_back(layer.name);
    }
    nextLayerId_ = maxLayerId + 1;
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
        markTextQuadsDirty();
    }

    // Load Styles
    for (const auto& s : sd.styles) {
        auto* rec = styleSystem_.getStore().ensureStyle(s.entityId);
        rec->strokeSource = static_cast<engine::protocol::StyleSource>(s.strokeSource);
        rec->fillSource = static_cast<engine::protocol::StyleSource>(s.fillSource);
        rec->strokeR = s.strokeR; rec->strokeG = s.strokeG; rec->strokeB = s.strokeB; rec->strokeA = s.strokeA;
        rec->fillR = s.fillR; rec->fillG = s.fillG; rec->fillB = s.fillB; rec->fillA = s.fillA;
    }

    styleSystem_.rebuildLayerIndex();
    // Re-resolve all entities to ensure visual consistency
    // Optimization: only resolve entities that have styles or are on layers?
    // Actually, resolveAll is safer. Or just iterate all loaded IDs.
    // For MVP, iterating entities map and resolving is robust.
    for (const auto& kv : entityManager_.entities) {
        styleSystem_.resolveEntity(kv.first);
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

    selectionManager_.setSelection(sd.selection.data(), static_cast<std::uint32_t>(sd.selection.size()), SelectionManager::Mode::Replace, *this);

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

    if (!sd.historyBytes.empty()) {
        decodeHistoryBytes(sd.historyBytes.data(), sd.historyBytes.size());
    } else {
        clearHistory();
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

// ... (getTextStyleSnapshot, getTextStyleSummary)

void CadEngine::rebuildSnapshotBytes() const {
    engine::SnapshotData sd;
    sd.rects.reserve(entityManager_.rects.size());
    for (const auto& rec : entityManager_.rects) {
        if (rec.id == DRAFT_ENTITY_ID) continue;
        engine::RectSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.rects.push_back(std::move(snap));
    }

    sd.lines.reserve(entityManager_.lines.size());
    for (const auto& rec : entityManager_.lines) {
        if (rec.id == DRAFT_ENTITY_ID) continue;
        engine::LineSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.lines.push_back(std::move(snap));
    }

    sd.polylines.reserve(entityManager_.polylines.size());
    for (const auto& rec : entityManager_.polylines) {
        if (rec.id == DRAFT_ENTITY_ID) continue;
        engine::PolySnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.polylines.push_back(std::move(snap));
    }

    sd.points = entityManager_.points;

    sd.circles.reserve(entityManager_.circles.size());
    for (const auto& rec : entityManager_.circles) {
        if (rec.id == DRAFT_ENTITY_ID) continue;
        engine::CircleSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.circles.push_back(std::move(snap));
    }

    sd.polygons.reserve(entityManager_.polygons.size());
    for (const auto& rec : entityManager_.polygons) {
        if (rec.id == DRAFT_ENTITY_ID) continue;
        engine::PolygonSnapshot snap{};
        snap.rec = rec;
        snap.layerId = entityManager_.getEntityLayer(rec.id);
        snap.flags = entityManager_.getEntityFlags(rec.id);
        sd.polygons.push_back(std::move(snap));
    }

    sd.arrows.reserve(entityManager_.arrows.size());
    for (const auto& rec : entityManager_.arrows) {
        if (rec.id == DRAFT_ENTITY_ID) continue;
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
        snap.strokeR = layer.strokeR; snap.strokeG = layer.strokeG; snap.strokeB = layer.strokeB; snap.strokeA = layer.strokeA;
        snap.fillR = layer.fillR; snap.fillG = layer.fillG; snap.fillB = layer.fillB; snap.fillA = layer.fillA;
        snap.strokeWidth = layer.strokeWidth;
        sd.layers.push_back(std::move(snap));
    }

    sd.drawOrder = entityManager_.drawOrderIds; // drawOrderIds already has phantom removed in InteractionSession
    sd.selection = selectionManager_.getOrdered();

    const auto textIds = textSystem_.store.getAllTextIds();
    sd.texts.reserve(textIds.size());
    for (const std::uint32_t textId : textIds) {
        if (textId == DRAFT_ENTITY_ID) continue;
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

    // Save Styles
    // Access StyleSystem's store.
    // Wait, CadEngine doesn't expose StyleSystem directly? It's private.
    // engine_snapshot.cpp is part of CadEngine impl so it has access.
    // Need to include style_system.h if not already.
    // Yes, engine.h includes it.
    for (const auto& kv : styleSystem_.getStore().styles) {
        engine::EntityStyleSnapshot s{};
        s.entityId = kv.first;
        const auto& rec = kv.second;
        s.strokeSource = static_cast<std::uint8_t>(rec.strokeSource);
        s.fillSource = static_cast<std::uint8_t>(rec.fillSource);
        s.strokeR = rec.strokeR; s.strokeG = rec.strokeG; s.strokeB = rec.strokeB; s.strokeA = rec.strokeA;
        s.fillR = rec.fillR; s.fillG = rec.fillG; s.fillB = rec.fillB; s.fillA = rec.fillA;
        sd.styles.push_back(s);
    }

    sd.nextId = nextEntityId_;
    sd.historyBytes = encodeHistoryBytes();

    snapshotBytes = engine::buildSnapshotBytes(sd);
    snapshotDirty = false;
}

#include "engine/internal/engine_state_aliases_undef.h"
