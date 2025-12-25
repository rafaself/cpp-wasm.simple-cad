#include "engine/entity_manager.h"
#include <cmath>

EntityManager::EntityManager() {}

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
        return;
    }

    rects.push_back(RectRec{id, x, y, w, h, r, g, b, a, sr, sg, sb, sa, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Rect, static_cast<std::uint32_t>(rects.size() - 1)};
    drawOrderIds.push_back(id);
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
        return;
    }

    lines.push_back(LineRec{id, x0, y0, x1, y1, r, g, b, a, enabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Line, static_cast<std::uint32_t>(lines.size() - 1)};
    drawOrderIds.push_back(id);
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
        return;
    }

    polylines.push_back(PolyRec{id, offset, count, r, g, b, a, r, g, b, a, enabled, enabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Polyline, static_cast<std::uint32_t>(polylines.size() - 1)};
    drawOrderIds.push_back(id);
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
        return;
    }

    circles.push_back(CircleRec{id, cx, cy, rx, ry, rot, sx, sy, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Circle, static_cast<std::uint32_t>(circles.size() - 1)};
    drawOrderIds.push_back(id);
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
        return;
    }

    polygons.push_back(PolygonRec{id, cx, cy, rx, ry, rot, sx, sy, sides, fillR, fillG, fillB, fillA, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Polygon, static_cast<std::uint32_t>(polygons.size() - 1)};
    drawOrderIds.push_back(id);
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
        return;
    }

    arrows.push_back(ArrowRec{id, ax, ay, bx, by, head, strokeR, strokeG, strokeB, strokeA, strokeEnabled, strokeWidthPx});
    entities[id] = EntityRef{EntityKind::Arrow, static_cast<std::uint32_t>(arrows.size() - 1)};
    drawOrderIds.push_back(id);
}

void EntityManager::registerTextEntity(std::uint32_t id) {
    const auto it = entities.find(id);
    if (it != entities.end()) {
        if (it->second.kind != EntityKind::Text) {
            deleteEntity(id);
        }
    }
    // For text, index matches ID as per original engine.cpp convention
    entities[id] = EntityRef{EntityKind::Text, id};
    // No push_back to drawOrderIds as per original engine.cpp behavior for upsertText.
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
