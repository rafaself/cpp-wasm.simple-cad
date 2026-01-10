#pragma once

#include "engine/protocol/protocol_types.h"
#include <cstdint>
#include <cmath>

namespace interaction_session_detail {
constexpr std::uint32_t kShiftMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
constexpr std::uint32_t kCtrlMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Ctrl);
constexpr std::uint32_t kAltMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Alt);
constexpr std::uint32_t kMetaMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Meta);
constexpr float kAxisLockMinDeltaPx = 4.0f;
constexpr float kAxisLockEnterRatio = 1.1f;
constexpr float kAxisLockSwitchRatio = 1.2f;

inline bool isSnapSuppressed(std::uint32_t modifiers) {
    return (modifiers & (kCtrlMask | kMetaMask)) != 0;
}

inline float normalizeViewScale(float viewScale) {
    return (viewScale > 1e-6f && std::isfinite(viewScale)) ? viewScale : 1.0f;
}

inline void screenToWorld(
    float screenX,
    float screenY,
    float viewX,
    float viewY,
    float viewScale,
    float& outX,
    float& outY) {
    const float scale = normalizeViewScale(viewScale);
    outX = (screenX - viewX) / scale;
    outY = -(screenY - viewY) / scale;
}
} // namespace interaction_session_detail
