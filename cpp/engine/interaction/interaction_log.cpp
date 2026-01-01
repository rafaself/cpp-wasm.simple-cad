#include "engine/interaction/interaction_session.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"

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

    const bool prevReplaying = replaying_;
    replaying_ = true;
    transformLogActive_ = false;

    for (const auto& entry : transformLogEntries_) {
        const auto type = static_cast<engine::protocol::TransformLogEvent>(entry.type);
        switch (type) {
            case engine::protocol::TransformLogEvent::Begin: {
                const std::size_t start = entry.idOffset;
                const std::size_t end = start + entry.idCount;
                const std::uint32_t* ids = nullptr;
                if (entry.idCount > 0) {
                    if (end > transformLogIds_.size()) {
                        replaying_ = prevReplaying;
                        return false;
                    }
                    ids = transformLogIds_.data() + start;
                    engine_.setSelection(ids, entry.idCount, engine::protocol::SelectionMode::Replace);
                }
                const auto& state = engine_.state();
                beginTransform(
                    ids,
                    entry.idCount,
                    static_cast<TransformMode>(entry.mode),
                    entry.specificId,
                    entry.vertexIndex,
                    entry.x,
                    entry.y,
                    state.viewX,
                    state.viewY,
                    state.viewScale,
                    state.viewWidth,
                    state.viewHeight,
                    entry.modifiers);
                break;
            }
            case engine::protocol::TransformLogEvent::Update:
                {
                    const auto& state = engine_.state();
                    updateTransform(
                        entry.x,
                        entry.y,
                        state.viewX,
                        state.viewY,
                        state.viewScale,
                        state.viewWidth,
                        state.viewHeight,
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
    }

    replaying_ = prevReplaying;
    return true;
}

void InteractionSession::recordTransformBegin(float screenX, float screenY, std::uint32_t modifiers) {
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
    transformLogEntries_.push_back(entry);
    transformLogActive_ = true;
}

void InteractionSession::recordTransformUpdate(float screenX, float screenY, std::uint32_t modifiers) {
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
