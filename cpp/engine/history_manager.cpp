#include "engine/history_manager.h"
#include "engine/engine.h"
#include "engine/entity_manager.h"
#include "engine/text_system.h"
#include "engine/util.h"
#include <algorithm>
#include <cstring>
#include <cmath>

HistoryManager::HistoryManager(EntityManager& em, TextSystem& ts)
    : entityManager_(em), textSystem_(ts) {}

void HistoryManager::clear() {
    history_.clear();
    cursor_ = 0;
    transaction_.active = false;
    transaction_.entry = HistoryEntry{};
    transaction_.entityIndex.clear();
    historyGeneration_++;
}

bool HistoryManager::canUndo() const noexcept {
    return cursor_ > 0;
}

bool HistoryManager::canRedo() const noexcept {
    return cursor_ < history_.size();
}

bool HistoryManager::beginEntry(std::uint32_t nextEntityId) {
    if (suppressed_ || transaction_.active) return false;
    transaction_.active = true;
    transaction_.entry = HistoryEntry{};
    transaction_.entry.nextIdBefore = nextEntityId;
    transaction_.entry.nextIdAfter = nextEntityId; 
    transaction_.entityIndex.clear();
    return true;
}

void HistoryManager::discardEntry() {
    transaction_.active = false;
    transaction_.entry = HistoryEntry{};
    transaction_.entityIndex.clear();
}

void HistoryManager::pushHistoryEntry(HistoryEntry&& entry) {
    if (suppressed_) return;
    if (cursor_ < history_.size()) {
        history_.erase(history_.begin() + static_cast<std::ptrdiff_t>(cursor_), history_.end());
    }
    history_.push_back(std::move(entry));
    cursor_ = history_.size();
    historyGeneration_++;
}

void HistoryManager::markEntityChange(std::uint32_t id) {
    if (!transaction_.active || suppressed_) return;
    auto& entry = transaction_.entry;
    auto [it, inserted] = transaction_.entityIndex.emplace(id, entry.entities.size());
    if (!inserted) return;

    HistoryEntry::EntityChange change{};
    change.id = id;
    change.existedBefore = captureEntitySnapshot(id, change.before);
    entry.entities.push_back(std::move(change));
}

void HistoryManager::markLayerChange() {
    if (!transaction_.active || suppressed_) return;
    auto& entry = transaction_.entry;
    if (entry.hasLayerChange) return;

    const auto records = entityManager_.layerStore.snapshot();
    entry.layersBefore.reserve(records.size());
    for (const auto& layer : records) {
        engine::LayerSnapshot snap{};
        snap.id = layer.id;
        snap.order = layer.order;
        snap.flags = layer.flags;
        snap.name = entityManager_.layerStore.getLayerName(layer.id);
        entry.layersBefore.push_back(std::move(snap));
    }
    entry.hasLayerChange = true;
}

void HistoryManager::markDrawOrderChange() {
    if (!transaction_.active || suppressed_) return;
    auto& entry = transaction_.entry;
    if (entry.hasDrawOrderChange) return;
    entry.drawOrderBefore = entityManager_.drawOrderIds;
    entry.hasDrawOrderChange = true;
}

void HistoryManager::markSelectionChange(const std::vector<std::uint32_t>& currentSelection) {
    if (!transaction_.active || suppressed_) return;
    auto& entry = transaction_.entry;
    if (entry.hasSelectionChange) return;
    entry.selectionBefore = currentSelection;
    entry.hasSelectionChange = true;
}

void HistoryManager::finalizeHistoryEntry(HistoryEntry& entry, std::uint32_t nextEntityId, const std::vector<std::uint32_t>& currentSelection) {
    entry.nextIdAfter = nextEntityId;
    for (auto& change : entry.entities) {
        change.existedAfter = captureEntitySnapshot(change.id, change.after);
    }

    if (entry.hasLayerChange) {
        const auto records = entityManager_.layerStore.snapshot();
        entry.layersAfter.reserve(records.size());
        for (const auto& layer : records) {
            engine::LayerSnapshot snap{};
            snap.id = layer.id;
            snap.order = layer.order;
            snap.flags = layer.flags;
            snap.name = entityManager_.layerStore.getLayerName(layer.id);
            entry.layersAfter.push_back(std::move(snap));
        }
    }

    if (entry.hasDrawOrderChange) {
        entry.drawOrderAfter = entityManager_.drawOrderIds;
    }

    if (entry.hasSelectionChange) {
        entry.selectionAfter = currentSelection;
    }
}

bool HistoryManager::commitEntry(std::uint32_t nextEntityId, std::uint32_t currentGeneration, const std::vector<std::uint32_t>& currentSelection) {
    if (!transaction_.active) return false;
    HistoryEntry entry = std::move(transaction_.entry);
    transaction_.active = false;
    transaction_.entityIndex.clear();

    finalizeHistoryEntry(entry, nextEntityId, currentSelection);

    auto layersEqual = [](const std::vector<engine::LayerSnapshot>& a, const std::vector<engine::LayerSnapshot>& b) {
        if (a.size() != b.size()) return false;
        for (std::size_t i = 0; i < a.size(); ++i) {
            if (a[i].id != b[i].id) return false;
            if (a[i].order != b[i].order) return false;
            if (a[i].flags != b[i].flags) return false;
            if (a[i].name != b[i].name) return false;
        }
        return true;
    };

    if (entry.hasLayerChange && layersEqual(entry.layersBefore, entry.layersAfter)) {
        entry.hasLayerChange = false;
        entry.layersBefore.clear();
        entry.layersAfter.clear();
    }

    if (entry.hasDrawOrderChange && entry.drawOrderBefore == entry.drawOrderAfter) {
        entry.hasDrawOrderChange = false;
        entry.drawOrderBefore.clear();
        entry.drawOrderAfter.clear();
    }

    if (entry.hasSelectionChange && entry.selectionBefore == entry.selectionAfter) {
        entry.hasSelectionChange = false;
        entry.selectionBefore.clear();
        entry.selectionAfter.clear();
    }

    if (entry.entities.empty() && !entry.hasLayerChange && !entry.hasDrawOrderChange && !entry.hasSelectionChange) {
        return false;
    }

    std::sort(entry.entities.begin(), entry.entities.end(), [](const HistoryEntry::EntityChange& a, const HistoryEntry::EntityChange& b) {
        return a.id < b.id;
    });

    entry.generation = currentGeneration;
    pushHistoryEntry(std::move(entry));
    return true;
}

void HistoryManager::applyLayerSnapshot(const std::vector<engine::LayerSnapshot>& layers) {
     std::vector<LayerRecord> records;
    std::vector<std::string> names;
    records.reserve(layers.size());
    names.reserve(layers.size());
    for (const auto& layer : layers) {
        records.push_back(LayerRecord{layer.id, layer.order, layer.flags});
        names.push_back(layer.name);
    }
    entityManager_.layerStore.loadSnapshot(records, names);
}

void HistoryManager::applyDrawOrderSnapshot(const std::vector<std::uint32_t>& order) {
    entityManager_.drawOrderIds = order;
}

void HistoryManager::applySelectionSnapshot(const std::vector<std::uint32_t>& selection, CadEngine& engine) {
    if (selection.empty()) {
        engine.clearSelection();
        return;
    }
    engine.setSelection(selection.data(), static_cast<std::uint32_t>(selection.size()), CadEngine::SelectionMode::Replace);
}

void HistoryManager::undo(CadEngine& engine) {
    if (cursor_ == 0) return;
    cursor_--;
    const auto& entry = history_[cursor_];
    applyHistoryEntry(entry, false, engine);
    historyGeneration_++;
    engine.recordHistoryChanged();
}

void HistoryManager::redo(CadEngine& engine) {
    if (cursor_ >= history_.size()) return;
    const auto& entry = history_[cursor_];
    cursor_++;
    applyHistoryEntry(entry, true, engine);
    historyGeneration_++;
    engine.recordHistoryChanged();
}

void HistoryManager::applyHistoryEntry(const HistoryEntry& entry, bool useAfter, CadEngine& engine) {
    bool wasSuppressed = suppressed_;
    suppressed_ = true;

    if (entry.hasLayerChange) {
        applyLayerSnapshot(useAfter ? entry.layersAfter : entry.layersBefore);
        engine.renderDirty = true;
        engine.snapshotDirty = true;
        engine.textQuadsDirty_ = true;
        engine.recordDocChanged(static_cast<std::uint32_t>(CadEngine::ChangeMask::Layer));
    }

    for (const auto& change : entry.entities) {
        const bool exists = useAfter ? change.existedAfter : change.existedBefore;
        if (!exists) {
            engine.deleteEntity(change.id);
            continue;
        }
        const EntitySnapshot& snap = useAfter ? change.after : change.before;
        applyEntitySnapshot(snap, engine);
    }

    if (entry.hasDrawOrderChange) {
        applyDrawOrderSnapshot(useAfter ? entry.drawOrderAfter : entry.drawOrderBefore);
        engine.pickSystem_.setDrawOrder(entityManager_.drawOrderIds);
        engine.renderDirty = true;
        engine.snapshotDirty = true;
        if (!engine.selectionManager_.isEmpty()) {
            engine.selectionManager_.rebuildOrder(entityManager_.drawOrderIds);
        }
        engine.recordOrderChanged();
    }

    if (entry.hasSelectionChange) {
        applySelectionSnapshot(useAfter ? entry.selectionAfter : entry.selectionBefore, engine);
    }

    engine.setNextEntityId(useAfter ? entry.nextIdAfter : entry.nextIdBefore);
    engine.snapshotDirty = true;
    suppressed_ = wasSuppressed;
}

bool HistoryManager::captureEntitySnapshot(std::uint32_t id, EntitySnapshot& out) const {
    const auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end()) return false;

    out = EntitySnapshot{};
    out.id = id;
    out.kind = it->second.kind;
    out.layerId = entityManager_.getEntityLayer(id);
    out.flags = entityManager_.getEntityFlags(id);

    switch (out.kind) {
        case EntityKind::Rect: {
            const RectRec* rec = entityManager_.getRect(id);
            if (!rec) return false;
            out.rect = *rec;
            break;
        }
        case EntityKind::Line: {
            const LineRec* rec = entityManager_.getLine(id);
            if (!rec) return false;
            out.line = *rec;
            break;
        }
        case EntityKind::Polyline: {
            const PolyRec* rec = entityManager_.getPolyline(id);
            if (!rec) return false;
            out.poly = *rec;
            out.points.reserve(rec->count);
            for (std::uint32_t i = 0; i < rec->count; ++i) {
                const std::uint32_t idx = rec->offset + i;
                if (idx >= entityManager_.points.size()) break;
                out.points.push_back(entityManager_.points[idx]);
            }
            out.poly.count = static_cast<std::uint32_t>(out.points.size());
            out.poly.offset = 0;
            break;
        }
        case EntityKind::Circle: {
            const CircleRec* rec = entityManager_.getCircle(id);
            if (!rec) return false;
            out.circle = *rec;
            break;
        }
        case EntityKind::Polygon: {
            const PolygonRec* rec = entityManager_.getPolygon(id);
            if (!rec) return false;
            out.polygon = *rec;
            break;
        }
        case EntityKind::Arrow: {
            const ArrowRec* rec = entityManager_.getArrow(id);
            if (!rec) return false;
            out.arrow = *rec;
            break;
        }
        case EntityKind::Text: {
            const TextRec* rec = textSystem_.store.getText(id);
            if (!rec) return false;
            out.textHeader.x = rec->x;
            out.textHeader.y = rec->y;
            out.textHeader.rotation = rec->rotation;
            out.textHeader.boxMode = static_cast<std::uint8_t>(rec->boxMode);
            out.textHeader.align = static_cast<std::uint8_t>(rec->align);
            out.textHeader.constraintWidth = rec->constraintWidth;

            const auto& runs = textSystem_.store.getRuns(id);
            out.textRuns.clear();
            out.textRuns.reserve(runs.size());
            for (const auto& run : runs) {
                TextRunPayload payload{};
                payload.startIndex = run.startIndex;
                payload.length = run.length;
                payload.fontId = run.fontId;
                payload.fontSize = run.fontSize;
                payload.colorRGBA = run.colorRGBA;
                payload.flags = static_cast<std::uint8_t>(run.flags);
                out.textRuns.push_back(payload);
            }

            const std::string_view content = textSystem_.store.getContent(id);
            out.textContent.assign(content.begin(), content.end());
            out.textHeader.runCount = static_cast<std::uint32_t>(out.textRuns.size());
            out.textHeader.contentLength = static_cast<std::uint32_t>(out.textContent.size());
            break;
        }
        default: return false;
    }
    return true;
}

void HistoryManager::applyEntitySnapshot(const EntitySnapshot& snap, CadEngine& engine) {
    const std::uint32_t id = snap.id;
    if (id == 0) return;

    // We assume history is suppressed by the caller (Undo/Redo)

    switch (snap.kind) {
        case EntityKind::Rect:
            engine.upsertRect(id, snap.rect.x, snap.rect.y, snap.rect.w, snap.rect.h,
                snap.rect.r, snap.rect.g, snap.rect.b, snap.rect.a,
                snap.rect.sr, snap.rect.sg, snap.rect.sb, snap.rect.sa,
                snap.rect.strokeEnabled, snap.rect.strokeWidthPx);
            break;
        case EntityKind::Line:
            engine.upsertLine(id, snap.line.x0, snap.line.y0, snap.line.x1, snap.line.y1,
                snap.line.r, snap.line.g, snap.line.b, snap.line.a,
                snap.line.enabled, snap.line.strokeWidthPx);
            break;
        case EntityKind::Polyline: {
            const std::uint32_t count = static_cast<std::uint32_t>(snap.points.size());
            if (count < 2) {
                engine.deleteEntity(id);
                return;
            }
            const std::uint32_t offset = static_cast<std::uint32_t>(entityManager_.points.size());
            entityManager_.points.insert(entityManager_.points.end(), snap.points.begin(), snap.points.end());
            // upsertPolyline on engine computes AABB etc.
            engine.upsertPolyline(id, offset, count, snap.poly.r, snap.poly.g, snap.poly.b, snap.poly.a, snap.poly.enabled, snap.poly.strokeWidthPx);
            // Restore extra stroke props if needed? engine.upsertPolyline only takes some.
            // But upsertPolyline implementation sets them all from arguments.
            // Wait, engine.upsertPolyline takes: r, g, b, a, enabled, strokeWidthPx.
            // It does NOT take stroke color (sr, sg, sb, sa). It assumes same as fill or default?
            // Engine implementation: 
            // pl.sr = r; pl.sg = g; pl.sb = b; pl.sa = a; pl.strokeEnabled = enabled;
            
            // We need to handle this mismatch. The Engine's upsertPolyline is simplified.
            // We should fix the entity flags/props after upsert if they differ.
            // Or access entity manager directly to patch it up.
            
            const auto it = entityManager_.entities.find(id);
            if (it != entityManager_.entities.end() && it->second.kind == EntityKind::Polyline) {
                auto& pl = entityManager_.polylines[it->second.index];
                pl.sr = snap.poly.sr;
                pl.sg = snap.poly.sg;
                pl.sb = snap.poly.sb;
                pl.sa = snap.poly.sa;
                pl.strokeEnabled = snap.poly.strokeEnabled;
            }
            break;
        }
        case EntityKind::Circle:
            engine.upsertCircle(id, snap.circle.cx, snap.circle.cy, snap.circle.rx, snap.circle.ry,
                snap.circle.rot, snap.circle.sx, snap.circle.sy,
                snap.circle.r, snap.circle.g, snap.circle.b, snap.circle.a,
                snap.circle.sr, snap.circle.sg, snap.circle.sb, snap.circle.sa,
                snap.circle.strokeEnabled, snap.circle.strokeWidthPx);
            break;
        case EntityKind::Polygon:
            engine.upsertPolygon(id, snap.polygon.cx, snap.polygon.cy, snap.polygon.rx, snap.polygon.ry,
                snap.polygon.rot, snap.polygon.sx, snap.polygon.sy, snap.polygon.sides,
                snap.polygon.r, snap.polygon.g, snap.polygon.b, snap.polygon.a,
                snap.polygon.sr, snap.polygon.sg, snap.polygon.sb, snap.polygon.sa,
                snap.polygon.strokeEnabled, snap.polygon.strokeWidthPx);
            break;
        case EntityKind::Arrow:
            engine.upsertArrow(id, snap.arrow.ax, snap.arrow.ay, snap.arrow.bx, snap.arrow.by, snap.arrow.head,
                snap.arrow.sr, snap.arrow.sg, snap.arrow.sb, snap.arrow.sa,
                snap.arrow.strokeEnabled, snap.arrow.strokeWidthPx);
            break;
        case EntityKind::Text: {
            const std::uint32_t runCount = static_cast<std::uint32_t>(snap.textRuns.size());
            const std::uint32_t contentLength = static_cast<std::uint32_t>(snap.textContent.size());
            TextPayloadHeader header = snap.textHeader;
            header.runCount = runCount;
            header.contentLength = contentLength;
            engine.upsertText(
                    id,
                    header,
                    runCount == 0 ? nullptr : snap.textRuns.data(),
                    runCount,
                    contentLength == 0 ? "" : snap.textContent.data(),
                    contentLength);
            break;
        }
        default: break;
    }

    if (entityManager_.entities.find(id) == entityManager_.entities.end()) return;
    if (entityManager_.getEntityLayer(id) != snap.layerId) {
        engine.setEntityLayer(id, snap.layerId);
    }
    const std::uint32_t flagsMask =
        static_cast<std::uint32_t>(EntityFlags::Visible)
        | static_cast<std::uint32_t>(EntityFlags::Locked);
    if (entityManager_.getEntityFlags(id) != snap.flags) {
        engine.setEntityFlags(id, flagsMask, snap.flags);
    }
}

std::vector<std::uint8_t> HistoryManager::encodeBytes() const {
    if (history_.empty()) return {};

    std::vector<std::uint8_t> out;
    out.reserve(256);

     auto appendU32 = [&](std::uint32_t v) {
        const std::size_t o = out.size();
        out.resize(o + 4);
        writeU32LE(out.data(), o, v);
    };
    auto appendF32 = [&](float v) {
        const std::size_t o = out.size();
        out.resize(o + 4);
        writeF32LE(out.data(), o, v);
    };
    auto appendByte = [&](std::uint8_t v) {
        out.push_back(v);
    };

    appendU32(1); // Version (literal 1 for now, or use const)
    appendU32(static_cast<std::uint32_t>(history_.size()));
    appendU32(static_cast<std::uint32_t>(cursor_));
    appendU32(0);

    for (const auto& entry : history_) {
        std::uint32_t flags = 0;
        if (entry.hasLayerChange) flags |= 1u;
        if (entry.hasDrawOrderChange) flags |= 2u;
        if (entry.hasSelectionChange) flags |= 4u;
        
        appendU32(flags);
        appendU32(entry.nextIdBefore);
        appendU32(entry.nextIdAfter);

        if (entry.hasLayerChange) {
            appendU32(static_cast<std::uint32_t>(entry.layersBefore.size()));
            for (const auto& layer : entry.layersBefore) {
                appendU32(layer.id);
                appendU32(layer.order);
                appendU32(layer.flags);
                appendU32(static_cast<std::uint32_t>(layer.name.size()));
                const std::size_t o = out.size();
                out.resize(o + layer.name.size());
                if (!layer.name.empty()) {
                    std::memcpy(out.data() + o, layer.name.data(), layer.name.size());
                }
            }
            appendU32(static_cast<std::uint32_t>(entry.layersAfter.size()));
            for (const auto& layer : entry.layersAfter) {
                appendU32(layer.id);
                appendU32(layer.order);
                appendU32(layer.flags);
                appendU32(static_cast<std::uint32_t>(layer.name.size()));
                const std::size_t o = out.size();
                out.resize(o + layer.name.size());
                if (!layer.name.empty()) {
                    std::memcpy(out.data() + o, layer.name.data(), layer.name.size());
                }
            }
        }

        if (entry.hasDrawOrderChange) {
            appendU32(static_cast<std::uint32_t>(entry.drawOrderBefore.size()));
            for (const auto v : entry.drawOrderBefore) appendU32(v);
            appendU32(static_cast<std::uint32_t>(entry.drawOrderAfter.size()));
            for (const auto v : entry.drawOrderAfter) appendU32(v);
        }

        if (entry.hasSelectionChange) {
             appendU32(static_cast<std::uint32_t>(entry.selectionBefore.size()));
             for (const auto v : entry.selectionBefore) appendU32(v);
             appendU32(static_cast<std::uint32_t>(entry.selectionAfter.size()));
             for (const auto v : entry.selectionAfter) appendU32(v);
        }

        appendU32(static_cast<std::uint32_t>(entry.entities.size()));
        for (const auto& change : entry.entities) {
            appendU32(change.id);
            appendByte(change.existedBefore ? 1 : 0);
            appendByte(change.existedAfter ? 1 : 0);
            appendByte(0); 
            appendByte(0);
            
            auto appendEntitySnapshot = [&](const EntitySnapshot& snap) {
                appendU32(static_cast<std::uint32_t>(snap.kind));
                appendU32(snap.layerId);
                appendU32(snap.flags);

                switch (snap.kind) {
                    case EntityKind::Rect:
                        appendF32(snap.rect.x); appendF32(snap.rect.y); appendF32(snap.rect.w); appendF32(snap.rect.h);
                        appendF32(snap.rect.r); appendF32(snap.rect.g); appendF32(snap.rect.b); appendF32(snap.rect.a);
                        appendF32(snap.rect.sr); appendF32(snap.rect.sg); appendF32(snap.rect.sb); appendF32(snap.rect.sa);
                        appendF32(snap.rect.strokeEnabled); appendF32(snap.rect.strokeWidthPx);
                        break;
                    case EntityKind::Line:
                        appendF32(snap.line.x0); appendF32(snap.line.y0); appendF32(snap.line.x1); appendF32(snap.line.y1);
                        appendF32(snap.line.r); appendF32(snap.line.g); appendF32(snap.line.b); appendF32(snap.line.a);
                        appendF32(snap.line.enabled); appendF32(snap.line.strokeWidthPx);
                        break;
                    case EntityKind::Polyline:
                        appendU32(static_cast<std::uint32_t>(snap.points.size()));
                        appendF32(snap.poly.r); appendF32(snap.poly.g); appendF32(snap.poly.b); appendF32(snap.poly.a);
                        appendF32(snap.poly.sr); appendF32(snap.poly.sg); appendF32(snap.poly.sb); appendF32(snap.poly.sa);
                        appendF32(snap.poly.enabled); appendF32(snap.poly.strokeEnabled); appendF32(snap.poly.strokeWidthPx);
                        for (const auto& pt : snap.points) { appendF32(pt.x); appendF32(pt.y); }
                        break;
                    case EntityKind::Circle:
                        appendF32(snap.circle.cx); appendF32(snap.circle.cy); appendF32(snap.circle.rx); appendF32(snap.circle.ry);
                        appendF32(snap.circle.rot); appendF32(snap.circle.sx); appendF32(snap.circle.sy);
                        appendF32(snap.circle.r); appendF32(snap.circle.g); appendF32(snap.circle.b); appendF32(snap.circle.a);
                        appendF32(snap.circle.sr); appendF32(snap.circle.sg); appendF32(snap.circle.sb); appendF32(snap.circle.sa);
                        appendF32(snap.circle.strokeEnabled); appendF32(snap.circle.strokeWidthPx);
                        break;
                    case EntityKind::Polygon:
                        appendF32(snap.polygon.cx); appendF32(snap.polygon.cy); appendF32(snap.polygon.rx); appendF32(snap.polygon.ry);
                        appendF32(snap.polygon.rot); appendF32(snap.polygon.sx); appendF32(snap.polygon.sy);
                        appendU32(snap.polygon.sides);
                        appendF32(snap.polygon.r); appendF32(snap.polygon.g); appendF32(snap.polygon.b); appendF32(snap.polygon.a);
                        appendF32(snap.polygon.sr); appendF32(snap.polygon.sg); appendF32(snap.polygon.sb); appendF32(snap.polygon.sa);
                        appendF32(snap.polygon.strokeEnabled); appendF32(snap.polygon.strokeWidthPx);
                        break;
                     case EntityKind::Arrow:
                        appendF32(snap.arrow.ax); appendF32(snap.arrow.ay); appendF32(snap.arrow.bx); appendF32(snap.arrow.by);
                        appendF32(snap.arrow.head);
                        appendF32(snap.arrow.sr); appendF32(snap.arrow.sg); appendF32(snap.arrow.sb); appendF32(snap.arrow.sa);
                        appendF32(snap.arrow.strokeEnabled); appendF32(snap.arrow.strokeWidthPx);
                        break;
                    case EntityKind::Text: {
                        const std::uint32_t runCount = static_cast<std::uint32_t>(snap.textRuns.size());
                        const std::uint32_t contentLength = static_cast<std::uint32_t>(snap.textContent.size());
                        appendF32(snap.textHeader.x); appendF32(snap.textHeader.y); appendF32(snap.textHeader.rotation);
                        appendByte(snap.textHeader.boxMode); appendByte(snap.textHeader.align); appendByte(0); appendByte(0);
                        appendF32(snap.textHeader.constraintWidth);
                        appendU32(runCount); appendU32(contentLength);
                        for (const auto& run : snap.textRuns) {
                            appendU32(run.startIndex); appendU32(run.length); appendU32(run.fontId);
                            appendF32(run.fontSize); appendU32(run.colorRGBA); appendByte(run.flags);
                            appendByte(0); appendByte(0); appendByte(0);
                        }
                        const std::size_t o = out.size();
                        out.resize(o + contentLength);
                        if (contentLength > 0) std::memcpy(out.data() + o, snap.textContent.data(), contentLength);
                        break;
                    }
                    default: break;
                }
            };

            if (change.existedBefore) appendEntitySnapshot(change.before);
            if (change.existedAfter) appendEntitySnapshot(change.after);
        }
    }
    return out;
}

void HistoryManager::decodeBytes(const std::uint8_t* data, std::size_t len) {
    if (!data || len < 16) return;
    clear();
    
    std::size_t offset = 0;
    auto readU32Local = [&](std::uint32_t& v) {
        if (offset + 4 > len) return false;
        v = readU32(data, offset);
        offset += 4;
        return true;
    };
    auto readF32Local = [&](float& v) {
        if (offset + 4 > len) return false;
        v = readF32(data, offset);
        offset += 4;
        return true;
    };
    auto readByteLocal = [&](std::uint8_t& v) {
        if (offset + 1 > len) return false;
        v = data[offset++];
        return true;
    };

    std::uint32_t ver, count, curs, reserved;
    if (!readU32Local(ver) || !readU32Local(count) || !readU32Local(curs) || !readU32Local(reserved)) return;
    if (ver != 1) return; // Mismatch version

    history_.resize(count);
    cursor_ = curs;
    if (cursor_ > history_.size()) cursor_ = history_.size();

    for (std::size_t i = 0; i < count; ++i) {
        auto& entry = history_[i];
        std::uint32_t flags;
        if (!readU32Local(flags)) break;
        entry.hasLayerChange = (flags & 1) != 0;
        entry.hasDrawOrderChange = (flags & 2) != 0;
        entry.hasSelectionChange = (flags & 4) != 0;
        
        if (!readU32Local(entry.nextIdBefore)) break;
        if (!readU32Local(entry.nextIdAfter)) break;

        if (entry.hasLayerChange) {
            auto readLayers = [&](std::vector<engine::LayerSnapshot>& layers) -> bool {
                std::uint32_t lc;
                if (!readU32Local(lc)) return false;
                layers.resize(lc);
                for (auto& layer : layers) {
                    if (!readU32Local(layer.id) || !readU32Local(layer.order) || !readU32Local(layer.flags)) return false;
                    std::uint32_t nameLen;
                    if (!readU32Local(nameLen)) return false;
                    if (offset + nameLen > len) return false;
                    layer.name.assign(reinterpret_cast<const char*>(data + offset), nameLen);
                    offset += nameLen;
                }
                return true;
            };
            if (!readLayers(entry.layersBefore)) break;
            if (!readLayers(entry.layersAfter)) break;
        }

        if (entry.hasDrawOrderChange) {
            auto readOrder = [&](std::vector<std::uint32_t>& order) -> bool {
                std::uint32_t oc;
                if (!readU32Local(oc)) return false;
                order.resize(oc);
                for (auto& v : order) if (!readU32Local(v)) return false;
                return true;
            };
            if (!readOrder(entry.drawOrderBefore)) break;
            if (!readOrder(entry.drawOrderAfter)) break;
        }
        
        if (entry.hasSelectionChange) {
             auto readSel = [&](std::vector<std::uint32_t>& sel) -> bool {
                std::uint32_t sc;
                if (!readU32Local(sc)) return false;
                sel.resize(sc);
                for (auto& v : sel) if (!readU32Local(v)) return false;
                return true;
            };
            if (!readSel(entry.selectionBefore)) break;
            if (!readSel(entry.selectionAfter)) break;
        }

        std::uint32_t ec;
        if (!readU32Local(ec)) break;
        entry.entities.resize(ec);
        
        for (auto& change : entry.entities) {
            std::uint8_t eb, ea, dummy;
            if (!readU32Local(change.id) || !readByteLocal(eb) || !readByteLocal(ea) || !readByteLocal(dummy) || !readByteLocal(dummy)) break;
            change.existedBefore = (eb != 0);
            change.existedAfter = (ea != 0);
            
            auto readEntitySnapshot = [&](EntitySnapshot& snap) -> bool {
                std::uint32_t k;
                if (!readU32Local(k)) return false;
                snap.kind = static_cast<EntityKind>(k);
                if (!readU32Local(snap.layerId) || !readU32Local(snap.flags)) return false;
                
                 switch (snap.kind) {
                    case EntityKind::Rect:
                        if (!readF32Local(snap.rect.x) || !readF32Local(snap.rect.y) || !readF32Local(snap.rect.w) || !readF32Local(snap.rect.h) ||
                            !readF32Local(snap.rect.r) || !readF32Local(snap.rect.g) || !readF32Local(snap.rect.b) || !readF32Local(snap.rect.a) ||
                            !readF32Local(snap.rect.sr) || !readF32Local(snap.rect.sg) || !readF32Local(snap.rect.sb) || !readF32Local(snap.rect.sa) ||
                            !readF32Local(snap.rect.strokeEnabled) || !readF32Local(snap.rect.strokeWidthPx)) return false;
                        break;
                    case EntityKind::Line:
                        if (!readF32Local(snap.line.x0) || !readF32Local(snap.line.y0) || !readF32Local(snap.line.x1) || !readF32Local(snap.line.y1) ||
                            !readF32Local(snap.line.r) || !readF32Local(snap.line.g) || !readF32Local(snap.line.b) || !readF32Local(snap.line.a) ||
                            !readF32Local(snap.line.enabled) || !readF32Local(snap.line.strokeWidthPx)) return false;
                        break;
                    case EntityKind::Polyline: {
                        std::uint32_t pc;
                        if (!readU32Local(pc)) return false;
                         if (!readF32Local(snap.poly.r) || !readF32Local(snap.poly.g) || !readF32Local(snap.poly.b) || !readF32Local(snap.poly.a) ||
                             !readF32Local(snap.poly.sr) || !readF32Local(snap.poly.sg) || !readF32Local(snap.poly.sb) || !readF32Local(snap.poly.sa) ||
                             !readF32Local(snap.poly.enabled) || !readF32Local(snap.poly.strokeEnabled) || !readF32Local(snap.poly.strokeWidthPx)) return false;
                         snap.points.resize(pc);
                         for (auto& pt : snap.points) if (!readF32Local(pt.x) || !readF32Local(pt.y)) return false;
                         snap.poly.count = pc;
                         snap.poly.offset = 0;
                        break;
                    }
                    case EntityKind::Circle:
                        if (!readF32Local(snap.circle.cx) || !readF32Local(snap.circle.cy) || !readF32Local(snap.circle.rx) || !readF32Local(snap.circle.ry) ||
                            !readF32Local(snap.circle.rot) || !readF32Local(snap.circle.sx) || !readF32Local(snap.circle.sy) ||
                            !readF32Local(snap.circle.r) || !readF32Local(snap.circle.g) || !readF32Local(snap.circle.b) || !readF32Local(snap.circle.a) ||
                            !readF32Local(snap.circle.sr) || !readF32Local(snap.circle.sg) || !readF32Local(snap.circle.sb) || !readF32Local(snap.circle.sa) ||
                            !readF32Local(snap.circle.strokeEnabled) || !readF32Local(snap.circle.strokeWidthPx)) return false;
                        break;
                    case EntityKind::Polygon:
                         if (!readF32Local(snap.polygon.cx) || !readF32Local(snap.polygon.cy) || !readF32Local(snap.polygon.rx) || !readF32Local(snap.polygon.ry) ||
                            !readF32Local(snap.polygon.rot) || !readF32Local(snap.polygon.sx) || !readF32Local(snap.polygon.sy) ||
                            !readU32Local(snap.polygon.sides) ||
                            !readF32Local(snap.polygon.r) || !readF32Local(snap.polygon.g) || !readF32Local(snap.polygon.b) || !readF32Local(snap.polygon.a) ||
                            !readF32Local(snap.polygon.sr) || !readF32Local(snap.polygon.sg) || !readF32Local(snap.polygon.sb) || !readF32Local(snap.polygon.sa) ||
                            !readF32Local(snap.polygon.strokeEnabled) || !readF32Local(snap.polygon.strokeWidthPx)) return false;
                        break;
                    case EntityKind::Arrow:
                        if (!readF32Local(snap.arrow.ax) || !readF32Local(snap.arrow.ay) || !readF32Local(snap.arrow.bx) || !readF32Local(snap.arrow.by) ||
                            !readF32Local(snap.arrow.head) ||
                            !readF32Local(snap.arrow.sr) || !readF32Local(snap.arrow.sg) || !readF32Local(snap.arrow.sb) || !readF32Local(snap.arrow.sa) ||
                            !readF32Local(snap.arrow.strokeEnabled) || !readF32Local(snap.arrow.strokeWidthPx)) return false;
                        break;
                    case EntityKind::Text: {
                        std::uint32_t runCount, contentLength;
                        if (!readF32Local(snap.textHeader.x) || !readF32Local(snap.textHeader.y) || !readF32Local(snap.textHeader.rotation) ||
                            !readByteLocal(snap.textHeader.boxMode) || !readByteLocal(snap.textHeader.align) || !readByteLocal(dummy) || !readByteLocal(dummy) ||
                            !readF32Local(snap.textHeader.constraintWidth) || !readU32Local(runCount) || !readU32Local(contentLength)) return false;
                        
                        snap.textRuns.resize(runCount);
                        for (auto& run : snap.textRuns) {
                             if (!readU32Local(run.startIndex) || !readU32Local(run.length) || !readU32Local(run.fontId) ||
                                 !readF32Local(run.fontSize) || !readU32Local(run.colorRGBA) || !readByteLocal(run.flags) ||
                                 !readByteLocal(dummy) || !readByteLocal(dummy) || !readByteLocal(dummy)) return false;
                        }
                        if (offset + contentLength > len) return false;
                         snap.textContent.assign(reinterpret_cast<const char*>(data + offset), contentLength);
                         offset += contentLength;
                        break;
                    }
                    default: break;
                }
                return true;
            };

            if (change.existedBefore) {
                if (!readEntitySnapshot(change.before)) break;
                change.before.id = change.id;
            }
            if (change.existedAfter) {
                if (!readEntitySnapshot(change.after)) break;
                change.after.id = change.id;
            }
        }
    }
}
