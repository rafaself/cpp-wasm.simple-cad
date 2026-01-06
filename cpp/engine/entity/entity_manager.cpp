#include "engine/entity/entity_manager.h"
#include <cmath>

namespace {
    constexpr float kColorByteScale = 1.0f / 255.0f;

    StyleColor makeColor(float r, float g, float b, float a) {
        return StyleColor{r, g, b, a};
    }

    LayerStyle makeDefaultLayerStyle() {
        LayerStyle style{};
        style.stroke.color = makeColor(1.0f, 1.0f, 1.0f, 1.0f);
        style.stroke.enabled = 1.0f;
        style.fill.color = makeColor(217.0f * kColorByteScale, 217.0f * kColorByteScale, 217.0f * kColorByteScale, 1.0f);
        style.fill.enabled = 1.0f;
        style.textColor.color = makeColor(1.0f, 1.0f, 1.0f, 1.0f);
        style.textColor.enabled = 1.0f;
        style.textBackground.color = makeColor(0.0f, 0.0f, 0.0f, 1.0f);
        style.textBackground.enabled = 0.0f;
        return style;
    }

    StyleEntry* selectStyleEntry(LayerStyle& style, StyleTarget target) {
        switch (target) {
            case StyleTarget::Stroke: return &style.stroke;
            case StyleTarget::Fill: return &style.fill;
            case StyleTarget::TextColor: return &style.textColor;
            case StyleTarget::TextBackground: return &style.textBackground;
            default: return nullptr;
        }
    }

    const StyleEntry* selectStyleEntry(const LayerStyle& style, StyleTarget target) {
        switch (target) {
            case StyleTarget::Stroke: return &style.stroke;
            case StyleTarget::Fill: return &style.fill;
            case StyleTarget::TextColor: return &style.textColor;
            case StyleTarget::TextBackground: return &style.textBackground;
            default: return nullptr;
        }
    }
}

void LayerStore::clear() {
    layers_.clear();
    names_.clear();
    styles_.clear();
    order_.clear();
    ensureLayer(kDefaultLayerId);
    names_[kDefaultLayerId] = "Default";
}

void LayerStore::ensureLayer(std::uint32_t id) {
    if (layers_.find(id) != layers_.end()) return;
    const std::uint32_t order = static_cast<std::uint32_t>(order_.size());
    layers_.emplace(id, LayerRecord{ id, order, kDefaultFlags });
    order_.push_back(id);
    if (names_.find(id) == names_.end()) {
        names_.emplace(id, "Layer");
    }
    if (styles_.find(id) == styles_.end()) {
        styles_.emplace(id, makeDefaultLayerStyle());
    }
}

bool LayerStore::deleteLayer(std::uint32_t id) {
    if (id == kDefaultLayerId) return false;
    auto it = layers_.find(id);
    if (it == layers_.end()) return false;
    layers_.erase(it);
    names_.erase(id);
    styles_.erase(id);
    for (std::size_t i = 0; i < order_.size(); ++i) {
        if (order_[i] == id) {
            order_.erase(order_.begin() + static_cast<std::ptrdiff_t>(i));
            break;
        }
    }
    return true;
}

void LayerStore::setLayerFlags(std::uint32_t id, std::uint32_t mask, std::uint32_t value) {
    ensureLayer(id);
    auto it = layers_.find(id);
    if (it == layers_.end()) return;
    const std::uint32_t prev = it->second.flags;
    const std::uint32_t next = (prev & ~mask) | (value & mask);
    it->second.flags = next;
}

void LayerStore::setLayerName(std::uint32_t id, const std::string& name) {
    ensureLayer(id);
    names_[id] = name;
}

void LayerStore::setLayerStyleColor(std::uint32_t id, StyleTarget target, const StyleColor& color) {
    ensureLayer(id);
    auto it = styles_.find(id);
    if (it == styles_.end()) return;
    StyleEntry* entry = selectStyleEntry(it->second, target);
    if (!entry) return;
    entry->color = color;
}

void LayerStore::setLayerStyleEnabled(std::uint32_t id, StyleTarget target, bool enabled) {
    ensureLayer(id);
    auto it = styles_.find(id);
    if (it == styles_.end()) return;
    StyleEntry* entry = selectStyleEntry(it->second, target);
    if (!entry) return;
    entry->enabled = enabled ? 1.0f : 0.0f;
}

LayerStyle LayerStore::getLayerStyle(std::uint32_t id) const {
    const auto it = styles_.find(id);
    if (it != styles_.end()) return it->second;
    return makeDefaultLayerStyle();
}

void LayerStore::loadSnapshot(
    const std::vector<LayerRecord>& records,
    const std::vector<std::string>& names,
    const std::vector<LayerStyle>& styles
) {
    layers_.clear();
    names_.clear();
    styles_.clear();
    order_.clear();

    if (records.empty()) {
        ensureLayer(kDefaultLayerId);
        names_[kDefaultLayerId] = "Default";
        styles_[kDefaultLayerId] = makeDefaultLayerStyle();
        return;
    }

    std::vector<std::size_t> indices(records.size());
    for (std::size_t i = 0; i < indices.size(); ++i) indices[i] = i;

    std::stable_sort(indices.begin(), indices.end(), [&](std::size_t a, std::size_t b) {
        return records[a].order < records[b].order;
    });

    for (std::size_t idx = 0; idx < indices.size(); ++idx) {
        const std::size_t i = indices[idx];
        const LayerRecord& rec = records[i];
        const std::uint32_t order = static_cast<std::uint32_t>(order_.size());
        layers_.emplace(rec.id, LayerRecord{rec.id, order, rec.flags});
        order_.push_back(rec.id);
        if (i < names.size()) {
            names_[rec.id] = names[i];
        }
        if (i < styles.size()) {
            styles_[rec.id] = styles[i];
        } else {
            styles_[rec.id] = makeDefaultLayerStyle();
        }
    }

    if (layers_.find(kDefaultLayerId) == layers_.end()) {
        const std::uint32_t order = static_cast<std::uint32_t>(order_.size());
        layers_.emplace(kDefaultLayerId, LayerRecord{kDefaultLayerId, order, kDefaultFlags});
        order_.push_back(kDefaultLayerId);
        names_[kDefaultLayerId] = "Default";
        styles_[kDefaultLayerId] = makeDefaultLayerStyle();
    }
}

std::uint32_t LayerStore::getLayerFlags(std::uint32_t id) const {
    auto it = layers_.find(id);
    if (it == layers_.end()) return kDefaultFlags;
    return it->second.flags;
}

std::string LayerStore::getLayerName(std::uint32_t id) const {
    auto it = names_.find(id);
    if (it == names_.end()) return std::string();
    return it->second;
}

std::vector<LayerRecord> LayerStore::snapshot() const {
    std::vector<LayerRecord> out;
    out.reserve(order_.size());
    for (std::size_t i = 0; i < order_.size(); ++i) {
        const std::uint32_t id = order_[i];
        auto it = layers_.find(id);
        if (it == layers_.end()) continue;
        LayerRecord rec = it->second;
        rec.order = static_cast<std::uint32_t>(i);
        out.push_back(rec);
    }
    return out;
}

bool LayerStore::isLayerVisible(std::uint32_t id) const {
    return (getLayerFlags(id) & static_cast<std::uint32_t>(LayerFlags::Visible)) != 0;
}

bool LayerStore::isLayerLocked(std::uint32_t id) const {
    return (getLayerFlags(id) & static_cast<std::uint32_t>(LayerFlags::Locked)) != 0;
}

EntityManager::EntityManager() {
    layerStore.clear();
}

void EntityManager::clear() noexcept {
    rects.clear();
    lines.clear();
    polylines.clear();
    points.clear();
    circles.clear();
    polygons.clear();
    arrows.clear();
    entities.clear();
    drawOrderIds.clear();
    entityFlags.clear();
    entityLayers.clear();
    styleOverrides.clear();
    layerStore.clear();
}

void EntityManager::reserve(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints) {
    rects.reserve(maxRects);
    lines.reserve(maxLines);
    polylines.reserve(maxPolylines);
    points.reserve(maxPoints);
}

void EntityManager::deleteEntity(std::uint32_t id) noexcept {
    const auto it = entities.find(id);
    if (it == entities.end()) return;
    const EntityRef ref = it->second;
    entities.erase(it);
    entityFlags.erase(id);
    entityLayers.erase(id);
    styleOverrides.erase(id);

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
    
    // Text entities are just removed from map/drawOrder here.
    // External store cleanup is caller's responsibility.
}

void EntityManager::upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx) {
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
        ensureEntityMetadata(id);
        return;
    }

    rects.push_back(RectRec{id, x, y, w, h, r, g, b, a, sr, sg, sb, sa, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Rect, static_cast<std::uint32_t>(rects.size() - 1)};
    drawOrderIds.push_back(id);
    ensureEntityMetadata(id);
}

void EntityManager::upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind != EntityKind::Line) {
        deleteEntity(id);
    }

    const auto it2 = entities.find(id);
    if (it2 != entities.end()) {
        auto& l = lines[it2->second.index];
        l.x0 = x0; l.y0 = y0; l.x1 = x1; l.y1 = y1;
        l.r = r; l.g = g; l.b = b; l.a = a; l.enabled = enabled; l.strokeWidthPx = strokeWidthPx;
        ensureEntityMetadata(id);
        return;
    }

    lines.push_back(LineRec{id, x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Line, static_cast<std::uint32_t>(lines.size() - 1)};
    drawOrderIds.push_back(id);
    ensureEntityMetadata(id);
}

void EntityManager::upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx) {
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
        pl.sr = r; pl.sg = g; pl.sb = b; pl.sa = a; pl.strokeEnabled = enabled;
        ensureEntityMetadata(id);
        return;
    }

    polylines.push_back(PolyRec{id, offset, count, r, g, b, a, r, g, b, a, enabled, enabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Polyline, static_cast<std::uint32_t>(polylines.size() - 1)};
    drawOrderIds.push_back(id);
    ensureEntityMetadata(id);
}

void EntityManager::upsertCircle(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx) {
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
        ensureEntityMetadata(id);
        return;
    }

    circles.push_back(CircleRec{id, cx, cy, rx, ry, rot, sx, sy, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Circle, static_cast<std::uint32_t>(circles.size() - 1)};
    drawOrderIds.push_back(id);
    ensureEntityMetadata(id);
}

void EntityManager::upsertPolygon(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, std::uint32_t sides, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx) {
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
        ensureEntityMetadata(id);
        return;
    }

    polygons.push_back(PolygonRec{id, cx, cy, rx, ry, rot, sx, sy, sides, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Polygon, static_cast<std::uint32_t>(polygons.size() - 1)};
    drawOrderIds.push_back(id);
    ensureEntityMetadata(id);
}

void EntityManager::upsertArrow(std::uint32_t id, float ax, float ay, float bx, float by, float head, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx) {
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
        ensureEntityMetadata(id);
        return;
    }

    arrows.push_back(ArrowRec{id, ax, ay, bx, by, head, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Arrow, static_cast<std::uint32_t>(arrows.size() - 1)};
    drawOrderIds.push_back(id);
    ensureEntityMetadata(id);
}

void EntityManager::registerTextEntity(std::uint32_t id) {
    const auto it = entities.find(id);
    if (it != entities.end()) {
        if (it->second.kind != EntityKind::Text) {
            deleteEntity(id);
        } else {
            ensureEntityMetadata(id);
            return;
        }
    }

    // For text, index matches ID as per original engine.cpp convention
    entities[id] = EntityRef{EntityKind::Text, id};
    drawOrderIds.push_back(id);
    ensureEntityMetadata(id);
}

void EntityManager::ensureEntityMetadata(std::uint32_t id) {
    layerStore.ensureLayer(LayerStore::kDefaultLayerId);
    if (entityFlags.find(id) == entityFlags.end()) {
        entityFlags[id] = static_cast<std::uint32_t>(EntityFlags::Visible);
    }
    if (entityLayers.find(id) == entityLayers.end()) {
        entityLayers[id] = LayerStore::kDefaultLayerId;
    }
}

EntityStyleOverrides* EntityManager::getEntityStyleOverrides(std::uint32_t id) {
    auto it = styleOverrides.find(id);
    if (it == styleOverrides.end()) return nullptr;
    return &it->second;
}

const EntityStyleOverrides* EntityManager::getEntityStyleOverrides(std::uint32_t id) const {
    auto it = styleOverrides.find(id);
    if (it == styleOverrides.end()) return nullptr;
    return &it->second;
}

EntityStyleOverrides& EntityManager::ensureEntityStyleOverrides(std::uint32_t id) {
    auto it = styleOverrides.find(id);
    if (it != styleOverrides.end()) return it->second;
    EntityStyleOverrides entry{};
    auto inserted = styleOverrides.emplace(id, entry);
    return inserted.first->second;
}

void EntityManager::clearEntityStyleOverrides(std::uint32_t id) {
    styleOverrides.erase(id);
}

void EntityManager::setEntityLayer(std::uint32_t id, std::uint32_t layerId) {
    layerStore.ensureLayer(layerId);
    entityLayers[id] = layerId;
}

std::uint32_t EntityManager::getEntityLayer(std::uint32_t id) const {
    const auto it = entityLayers.find(id);
    if (it != entityLayers.end()) return it->second;
    return LayerStore::kDefaultLayerId;
}

void EntityManager::setEntityFlags(std::uint32_t id, std::uint32_t mask, std::uint32_t value) {
    const std::uint32_t prev = getEntityFlags(id);
    const std::uint32_t next = (prev & ~mask) | (value & mask);
    entityFlags[id] = next;
}

std::uint32_t EntityManager::getEntityFlags(std::uint32_t id) const {
    const auto it = entityFlags.find(id);
    if (it != entityFlags.end()) return it->second;
    return static_cast<std::uint32_t>(EntityFlags::Visible);
}

bool EntityManager::isEntityVisible(std::uint32_t id) const {
    const std::uint32_t layerId = getEntityLayer(id);
    if (!layerStore.isLayerVisible(layerId)) return false;
    return (getEntityFlags(id) & static_cast<std::uint32_t>(EntityFlags::Visible)) != 0;
}

bool EntityManager::isEntityLocked(std::uint32_t id) const {
    const std::uint32_t layerId = getEntityLayer(id);
    if (layerStore.isLayerLocked(layerId)) return true;
    return (getEntityFlags(id) & static_cast<std::uint32_t>(EntityFlags::Locked)) != 0;
}

bool EntityManager::isEntityPickable(std::uint32_t id) const {
    return isEntityVisible(id) && !isEntityLocked(id);
}

std::uint8_t EntityManager::styleTargetMask(StyleTarget target) {
    return static_cast<std::uint8_t>(1u << static_cast<std::uint8_t>(target));
}

std::uint8_t EntityManager::styleCapabilities(EntityKind kind) {
    switch (kind) {
        case EntityKind::Rect:
        case EntityKind::Circle:
        case EntityKind::Polygon:
            return styleTargetMask(StyleTarget::Stroke) | styleTargetMask(StyleTarget::Fill);
        case EntityKind::Line:
        case EntityKind::Polyline:
        case EntityKind::Arrow:
            return styleTargetMask(StyleTarget::Stroke);
        case EntityKind::Text:
            return styleTargetMask(StyleTarget::TextColor) | styleTargetMask(StyleTarget::TextBackground);
        default:
            return 0;
    }
}

ResolvedStyle EntityManager::resolveStyle(std::uint32_t id, EntityKind kind) const {
    ResolvedStyle resolved{};
    const std::uint32_t layerId = getEntityLayer(id);
    const LayerStyle layerStyle = layerStore.getLayerStyle(layerId);
    resolved.stroke = layerStyle.stroke;
    resolved.fill = layerStyle.fill;
    resolved.textColor = layerStyle.textColor;
    resolved.textBackground = layerStyle.textBackground;

    const EntityStyleOverrides* overrides = getEntityStyleOverrides(id);
    if (!overrides) {
        return resolved;
    }

    const std::uint8_t strokeBit = styleTargetMask(StyleTarget::Stroke);
    const std::uint8_t fillBit = styleTargetMask(StyleTarget::Fill);
    const std::uint8_t textColorBit = styleTargetMask(StyleTarget::TextColor);
    const std::uint8_t textBgBit = styleTargetMask(StyleTarget::TextBackground);

    if ((overrides->colorMask & textColorBit) != 0) {
        resolved.textColor.color = overrides->textColor;
    }
    if ((overrides->colorMask & textBgBit) != 0) {
        resolved.textBackground.color = overrides->textBackground;
    }
    if ((overrides->enabledMask & fillBit) != 0) {
        resolved.fill.enabled = overrides->fillEnabled;
    }
    if ((overrides->enabledMask & textBgBit) != 0) {
        resolved.textBackground.enabled = overrides->textBackgroundEnabled;
    }

    if ((overrides->colorMask & strokeBit) != 0 || (overrides->enabledMask & strokeBit) != 0 ||
        (overrides->colorMask & fillBit) != 0 || (overrides->enabledMask & fillBit) != 0) {
        switch (kind) {
            case EntityKind::Rect: {
                const RectRec* rec = getRect(id);
                if (rec) {
                    if ((overrides->colorMask & fillBit) != 0) {
                        resolved.fill.color = StyleColor{rec->r, rec->g, rec->b, rec->a};
                    }
                    if ((overrides->colorMask & strokeBit) != 0) {
                        resolved.stroke.color = StyleColor{rec->sr, rec->sg, rec->sb, rec->sa};
                    }
                    if ((overrides->enabledMask & strokeBit) != 0) {
                        resolved.stroke.enabled = rec->strokeEnabled;
                    }
                }
                break;
            }
            case EntityKind::Circle: {
                const CircleRec* rec = getCircle(id);
                if (rec) {
                    if ((overrides->colorMask & fillBit) != 0) {
                        resolved.fill.color = StyleColor{rec->r, rec->g, rec->b, rec->a};
                    }
                    if ((overrides->colorMask & strokeBit) != 0) {
                        resolved.stroke.color = StyleColor{rec->sr, rec->sg, rec->sb, rec->sa};
                    }
                    if ((overrides->enabledMask & strokeBit) != 0) {
                        resolved.stroke.enabled = rec->strokeEnabled;
                    }
                }
                break;
            }
            case EntityKind::Polygon: {
                const PolygonRec* rec = getPolygon(id);
                if (rec) {
                    if ((overrides->colorMask & fillBit) != 0) {
                        resolved.fill.color = StyleColor{rec->r, rec->g, rec->b, rec->a};
                    }
                    if ((overrides->colorMask & strokeBit) != 0) {
                        resolved.stroke.color = StyleColor{rec->sr, rec->sg, rec->sb, rec->sa};
                    }
                    if ((overrides->enabledMask & strokeBit) != 0) {
                        resolved.stroke.enabled = rec->strokeEnabled;
                    }
                }
                break;
            }
            case EntityKind::Line: {
                const LineRec* rec = getLine(id);
                if (rec) {
                    if ((overrides->colorMask & strokeBit) != 0) {
                        resolved.stroke.color = StyleColor{rec->r, rec->g, rec->b, rec->a};
                    }
                    if ((overrides->enabledMask & strokeBit) != 0) {
                        resolved.stroke.enabled = rec->enabled;
                    }
                }
                break;
            }
            case EntityKind::Polyline: {
                const PolyRec* rec = getPolyline(id);
                if (rec) {
                    if ((overrides->colorMask & strokeBit) != 0) {
                        resolved.stroke.color = StyleColor{rec->r, rec->g, rec->b, rec->a};
                    }
                    if ((overrides->enabledMask & strokeBit) != 0) {
                        resolved.stroke.enabled = rec->enabled;
                    }
                }
                break;
            }
            case EntityKind::Arrow: {
                const ArrowRec* rec = getArrow(id);
                if (rec) {
                    if ((overrides->colorMask & strokeBit) != 0) {
                        resolved.stroke.color = StyleColor{rec->sr, rec->sg, rec->sb, rec->sa};
                    }
                    if ((overrides->enabledMask & strokeBit) != 0) {
                        resolved.stroke.enabled = rec->strokeEnabled;
                    }
                }
                break;
            }
            default:
                break;
        }
    }

    return resolved;
}

bool EntityManager::resolveFillEnabled(std::uint32_t id) const {
    // 1. Check for explicit overrides on the entity
    const EntityStyleOverrides* overrides = getEntityStyleOverrides(id);
    const std::uint8_t fillBit = styleTargetMask(StyleTarget::Fill);
    
    if (overrides && (overrides->enabledMask & fillBit) != 0) {
        return overrides->fillEnabled > 0.5f;
    }

    // 2. Fallback to layer defaults
    const std::uint32_t layerId = getEntityLayer(id);
    const LayerStyle layerStyle = layerStore.getLayerStyle(layerId);
    return layerStyle.fill.enabled > 0.5f;
}

void EntityManager::compactPolylinePoints() {
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

const RectRec* EntityManager::getRect(std::uint32_t id) const {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind == EntityKind::Rect) {
        return &rects[it->second.index];
    }
    return nullptr;
}

const LineRec* EntityManager::getLine(std::uint32_t id) const {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind == EntityKind::Line) {
        return &lines[it->second.index];
    }
    return nullptr;
}

const PolyRec* EntityManager::getPolyline(std::uint32_t id) const {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind == EntityKind::Polyline) {
        return &polylines[it->second.index];
    }
    return nullptr;
}

const CircleRec* EntityManager::getCircle(std::uint32_t id) const {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind == EntityKind::Circle) {
        return &circles[it->second.index];
    }
    return nullptr;
}

const PolygonRec* EntityManager::getPolygon(std::uint32_t id) const {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind == EntityKind::Polygon) {
        return &polygons[it->second.index];
    }
    return nullptr;
}

const ArrowRec* EntityManager::getArrow(std::uint32_t id) const {
    const auto it = entities.find(id);
    if (it != entities.end() && it->second.kind == EntityKind::Arrow) {
        return &arrows[it->second.index];
    }
    return nullptr;
}
