#pragma once

#include "engine/interaction/interaction_types.h"
#include "engine/core/types.h"
#include "engine/history/history_types.h"
#include "engine/interaction/snap_types.h"
#include "engine/protocol/protocol_types.h"
#include <vector>
#include <cstdint>
#include <array>
#include <cmath>

// Forward declarations
class CadEngine; // "God" object
class EntityManager; // Data access
class PickSystem; // Spatial index
class TextSystem; // Text rendering
class HistoryManager; // Undo/Redo

inline bool isGridSnapEnabled(const SnapOptions& options) {
    return options.enabled && options.gridEnabled && options.gridSize > 0.0001f;
}

inline void applyGridSnap(float& x, float& y, const SnapOptions& options) {
    if (!isGridSnapEnabled(options)) return;
    const float s = options.gridSize;
    x = std::round(x / s) * s;
    y = std::round(y / s) * s;
}

class InteractionSession {
public:
    InteractionSession(CadEngine& engine, EntityManager& entityManager, PickSystem& pickSystem, TextSystem& textSystem, HistoryManager& historyManager);

    // ==============================================================================
    // State Query
    // ==============================================================================
    TransformState getTransformState() const;
    bool isInteractionActive() const noexcept { return session_.active; }
    bool isDraftActive() const noexcept { return draft_.active; }

    SnapOptions snapOptions;

    const std::vector<SnapGuide>& getSnapGuides() const { return snapGuides_; }
    const std::vector<SnapHit>& getSnapHits() const { return snapHits_; }

    // ==============================================================================
    // Accessors for Commit Results (for WASM binding)
    // ==============================================================================
    const std::vector<std::uint32_t>& getCommitResultIds() const { return commitResultIds; }
    const std::vector<std::uint8_t>& getCommitResultOpCodes() const { return commitResultOpCodes; }
    const std::vector<float>& getCommitResultPayloads() const { return commitResultPayloads; }

    // ==============================================================================
    // Transform Logging / Replay
    // ==============================================================================
    void setTransformLogEnabled(bool enabled, std::uint32_t maxEntries, std::uint32_t maxIds);
    void clearTransformLog();
    bool replayTransformLog();
    bool isTransformLogOverflowed() const { return transformLogOverflowed_; }
    const std::vector<engine::protocol::TransformLogEntry>& getTransformLogEntries() const { return transformLogEntries_; }
    const std::vector<std::uint32_t>& getTransformLogIds() const { return transformLogIds_; }

    float getLastTransformUpdateMs() const { return transformStats_.lastUpdateMs; }
    std::uint32_t getLastSnapCandidateCount() const { return transformStats_.lastSnapCandidateCount; }
    std::uint32_t getLastSnapHitCount() const { return transformStats_.lastSnapHitCount; }

    // ==============================================================================
    // Transform API
    // ==============================================================================
    void beginTransform(
        const std::uint32_t* ids, 
        std::uint32_t idCount, 
        TransformMode mode, 
        std::uint32_t specificId, 
        int32_t vertexIndex, 
        float screenX, 
        float screenY,
        float viewX,
        float viewY,
        float viewScale,
        float viewWidth,
        float viewHeight,
        std::uint32_t modifiers
    );
    void updateTransform(
        float screenX,
        float screenY,
        float viewX,
        float viewY,
        float viewScale,
        float viewWidth,
        float viewHeight,
        std::uint32_t modifiers);
    void commitTransform();
    void cancelTransform();

    // ==============================================================================
    // Draft API (Phantom Entity System)
    // ==============================================================================
    void beginDraft(const BeginDraftPayload& p);
    void updateDraft(float x, float y, std::uint32_t modifiers);
    void appendDraftPoint(float x, float y, std::uint32_t modifiers);
    void cancelDraft();
    std::uint32_t commitDraft();
    
    // Draft overlay data for frontend (computed from phantom entity)
    DraftDimensions getDraftDimensions() const;
    void appendDraftLineVertices(std::vector<float>& lineVertices) const;

private:
    CadEngine& engine_;
    EntityManager& entityManager_;
    PickSystem& pickSystem_;
    TextSystem& textSystem_;
    HistoryManager& historyManager_;

    // Internal State Structs
    enum class AxisLock : std::uint8_t {
        None = 0,
        X = 1,
        Y = 2
    };

    struct SessionState {
        bool active = false;
        TransformMode mode = TransformMode::Move;
        std::vector<std::uint32_t> initialIds;
        std::uint32_t specificId = 0;
        int32_t vertexIndex = -1;
        float startScreenX = 0.0f;
        float startScreenY = 0.0f;
        float startX = 0.0f;
        float startY = 0.0f;
        float dragThresholdPx = 0.0f;
        bool dragging = false;
        bool historyActive = false;
        float baseMinX = 0.0f;
        float baseMinY = 0.0f;
        float baseMaxX = 0.0f;
        float baseMaxY = 0.0f;
        std::vector<TransformSnapshot> snapshots;
        std::uint32_t nextEntityIdBefore = 0;
        AxisLock axisLock = AxisLock::None;
        bool resizeAnchorValid = false;
        float resizeAnchorX = 0.0f;
        float resizeAnchorY = 0.0f;
        float resizeAspect = 1.0f;
        float resizeBaseW = 0.0f;
        float resizeBaseH = 0.0f;
        bool duplicated = false;
        std::vector<std::uint32_t> originalIds;
        // Rotation state
        float rotationPivotX = 0.0f;
        float rotationPivotY = 0.0f;
        float startAngleDeg = 0.0f;
        float lastAngleDeg = 0.0f;       // Last frame's angle for continuous rotation
        float accumulatedDeltaDeg = 0.0f;
        // Side resize state (N=2, E=1, S=0, W=3)
        int32_t sideIndex = -1;
        bool sideResizeSymmetric = false;  // Alt modifier for symmetric resize
    };

    struct DraftState {
        bool active = false;
        std::uint32_t kind = 0;
        float startX = 0, startY = 0;
        float currentX = 0, currentY = 0;
        float fillR = 0, fillG = 0, fillB = 0, fillA = 0;
        float strokeR = 0, strokeG = 0, strokeB = 0, strokeA = 0;
        float strokeEnabled = 0;
        float strokeWidthPx = 1.0f;
        float sides = 0;
        float head = 0;
        std::uint32_t flags = 0;
        std::vector<Point2> points;
    };

    struct DraftSegment {
        float x0;
        float y0;
        float x1;
        float y1;
    };

    struct TransformStats {
        float lastUpdateMs = 0.0f;
        std::uint32_t lastSnapCandidateCount = 0;
        std::uint32_t lastSnapHitCount = 0;
    };

    SessionState session_;
    DraftState draft_;
    TransformStats transformStats_;
    std::vector<SnapGuide> snapGuides_;
    std::vector<SnapHit> snapHits_;
    std::vector<std::uint32_t> snapCandidates_;
    mutable std::vector<DraftSegment> draftSegments_;

    // Commit Result Buffers
    std::vector<std::uint32_t> commitResultIds;
    std::vector<std::uint8_t> commitResultOpCodes;
    std::vector<float> commitResultPayloads; 

    std::vector<engine::protocol::TransformLogEntry> transformLogEntries_;
    std::vector<std::uint32_t> transformLogIds_;
    std::size_t transformLogCapacity_ = 0;
    std::size_t transformLogIdCapacity_ = 0;
    bool transformLogEnabled_ = false;
    bool transformLogActive_ = false;
    bool transformLogOverflowed_ = false;
    bool replaying_ = false;

    // Helper to build a snapshot from current entity state
    EntitySnapshot buildSnapshotFromTransform(const TransformSnapshot& snap) const;

    bool duplicateSelectionForDrag();

    // Helper to refresh render range in engine
    void refreshEntityRenderRange(std::uint32_t id);
    
    // ==============================================================================
    // Phantom Entity Helpers (Draft System)
    // ==============================================================================
    void upsertPhantomEntity();   // Create or update phantom entity from draft state
    void removePhantomEntity();   // Remove phantom entity from EntityManager

    void recordTransformBegin(
        float screenX,
        float screenY,
        float viewX,
        float viewY,
        float viewScale,
        float viewWidth,
        float viewHeight,
        const SnapOptions& options,
        std::uint32_t modifiers);
    void recordTransformUpdate(
        float screenX,
        float screenY,
        float viewX,
        float viewY,
        float viewScale,
        float viewWidth,
        float viewHeight,
        const SnapOptions& options,
        std::uint32_t modifiers);
    void recordTransformCommit();
    void recordTransformCancel();
};
