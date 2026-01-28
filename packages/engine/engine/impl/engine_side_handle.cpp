#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include <cmath>
#include <limits>

namespace {
constexpr float kPi = 3.14159265358979323846f;
constexpr float kDegToRad = kPi / 180.0f;

inline PickEntityKind toPickEntityKind(EntityKind kind) {
    switch (kind) {
        case EntityKind::Rect: return PickEntityKind::Rect;
        case EntityKind::Circle: return PickEntityKind::Circle;
        case EntityKind::Line: return PickEntityKind::Line;
        case EntityKind::Polyline: return PickEntityKind::Polyline;
        case EntityKind::Polygon: return PickEntityKind::Polygon;
        case EntityKind::Arrow: return PickEntityKind::Arrow;
        case EntityKind::Text: return PickEntityKind::Text;
        default: return PickEntityKind::Unknown;
    }
}
} // namespace

PickResult CadEngine::pickSideHandle(float x, float y, float tolerance) const noexcept {
    PickResult res{};
    res.id = 0;
    res.kind = static_cast<std::uint16_t>(PickEntityKind::Unknown);
    res.subTarget = static_cast<std::uint8_t>(PickSubTarget::None);
    res.subIndex = -1;
    res.distance = std::numeric_limits<float>::infinity();
    res.hitX = x;
    res.hitY = y;

    const auto& selection = state().selectionManager_.getOrdered();
    if (selection.size() != 1) return res;

    const std::uint32_t id = selection[0];
    const auto it = state().entityManager_.entities.find(id);
    if (it == state().entityManager_.entities.end()) return res;

    const EntityKind kind = it->second.kind;
    if (kind == EntityKind::Line || kind == EntityKind::Arrow || kind == EntityKind::Polyline ||
        kind == EntityKind::Text) {
        return res;
    }

    const engine::protocol::EntityTransform tr = getEntityTransform(id);
    if (!tr.valid) return res;

    const float halfW = tr.width * 0.5f;
    const float halfH = tr.height * 0.5f;
    if (!std::isfinite(halfW) || !std::isfinite(halfH) || halfW <= 0.0f || halfH <= 0.0f) {
        return res;
    }

    const float dx = x - tr.posX;
    const float dy = y - tr.posY;
    const float rad = -tr.rotationDeg * kDegToRad;
    const float cosR = std::cos(rad);
    const float sinR = std::sin(rad);
    const float localX = dx * cosR - dy * sinR;
    const float localY = dx * sinR + dy * cosR;

    const float hitDist = tolerance;
    const float cornerExclusion = tolerance * 1.5f;
    int subIndex = -1;
    float dist = std::numeric_limits<float>::infinity();

    if (std::fabs(localY + halfH) < hitDist) {
        if (localX > -halfW + cornerExclusion && localX < halfW - cornerExclusion) {
            subIndex = 4;
            dist = std::fabs(localY + halfH);
        }
    }

    if (subIndex < 0 && std::fabs(localY - halfH) < hitDist) {
        if (localX > -halfW + cornerExclusion && localX < halfW - cornerExclusion) {
            subIndex = 6;
            dist = std::fabs(localY - halfH);
        }
    }

    if (subIndex < 0 && std::fabs(localX - halfW) < hitDist) {
        if (localY > -halfH + cornerExclusion && localY < halfH - cornerExclusion) {
            subIndex = 5;
            dist = std::fabs(localX - halfW);
        }
    }

    if (subIndex < 0 && std::fabs(localX + halfW) < hitDist) {
        if (localY > -halfH + cornerExclusion && localY < halfH - cornerExclusion) {
            subIndex = 7;
            dist = std::fabs(localX + halfW);
        }
    }

    if (subIndex < 0) return res;

    res.id = id;
    res.kind = static_cast<std::uint16_t>(toPickEntityKind(kind));
    res.subTarget = static_cast<std::uint8_t>(PickSubTarget::ResizeHandle);
    res.subIndex = subIndex;
    res.distance = dist;
    return res;
}

