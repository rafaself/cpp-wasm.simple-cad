// CadEngine snapshot and serialization methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"
#include "engine/persistence/snapshot.h"
#include "engine/core/string_utils.h"
#include "engine/core/util.h"
#include <unordered_set>
#include <cmath>

namespace {
    LayerStyle toLayerStyle(const engine::protocol::LayerStyleSnapshot& snap) {
        LayerStyle style{};
        unpackColorRGBA(snap.strokeRGBA, style.stroke.color.r, style.stroke.color.g, style.stroke.color.b, style.stroke.color.a);
        unpackColorRGBA(snap.fillRGBA, style.fill.color.r, style.fill.color.g, style.fill.color.b, style.fill.color.a);
        unpackColorRGBA(snap.textColorRGBA, style.textColor.color.r, style.textColor.color.g, style.textColor.color.b, style.textColor.color.a);
        unpackColorRGBA(snap.textBackgroundRGBA, style.textBackground.color.r, style.textBackground.color.g, style.textBackground.color.b, style.textBackground.color.a);
        style.stroke.enabled = snap.strokeEnabled ? 1.0f : 0.0f;
        style.fill.enabled = snap.fillEnabled ? 1.0f : 0.0f;
        style.textColor.enabled = 1.0f;
        style.textBackground.enabled = snap.textBackgroundEnabled ? 1.0f : 0.0f;
        return style;
    }

    engine::protocol::LayerStyleSnapshot toLayerStyleSnapshot(const LayerStyle& style) {
        engine::protocol::LayerStyleSnapshot snap{};
        snap.strokeRGBA = packColorRGBA(style.stroke.color.r, style.stroke.color.g, style.stroke.color.b, style.stroke.color.a);
        snap.fillRGBA = packColorRGBA(style.fill.color.r, style.fill.color.g, style.fill.color.b, style.fill.color.a);
        snap.textColorRGBA = packColorRGBA(style.textColor.color.r, style.textColor.color.g, style.textColor.color.b, style.textColor.color.a);
        snap.textBackgroundRGBA = packColorRGBA(style.textBackground.color.r, style.textBackground.color.g, style.textBackground.color.b, style.textBackground.color.a);
        snap.strokeEnabled = style.stroke.enabled > 0.5f ? 1 : 0;
        snap.fillEnabled = style.fill.enabled > 0.5f ? 1 : 0;
        snap.textBackgroundEnabled = style.textBackground.enabled > 0.5f ? 1 : 0;
        snap.reserved = 0;
        return snap;
    }
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
    std::vector<LayerStyle> layerStyles;
    layerRecords.reserve(sd.layers.size());
    layerNames.reserve(sd.layers.size());
    layerStyles.reserve(sd.layers.size());
    std::uint32_t maxLayerId = 0;
    for (const auto& layer : sd.layers) {
        if (layer.id > maxLayerId) maxLayerId = layer.id;
        layerRecords.push_back(LayerRecord{layer.id, layer.order, layer.flags});
        layerNames.push_back(layer.name);
        layerStyles.push_back(toLayerStyle(layer.style));
    }
    nextLayerId_ = maxLayerId + 1;
    entityManager_.layerStore.loadSnapshot(layerRecords, layerNames, layerStyles);

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
    entityManager_.styleOverrides.clear();

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

    if (!sd.styleOverrides.empty()) {
        for (const auto& snap : sd.styleOverrides) {
            if (entityManager_.entities.find(snap.id) == entityManager_.entities.end()) {
                continue;
            }
            EntityStyleOverrides entry{};
            entry.colorMask = snap.colorMask;
            entry.enabledMask = snap.enabledMask;
            unpackColorRGBA(snap.textColorRGBA, entry.textColor.r, entry.textColor.g, entry.textColor.b, entry.textColor.a);
            unpackColorRGBA(snap.textBackgroundRGBA, entry.textBackground.r, entry.textBackground.g, entry.textBackground.b, entry.textBackground.a);
            entry.fillEnabled = snap.fillEnabled ? 1.0f : 0.0f;
            entry.textBackgroundEnabled = snap.textBackgroundEnabled ? 1.0f : 0.0f;
            entityManager_.styleOverrides.emplace(snap.id, entry);
        }
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
    if (!rec) {
        return out;
    }
    out.align = static_cast<std::uint8_t>(rec->align);

    auto cs = *caretOpt;
    std::uint32_t selStart = cs.selectionStart;
    std::uint32_t selEnd = cs.selectionEnd;
    if (selStart > selEnd) std::swap(selStart, selEnd);

    // Logical indices
    out.selectionStartLogical = engine::byteToLogicalIndex(content, selStart);
    out.selectionEndLogical = engine::byteToLogicalIndex(content, selEnd);
    out.selectionStartByte = selStart;
    out.selectionEndByte = selEnd;
    out.caretByte = cs.caretIndex;
    out.caretLogical = engine::byteToLogicalIndex(content, cs.caretIndex);

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
            // 2. If caret is at start of content, inherit from first run
            if (selStart == 0) {
                for (const auto& r : runs) {
                    if (r.startIndex == 0 && r.length > 0) {
                        return hasFlag(r.flags, flag) ? 1 : 0;
                    }
                }
            }
            // 3. Check for run containing caret
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

    auto resolveCaretFontId = [&](std::uint32_t& value) -> bool {
        for (const auto& r : runs) {
            if (r.length == 0 && r.startIndex == selStart) {
                value = r.fontId;
                return true;
            }
        }
        if (selStart == 0) {
            for (const auto& r : runs) {
                if (r.startIndex == 0 && r.length > 0) {
                    value = r.fontId;
                    return true;
                }
            }
        }
        for (const auto& r : runs) {
            const std::uint32_t rEnd = r.startIndex + r.length;
            if (selStart > r.startIndex && selStart < rEnd) {
                value = r.fontId;
                return true;
            }
            if (selStart > 0 && selStart == rEnd) {
                value = r.fontId;
                return true;
            }
        }
        return false;
    };

    auto resolveCaretFontSize = [&](float& value) -> bool {
        for (const auto& r : runs) {
            if (r.length == 0 && r.startIndex == selStart) {
                value = r.fontSize;
                return true;
            }
        }
        if (selStart == 0) {
            for (const auto& r : runs) {
                if (r.startIndex == 0 && r.length > 0) {
                    value = r.fontSize;
                    return true;
                }
            }
        }
        for (const auto& r : runs) {
            const std::uint32_t rEnd = r.startIndex + r.length;
            if (selStart > r.startIndex && selStart < rEnd) {
                value = r.fontSize;
                return true;
            }
            if (selStart > 0 && selStart == rEnd) {
                value = r.fontSize;
                return true;
            }
        }
        return false;
    };

    auto resolveFontIdState = [&]() -> std::pair<std::uint8_t, std::uint32_t> {
        if (selStart == selEnd) {
            std::uint32_t value = 0;
            if (resolveCaretFontId(value)) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
            }
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0u };
        }

        bool found = false;
        std::uint32_t value = 0;
        for (const auto& r : runs) {
            const std::uint32_t rStart = r.startIndex;
            const std::uint32_t rEnd = r.startIndex + r.length;
            const std::uint32_t oStart = std::max(rStart, selStart);
            const std::uint32_t oEnd = std::min(rEnd, selEnd);
            if (oStart >= oEnd) continue;

            if (!found) {
                value = r.fontId;
                found = true;
                continue;
            }

            if (value != r.fontId) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Mixed), value };
            }
        }

        if (!found) {
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0u };
        }
        return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
    };

    auto resolveFontSizeState = [&]() -> std::pair<std::uint8_t, float> {
        if (selStart == selEnd) {
            float value = 0.0f;
            if (resolveCaretFontSize(value)) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
            }
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0.0f };
        }

        bool found = false;
        float value = 0.0f;
        for (const auto& r : runs) {
            const std::uint32_t rStart = r.startIndex;
            const std::uint32_t rEnd = r.startIndex + r.length;
            const std::uint32_t oStart = std::max(rStart, selStart);
            const std::uint32_t oEnd = std::min(rEnd, selEnd);
            if (oStart >= oEnd) continue;

            if (!found) {
                value = r.fontSize;
                found = true;
                continue;
            }

            if (std::fabs(value - r.fontSize) > 0.01f) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Mixed), value };
            }
        }

        if (!found) {
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0.0f };
        }
        return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
    };

    const int boldState = triStateAttr(TextStyleFlags::Bold);
    const int italicState = triStateAttr(TextStyleFlags::Italic);
    const int underlineState = triStateAttr(TextStyleFlags::Underline);
    // Note: Engine uses 'Strike' internally but frontend maps to 'Strikethrough'.
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

    const auto [fontIdState, fontIdValue] = resolveFontIdState();
    const auto [fontSizeState, fontSizeValue] = resolveFontSizeState();
    out.fontIdTriState = fontIdState;
    out.fontSizeTriState = fontSizeState;
    out.fontId = fontIdValue;
    out.fontSize = fontSizeValue;
    out.textGeneration = generation;
    out.styleTriStateParamsLen = 0;
    return out;
}

engine::text::TextStyleSnapshot CadEngine::getTextStyleSummary(std::uint32_t textId) const {
    engine::text::TextStyleSnapshot out{};
    if (!textSystem_.initialized) {
        return out;
    }

    const_cast<CadEngine*>(this)->textSystem_.layoutEngine.layoutDirtyTexts();

    const std::string_view content = textSystem_.store.getContent(textId);
    const auto runs = textSystem_.store.getRuns(textId);

    const TextRec* rec = textSystem_.store.getText(textId);
    if (rec) {
        out.align = static_cast<std::uint8_t>(rec->align);
    }

    std::uint32_t selStart = 0;
    std::uint32_t selEnd = static_cast<std::uint32_t>(content.size());

    out.selectionStartLogical = engine::byteToLogicalIndex(content, selStart);
    out.selectionEndLogical = engine::byteToLogicalIndex(content, selEnd);
    out.selectionStartByte = selStart;
    out.selectionEndByte = selEnd;
    out.caretByte = selStart;
    out.caretLogical = engine::byteToLogicalIndex(content, selStart);

    const TextCaretPosition cp = getTextCaretPosition(textId, selStart);
    out.x = cp.x;
    out.y = cp.y;
    out.lineHeight = cp.height;
    out.lineIndex = static_cast<std::uint16_t>(cp.lineIndex);

    auto triStateAttr = [&](TextStyleFlags flag) -> int {
        if (selStart == selEnd) {
            for (const auto& r : runs) {
                if (r.length == 0 && r.startIndex == selStart) {
                    return hasFlag(r.flags, flag) ? 1 : 0;
                }
            }
            if (selStart == 0) {
                for (const auto& r : runs) {
                    if (r.startIndex == 0 && r.length > 0) {
                        return hasFlag(r.flags, flag) ? 1 : 0;
                    }
                }
            }
            for (const auto& r : runs) {
                if (selStart > r.startIndex && selStart < (r.startIndex + r.length)) {
                     return hasFlag(r.flags, flag) ? 1 : 0;
                }
                if (selStart > 0 && selStart == (r.startIndex + r.length)) {
                     return hasFlag(r.flags, flag) ? 1 : 0;
                }
            }
            return 0;
        }

        int state = -1;
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

    auto resolveCaretFontId = [&](std::uint32_t& value) -> bool {
        for (const auto& r : runs) {
            if (r.length == 0 && r.startIndex == selStart) {
                value = r.fontId;
                return true;
            }
        }
        if (selStart == 0) {
            for (const auto& r : runs) {
                if (r.startIndex == 0 && r.length > 0) {
                    value = r.fontId;
                    return true;
                }
            }
        }
        for (const auto& r : runs) {
            const std::uint32_t rEnd = r.startIndex + r.length;
            if (selStart > r.startIndex && selStart < rEnd) {
                value = r.fontId;
                return true;
            }
            if (selStart > 0 && selStart == rEnd) {
                value = r.fontId;
                return true;
            }
        }
        return false;
    };

    auto resolveCaretFontSize = [&](float& value) -> bool {
        for (const auto& r : runs) {
            if (r.length == 0 && r.startIndex == selStart) {
                value = r.fontSize;
                return true;
            }
        }
        if (selStart == 0) {
            for (const auto& r : runs) {
                if (r.startIndex == 0 && r.length > 0) {
                    value = r.fontSize;
                    return true;
                }
            }
        }
        for (const auto& r : runs) {
            const std::uint32_t rEnd = r.startIndex + r.length;
            if (selStart > r.startIndex && selStart < rEnd) {
                value = r.fontSize;
                return true;
            }
            if (selStart > 0 && selStart == rEnd) {
                value = r.fontSize;
                return true;
            }
        }
        return false;
    };

    auto resolveFontIdState = [&]() -> std::pair<std::uint8_t, std::uint32_t> {
        if (selStart == selEnd) {
            std::uint32_t value = 0;
            if (resolveCaretFontId(value)) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
            }
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0u };
        }

        bool found = false;
        std::uint32_t value = 0;
        for (const auto& r : runs) {
            const std::uint32_t rStart = r.startIndex;
            const std::uint32_t rEnd = r.startIndex + r.length;
            const std::uint32_t oStart = std::max(rStart, selStart);
            const std::uint32_t oEnd = std::min(rEnd, selEnd);
            if (oStart >= oEnd) continue;

            if (!found) {
                value = r.fontId;
                found = true;
                continue;
            }

            if (value != r.fontId) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Mixed), value };
            }
        }

        if (!found) {
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0u };
        }
        return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
    };

    auto resolveFontSizeState = [&]() -> std::pair<std::uint8_t, float> {
        if (selStart == selEnd) {
            float value = 0.0f;
            if (resolveCaretFontSize(value)) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
            }
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0.0f };
        }

        bool found = false;
        float value = 0.0f;
        for (const auto& r : runs) {
            const std::uint32_t rStart = r.startIndex;
            const std::uint32_t rEnd = r.startIndex + r.length;
            const std::uint32_t oStart = std::max(rStart, selStart);
            const std::uint32_t oEnd = std::min(rEnd, selEnd);
            if (oStart >= oEnd) continue;

            if (!found) {
                value = r.fontSize;
                found = true;
                continue;
            }

            if (std::fabs(value - r.fontSize) > 0.01f) {
                return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Mixed), value };
            }
        }

        if (!found) {
            return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::Off), 0.0f };
        }
        return { static_cast<std::uint8_t>(engine::text::TextStyleTriState::On), value };
    };

    const int boldState = triStateAttr(TextStyleFlags::Bold);
    const int italicState = triStateAttr(TextStyleFlags::Italic);
    const int underlineState = triStateAttr(TextStyleFlags::Underline);
    const int strikeState = triStateAttr(TextStyleFlags::Strike);

    auto pack2bits = [](int s) -> std::uint8_t {
        switch (s) {
            case 0: return 0;
            case 1: return 1;
            case 2: return 2;
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

    const auto [fontIdState, fontIdValue] = resolveFontIdState();
    const auto [fontSizeState, fontSizeValue] = resolveFontSizeState();
    out.fontIdTriState = fontIdState;
    out.fontSizeTriState = fontSizeState;
    out.fontId = fontIdValue;
    out.fontSize = fontSizeValue;
    out.textGeneration = generation;
    out.styleTriStateParamsLen = 0;
    return out;
}

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
        snap.style = toLayerStyleSnapshot(entityManager_.layerStore.getLayerStyle(layer.id));
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

    sd.nextId = nextEntityId_;
    sd.historyBytes = encodeHistoryBytes();

    sd.styleOverrides.clear();
    sd.styleOverrides.reserve(entityManager_.styleOverrides.size());
    for (const auto& kv : entityManager_.styleOverrides) {
        if (kv.first == DRAFT_ENTITY_ID) continue;
        if (entityManager_.entities.find(kv.first) == entityManager_.entities.end()) continue;
        const EntityStyleOverrides& overrides = kv.second;
        if (overrides.colorMask == 0 && overrides.enabledMask == 0) continue;
        engine::StyleOverrideSnapshot snap{};
        snap.id = kv.first;
        snap.colorMask = overrides.colorMask;
        snap.enabledMask = overrides.enabledMask;
        snap.reserved = 0;
        snap.textColorRGBA = packColorRGBA(overrides.textColor.r, overrides.textColor.g, overrides.textColor.b, overrides.textColor.a);
        snap.textBackgroundRGBA = packColorRGBA(overrides.textBackground.r, overrides.textBackground.g, overrides.textBackground.b, overrides.textBackground.a);
        snap.fillEnabled = overrides.fillEnabled > 0.5f ? 1u : 0u;
        snap.textBackgroundEnabled = overrides.textBackgroundEnabled > 0.5f ? 1u : 0u;
        sd.styleOverrides.push_back(std::move(snap));
    }

    snapshotBytes = engine::buildSnapshotBytes(sd);
    snapshotDirty = false;
}

#include "engine/internal/engine_state_aliases_undef.h"
