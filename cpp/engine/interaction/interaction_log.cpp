#include "engine/interaction/interaction_session.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include <cmath>
#include <cstdio>

namespace {
bool nearlyEqual(float a, float b) {
    return std::fabs(a - b) <= 1e-6f;
}

void fillTransformLogContext(
    engine::protocol::TransformLogEntry& entry,
    float viewX,
    float viewY,
    float viewScale,
    float viewWidth,
    float viewHeight,
    const SnapOptions& options) {
    entry.viewX = viewX;
    entry.viewY = viewY;
    entry.viewScale = viewScale;
    entry.viewWidth = viewWidth;
    entry.viewHeight = viewHeight;
    entry.snapEnabled = options.enabled ? 1u : 0u;
    entry.snapGridEnabled = options.gridEnabled ? 1u : 0u;
    entry.snapGridSize = options.gridSize;
    entry.snapTolerancePx = options.tolerancePx;
    entry.snapEndpointEnabled = options.endpointEnabled ? 1u : 0u;
    entry.snapMidpointEnabled = options.midpointEnabled ? 1u : 0u;
    entry.snapCenterEnabled = options.centerEnabled ? 1u : 0u;
    entry.snapNearestEnabled = options.nearestEnabled ? 1u : 0u;
}

void applyReplayContext(
    EngineState& state,
    SnapOptions& options,
    const engine::protocol::TransformLogEntry& entry) {
    state.viewX = entry.viewX;
    state.viewY = entry.viewY;
    state.viewScale = entry.viewScale;
    state.viewWidth = entry.viewWidth;
    state.viewHeight = entry.viewHeight;
    options.enabled = entry.snapEnabled != 0;
    options.gridEnabled = entry.snapGridEnabled != 0;
    options.gridSize = entry.snapGridSize;
    options.tolerancePx = entry.snapTolerancePx;
    options.endpointEnabled = entry.snapEndpointEnabled != 0;
    options.midpointEnabled = entry.snapMidpointEnabled != 0;
    options.centerEnabled = entry.snapCenterEnabled != 0;
    options.nearestEnabled = entry.snapNearestEnabled != 0;
}

bool matchesReplayContext(
    const EngineState& state,
    const SnapOptions& options,
    const engine::protocol::TransformLogEntry& entry) {
    if (!nearlyEqual(state.viewX, entry.viewX)) return false;
    if (!nearlyEqual(state.viewY, entry.viewY)) return false;
    if (!nearlyEqual(state.viewScale, entry.viewScale)) return false;
    if (!nearlyEqual(state.viewWidth, entry.viewWidth)) return false;
    if (!nearlyEqual(state.viewHeight, entry.viewHeight)) return false;
    if (options.enabled != (entry.snapEnabled != 0)) return false;
    if (options.gridEnabled != (entry.snapGridEnabled != 0)) return false;
    if (!nearlyEqual(options.gridSize, entry.snapGridSize)) return false;
    if (!nearlyEqual(options.tolerancePx, entry.snapTolerancePx)) return false;
    if (options.endpointEnabled != (entry.snapEndpointEnabled != 0)) return false;
    if (options.midpointEnabled != (entry.snapMidpointEnabled != 0)) return false;
    if (options.centerEnabled != (entry.snapCenterEnabled != 0)) return false;
    if (options.nearestEnabled != (entry.snapNearestEnabled != 0)) return false;
    return true;
}
} // namespace

void InteractionSession::setTransformLogEnabled(bool enabled, std::uint32_t maxEntries, std::uint32_t maxIds) {
    transformLogEnabled_ = enabled;
    transformLogActive_ = false;
    transformLogOverflowed_ = false;
    transformLogCapacity_ = maxEntries;
    transformLogIdCapacity_ = maxIds;
    transformLogEntries_.clear();
    transformLogIds_.clear();
    if (!enabled) return;
    if (transformLogCapacity_ > 0) {
        transformLogEntries_.reserve(transformLogCapacity_);
    }
    if (transformLogIdCapacity_ > 0) {
        transformLogIds_.reserve(transformLogIdCapacity_);
    }
}

void InteractionSession::clearTransformLog() {
    transformLogEntries_.clear();
    transformLogIds_.clear();
    transformLogActive_ = false;
    transformLogOverflowed_ = false;
}

bool InteractionSession::replayTransformLog() {
    if (session_.active || transformLogEntries_.empty() || transformLogOverflowed_) {
        return false;
    }
    if (transformLogEntries_.front().type != static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Begin)) {
        return false;
    }

    EngineState& state = engine_.state();
    const float prevViewX = state.viewX;
    const float prevViewY = state.viewY;
    const float prevViewScale = state.viewScale;
    const float prevViewWidth = state.viewWidth;
    const float prevViewHeight = state.viewHeight;
    const SnapOptions prevSnapOptions = snapOptions;

    const bool prevReplaying = replaying_;
    replaying_ = true;
    transformLogActive_ = false;
    bool ok = true;

    if (!matchesReplayContext(state, snapOptions, transformLogEntries_.front())) {
        std::fprintf(stderr, "[WARN] Transform replay context mismatch; overriding view/snap options for replay.\n");
    }

    for (const auto& entry : transformLogEntries_) {
        const auto type = static_cast<engine::protocol::TransformLogEvent>(entry.type);
        switch (type) {
            case engine::protocol::TransformLogEvent::Begin: {
                const std::size_t start = entry.idOffset;
                const std::size_t end = start + entry.idCount;
                const std::uint32_t* ids = nullptr;
                if (entry.idCount > 0) {
                    if (end > transformLogIds_.size()) {
                        ok = false;
                        break;
                    }
                    ids = transformLogIds_.data() + start;
                    engine_.setSelection(ids, entry.idCount, engine::protocol::SelectionMode::Replace);
                }
                applyReplayContext(state, snapOptions, entry);
                beginTransform(
                    ids,
                    entry.idCount,
                    static_cast<TransformMode>(entry.mode),
                    entry.specificId,
                    entry.vertexIndex,
                    entry.x,
                    entry.y,
                    entry.viewX,
                    entry.viewY,
                    entry.viewScale,
                    entry.viewWidth,
                    entry.viewHeight,
                    entry.modifiers);
                break;
            }
            case engine::protocol::TransformLogEvent::Update:
                {
                    applyReplayContext(state, snapOptions, entry);
                    updateTransform(
                        entry.x,
                        entry.y,
                        entry.viewX,
                        entry.viewY,
                        entry.viewScale,
                        entry.viewWidth,
                        entry.viewHeight,
                        entry.modifiers);
                }
                break;
            case engine::protocol::TransformLogEvent::Commit:
                commitTransform();
                break;
            case engine::protocol::TransformLogEvent::Cancel:
                cancelTransform();
                break;
            default:
                break;
        }
        if (!ok) break;
    }

    state.viewX = prevViewX;
    state.viewY = prevViewY;
    state.viewScale = prevViewScale;
    state.viewWidth = prevViewWidth;
    state.viewHeight = prevViewHeight;
    snapOptions = prevSnapOptions;
    replaying_ = prevReplaying;
    return ok;
}

void InteractionSession::recordTransformBegin(
    float screenX,
    float screenY,
    float viewX,
    float viewY,
    float viewScale,
    float viewWidth,
    float viewHeight,
    const SnapOptions& options,
    std::uint32_t modifiers) {
    if (!transformLogEnabled_ || replaying_) return;

    transformLogEntries_.clear();
    transformLogIds_.clear();
    transformLogOverflowed_ = false;
    transformLogActive_ = false;

    if (transformLogCapacity_ == 0) {
        transformLogOverflowed_ = true;
        return;
    }

    const std::size_t idCount = session_.initialIds.size();
    if (idCount > 0) {
        if (transformLogIdCapacity_ == 0 || idCount > transformLogIdCapacity_) {
            transformLogOverflowed_ = true;
            return;
        }
    }

    if (transformLogEntries_.capacity() < transformLogCapacity_) {
        transformLogEntries_.reserve(transformLogCapacity_);
    }
    if (transformLogIds_.capacity() < transformLogIdCapacity_) {
        transformLogIds_.reserve(transformLogIdCapacity_);
    }

    const std::uint32_t idOffset = static_cast<std::uint32_t>(transformLogIds_.size());
    if (!session_.initialIds.empty()) {
        transformLogIds_.insert(transformLogIds_.end(), session_.initialIds.begin(), session_.initialIds.end());
    }

    engine::protocol::TransformLogEntry entry{};
    entry.type = static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Begin);
    entry.mode = static_cast<std::uint32_t>(session_.mode);
    entry.idOffset = idOffset;
    entry.idCount = static_cast<std::uint32_t>(idCount);
    entry.specificId = session_.specificId;
    entry.vertexIndex = session_.vertexIndex;
    entry.x = screenX;
    entry.y = screenY;
    entry.modifiers = modifiers;
    fillTransformLogContext(entry, viewX, viewY, viewScale, viewWidth, viewHeight, options);
    transformLogEntries_.push_back(entry);
    transformLogActive_ = true;
}

void InteractionSession::recordTransformUpdate(
    float screenX,
    float screenY,
    float viewX,
    float viewY,
    float viewScale,
    float viewWidth,
    float viewHeight,
    const SnapOptions& options,
    std::uint32_t modifiers) {
    if (!transformLogEnabled_ || !transformLogActive_ || replaying_) return;

    if (transformLogCapacity_ == 0 || transformLogEntries_.size() >= transformLogCapacity_) {
        transformLogOverflowed_ = true;
        transformLogActive_ = false;
        return;
    }

    engine::protocol::TransformLogEntry entry{};
    entry.type = static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Update);
    entry.mode = static_cast<std::uint32_t>(session_.mode);
    entry.specificId = session_.specificId;
    entry.vertexIndex = session_.vertexIndex;
    entry.x = screenX;
    entry.y = screenY;
    entry.modifiers = modifiers;
    fillTransformLogContext(entry, viewX, viewY, viewScale, viewWidth, viewHeight, options);
    transformLogEntries_.push_back(entry);
}

void InteractionSession::recordTransformCommit() {
    if (!transformLogEnabled_ || !transformLogActive_ || replaying_) return;

    if (transformLogCapacity_ == 0 || transformLogEntries_.size() >= transformLogCapacity_) {
        transformLogOverflowed_ = true;
        transformLogActive_ = false;
        return;
    }

    engine::protocol::TransformLogEntry entry{};
    entry.type = static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Commit);
    entry.mode = static_cast<std::uint32_t>(session_.mode);
    entry.specificId = session_.specificId;
    entry.vertexIndex = session_.vertexIndex;
    transformLogEntries_.push_back(entry);
    transformLogActive_ = false;
}

void InteractionSession::recordTransformCancel() {
    if (!transformLogEnabled_ || !transformLogActive_ || replaying_) return;

    if (transformLogCapacity_ == 0 || transformLogEntries_.size() >= transformLogCapacity_) {
        transformLogOverflowed_ = true;
        transformLogActive_ = false;
        return;
    }

    engine::protocol::TransformLogEntry entry{};
    entry.type = static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Cancel);
    entry.mode = static_cast<std::uint32_t>(session_.mode);
    entry.specificId = session_.specificId;
    entry.vertexIndex = session_.vertexIndex;
    transformLogEntries_.push_back(entry);
    transformLogActive_ = false;
}
