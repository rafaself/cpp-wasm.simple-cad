#pragma once

#include "engine/protocol/protocol_types.h"
#include "engine/interaction/interaction_constants.h"
#include <cstdint>
#include <cmath>

namespace interaction_session_detail {
constexpr std::uint32_t kShiftMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift);
constexpr std::uint32_t kCtrlMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Ctrl);
constexpr std::uint32_t kAltMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Alt);
constexpr std::uint32_t kMetaMask = static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Meta);

// Use centralized constants
constexpr float kAxisLockMinDeltaPx = interaction_constants::AXIS_LOCK_MIN_DELTA_PX;
constexpr float kAxisLockEnterRatio = interaction_constants::AXIS_LOCK_ENTER_RATIO;
constexpr float kAxisLockSwitchRatio = interaction_constants::AXIS_LOCK_SWITCH_RATIO;

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
