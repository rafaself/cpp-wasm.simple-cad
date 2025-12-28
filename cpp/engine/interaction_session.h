#pragma once

#include "engine/interaction_types.h"
#include "engine/types.h"
#include "engine/history_types.h"
#include <vector>
#include <cstdint>

// Forward declarations
class CadEngine; // "God" object
class EntityManager; // Data access
class PickSystem; // Spatial index
class TextSystem; // Text rendering
class HistoryManager; // Undo/Redo

class InteractionSession {
public:
    InteractionSession(CadEngine& engine, EntityManager& entityManager, PickSystem& pickSystem, TextSystem& textSystem, HistoryManager& historyManager);

    // ==============================================================================
    // State Query
    // ==============================================================================
    bool isInteractionActive() const noexcept { return session_.active; }
    bool isDraftActive() const noexcept { return draft_.active; }

    SnapOptions snapOptions;

    // ==============================================================================
    // Accessors for Commit Results (for WASM binding)
    // ==============================================================================
    const std::vector<std::uint32_t>& getCommitResultIds() const { return commitResultIds; }
    const std::vector<std::uint8_t>& getCommitResultOpCodes() const { return commitResultOpCodes; }
    const std::vector<float>& getCommitResultPayloads() const { return commitResultPayloads; }

    // ==============================================================================
    // Transform API
    // ==============================================================================
    void beginTransform(
        const std::uint32_t* ids, 
        std::uint32_t idCount, 
        TransformMode mode, 
        std::uint32_t specificId, 
        int32_t vertexIndex, 
        float startX, 
        float startY
    );
    void updateTransform(float worldX, float worldY);
    void commitTransform();
    void cancelTransform();

    // ==============================================================================
    // Draft API
    // ==============================================================================
    void beginDraft(const BeginDraftPayload& p);
    void updateDraft(float x, float y);
    void appendDraftPoint(float x, float y);
    void cancelDraft();
    std::uint32_t commitDraft();
    void addDraftToBuffers(std::vector<float>& lineVertices); // Helper to draw draft

private:
    CadEngine& engine_;
    EntityManager& entityManager_;
    PickSystem& pickSystem_;
    TextSystem& textSystem_;
    HistoryManager& historyManager_;

    // Internal State Structs
    struct SessionState {
        bool active = false;
        TransformMode mode = TransformMode::Move;
        std::vector<std::uint32_t> initialIds;
        std::uint32_t specificId = 0;
        int32_t vertexIndex = -1;
        float startX = 0.0f;
        float startY = 0.0f;
        std::vector<TransformSnapshot> snapshots;
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
        std::vector<Point2> points;
    };

    SessionState session_;
    DraftState draft_;

    // Commit Result Buffers
    std::vector<std::uint32_t> commitResultIds;
    std::vector<std::uint8_t> commitResultOpCodes;
    std::vector<float> commitResultPayloads; 

    // Helper to build a snapshot from current entity state
    EntitySnapshot buildSnapshotFromTransform(const TransformSnapshot& snap) const;

    // Helper to refresh render range in engine
    void refreshEntityRenderRange(std::uint32_t id);
};
