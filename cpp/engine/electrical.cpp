#include "engine/electrical.h"
#include "engine/util.h"

#include <cmath>

namespace engine {

static const SymbolRec* findSymbolById(const std::unordered_map<std::uint32_t, EntityRef>& entities, const std::vector<SymbolRec>& symbols, std::uint32_t id) noexcept {
    const auto it = entities.find(id);
    if (it == entities.end()) return nullptr;
    if (it->second.kind != EntityKind::Symbol) return nullptr;
    const std::uint32_t idx = it->second.index;
    if (idx >= symbols.size()) return nullptr;
    return &symbols[idx];
}

static const NodeRec* findNodeById(const std::unordered_map<std::uint32_t, EntityRef>& entities, const std::vector<NodeRec>& nodes, std::uint32_t id) noexcept {
    const auto it = entities.find(id);
    if (it == entities.end()) return nullptr;
    if (it->second.kind != EntityKind::Node) return nullptr;
    const std::uint32_t idx = it->second.index;
    if (idx >= nodes.size()) return nullptr;
    return &nodes[idx];
}

bool resolveNodePosition(
    const std::unordered_map<std::uint32_t, EntityRef>& entities,
    const std::vector<SymbolRec>& symbols,
    const std::vector<NodeRec>& nodes,
    std::uint32_t nodeId,
    Point2& out
) noexcept {
    const NodeRec* n = findNodeById(entities, nodes, nodeId);
    if (!n) return false;
    if (n->kind == NodeKind::Free) {
        out.x = n->x;
        out.y = n->y;
        return true;
    }

    if (n->anchorSymbolId == 0) {
        out.x = n->x;
        out.y = n->y;
        return true;
    }

    const SymbolRec* s = findSymbolById(entities, symbols, n->anchorSymbolId);
    if (!s) {
        out.x = n->x;
        out.y = n->y;
        return true;
    }

    const float cx = s->x + s->w * 0.5f;
    const float cy = s->y + s->h * 0.5f;
    float px = (s->connX - 0.5f) * s->w;
    float py = (s->connY - 0.5f) * s->h;

    px *= s->scaleX;
    py *= s->scaleY;

    const float c = std::cos(s->rotation);
    const float si = std::sin(s->rotation);
    const float rx = px * c - py * si;
    const float ry = px * si + py * c;
    out.x = cx + rx;
    out.y = cy + ry;
    return true;
}

SnapResult snapElectrical(
    const std::unordered_map<std::uint32_t, EntityRef>& entities,
    const std::vector<SymbolRec>& symbols,
    const std::vector<NodeRec>& nodes,
    float x,
    float y,
    float tolerance
) noexcept {
    const float tol2 = tolerance * tolerance;
    float bestD2 = tol2 + 1.0f;
    SnapResult best{0u, 0u, 0.0f, 0.0f};

    Point2 q{x, y};

    // Prefer symbols (tie-breaker favors symbols over nodes)
    for (const auto& s : symbols) {
        const float cx = s.x + s.w * 0.5f;
        const float cy = s.y + s.h * 0.5f;
        float px = (s.connX - 0.5f) * s.w;
        float py = (s.connY - 0.5f) * s.h;
        px *= s.scaleX;
        py *= s.scaleY;
        const float c = std::cos(s.rotation);
        const float si = std::sin(s.rotation);
        const float rx = px * c - py * si;
        const float ry = px * si + py * c;
        const float pxw = cx + rx;
        const float pyw = cy + ry;
        const float dx = pxw - q.x;
        const float dy = pyw - q.y;
        const float d2 = dx * dx + dy * dy;
        if (d2 <= tol2 && d2 < bestD2) {
            bestD2 = d2;
            best = SnapResult{2u, s.id, pxw, pyw};
        }
    }

    // Then consider nodes
    for (const auto& n : nodes) {
        Point2 p;
        if (!resolveNodePosition(entities, symbols, nodes, n.id, p)) continue;
        const float dx = p.x - q.x;
        const float dy = p.y - q.y;
        const float d2 = dx * dx + dy * dy;
        if (d2 <= tol2 && d2 < bestD2) {
            bestD2 = d2;
            best = SnapResult{1u, n.id, p.x, p.y};
        }
    }

    return best;
}

} // namespace engine
