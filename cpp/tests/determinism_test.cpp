/**
 * Determinism Tests
 * 
 * These tests verify that the engine produces deterministic output:
 * 1. Same sequence of commands → Same snapshot
 * 2. Undo/Redo produces identical states
 * 3. Snapshot round-trip preserves exact state
 * 
 * This is critical for the Engine-First architecture where the C++ engine
 * is the single source of truth.
 */

#include <gtest/gtest.h>
#include "engine/engine.h"
#include "engine/persistence/snapshot.h"
#include "engine/command/commands.h"
#include <vector>
#include <cstring>

using namespace engine;

class DeterminismTest : public ::testing::Test {
protected:
    CadEngine engine1;
    CadEngine engine2;

    // Helper to build command buffer
    std::vector<uint8_t> buildCommandBuffer(const std::vector<std::tuple<uint32_t, uint32_t, std::vector<uint8_t>>>& commands) {
        std::vector<uint8_t> buf;
        auto pushU32 = [&](uint32_t v) {
            uint8_t b[4];
            memcpy(b, &v, 4);
            buf.insert(buf.end(), b, b + 4);
        };

        // Header
        pushU32(0x43445745); // magic "EWDC"
        pushU32(2);          // version
        pushU32(static_cast<uint32_t>(commands.size())); // count
        pushU32(0);          // padding

        // Commands
        for (const auto& [op, id, payload] : commands) {
            pushU32(op);
            pushU32(id);
            pushU32(static_cast<uint32_t>(payload.size()));
            pushU32(0); // reserved
            buf.insert(buf.end(), payload.begin(), payload.end());
            // Align to 4 bytes
            while (buf.size() % 4 != 0) buf.push_back(0);
        }

        return buf;
    }

    // Helper to create rect payload
    std::vector<uint8_t> makeRectPayload(float x, float y, float w, float h) {
        std::vector<uint8_t> payload(60, 0); // RectPayload size
        float* f = reinterpret_cast<float*>(payload.data());
        f[0] = x;    // x
        f[1] = y;    // y
        f[2] = w;    // w
        f[3] = h;    // h
        f[4] = 1.0f; // fillR
        f[5] = 0.0f; // fillG
        f[6] = 0.0f; // fillB
        f[7] = 1.0f; // fillA
        f[8] = 0.0f; // strokeR
        f[9] = 0.0f; // strokeG
        f[10] = 0.0f; // strokeB
        f[11] = 1.0f; // strokeA
        payload[48] = 1; // strokeEnabled
        float* sw = reinterpret_cast<float*>(&payload[52]);
        *sw = 1.0f; // strokeWidthPx
        return payload;
    }

    // Helper to create line payload
    std::vector<uint8_t> makeLinePayload(float x0, float y0, float x1, float y1) {
        std::vector<uint8_t> payload(36, 0); // LinePayload size
        float* f = reinterpret_cast<float*>(payload.data());
        f[0] = x0;
        f[1] = y0;
        f[2] = x1;
        f[3] = y1;
        f[4] = 1.0f; // r
        f[5] = 1.0f; // g
        f[6] = 1.0f; // b
        f[7] = 1.0f; // a
        payload[32] = 1; // enabled
        return payload;
    }

    // Compare two snapshots byte-by-byte
    bool compareSnapshots(const std::vector<uint8_t>& a, const std::vector<uint8_t>& b) {
        if (a.size() != b.size()) return false;
        return memcmp(a.data(), b.data(), a.size()) == 0;
    }
};

TEST_F(DeterminismTest, SameCommandsProduceSameSnapshot) {
    // Build a sequence of commands
    std::vector<std::tuple<uint32_t, uint32_t, std::vector<uint8_t>>> commands = {
        {2, 1, makeRectPayload(10.0f, 20.0f, 30.0f, 40.0f)}, // UpsertRect
        {3, 2, makeLinePayload(0.0f, 0.0f, 100.0f, 100.0f)}, // UpsertLine
        {2, 3, makeRectPayload(50.0f, 50.0f, 20.0f, 20.0f)}, // UpsertRect
    };

    auto cmdBuffer = buildCommandBuffer(commands);

    // Apply to engine1
    engine1.applyCommandBuffer(cmdBuffer.data(), static_cast<uint32_t>(cmdBuffer.size()));
    auto snapshot1 = engine1.buildSnapshotBytes();

    // Apply to engine2
    engine2.applyCommandBuffer(cmdBuffer.data(), static_cast<uint32_t>(cmdBuffer.size()));
    auto snapshot2 = engine2.buildSnapshotBytes();

    // Snapshots should be identical
    ASSERT_TRUE(compareSnapshots(snapshot1, snapshot2))
        << "Same commands should produce identical snapshots";
}

TEST_F(DeterminismTest, SnapshotRoundTripIsExact) {
    // Create some entities
    std::vector<std::tuple<uint32_t, uint32_t, std::vector<uint8_t>>> commands = {
        {2, 1, makeRectPayload(10.0f, 20.0f, 30.0f, 40.0f)},
        {3, 2, makeLinePayload(0.0f, 0.0f, 50.0f, 50.0f)},
    };

    auto cmdBuffer = buildCommandBuffer(commands);
    engine1.applyCommandBuffer(cmdBuffer.data(), static_cast<uint32_t>(cmdBuffer.size()));

    // Get snapshot
    auto snapshot1 = engine1.buildSnapshotBytes();
    ASSERT_GT(snapshot1.size(), 0u);

    // Load into engine2
    engine2.loadSnapshotFromPtr(snapshot1.data(), static_cast<uint32_t>(snapshot1.size()));

    // Get snapshot again
    auto snapshot2 = engine2.buildSnapshotBytes();

    // Should be identical
    ASSERT_TRUE(compareSnapshots(snapshot1, snapshot2))
        << "Snapshot round-trip should produce identical bytes";
}

TEST_F(DeterminismTest, UndoRedoRestoresExactState) {
    // Create initial state
    std::vector<std::tuple<uint32_t, uint32_t, std::vector<uint8_t>>> initial = {
        {2, 1, makeRectPayload(10.0f, 20.0f, 30.0f, 40.0f)},
    };
    auto cmd1 = buildCommandBuffer(initial);
    engine1.applyCommandBuffer(cmd1.data(), static_cast<uint32_t>(cmd1.size()));

    // Capture state before modification
    auto snapshotBefore = engine1.buildSnapshotBytes();

    // Make a modification
    std::vector<std::tuple<uint32_t, uint32_t, std::vector<uint8_t>>> modification = {
        {2, 2, makeRectPayload(50.0f, 50.0f, 20.0f, 20.0f)},
    };
    auto cmd2 = buildCommandBuffer(modification);
    engine1.applyCommandBuffer(cmd2.data(), static_cast<uint32_t>(cmd2.size()));

    // Verify state changed
    auto snapshotAfter = engine1.buildSnapshotBytes();
    ASSERT_FALSE(compareSnapshots(snapshotBefore, snapshotAfter))
        << "Modification should change state";

    // Undo
    ASSERT_TRUE(engine1.canUndo());
    engine1.undo();

    // State should be restored exactly
    auto snapshotRestored = engine1.buildSnapshotBytes();
    ASSERT_TRUE(compareSnapshots(snapshotBefore, snapshotRestored))
        << "Undo should restore exact previous state";

    // Redo
    ASSERT_TRUE(engine1.canRedo());
    engine1.redo();

    // State should match the modified state
    auto snapshotRedone = engine1.buildSnapshotBytes();
    ASSERT_TRUE(compareSnapshots(snapshotAfter, snapshotRedone))
        << "Redo should restore exact modified state";
}

TEST_F(DeterminismTest, EntityIdsAreSequential) {
    // Allocate multiple IDs
    uint32_t id1 = engine1.allocateEntityId();
    uint32_t id2 = engine1.allocateEntityId();
    uint32_t id3 = engine1.allocateEntityId();

    // IDs should be sequential
    EXPECT_EQ(id2, id1 + 1);
    EXPECT_EQ(id3, id2 + 1);
}

TEST_F(DeterminismTest, SelectionIsIncludedInSnapshot) {
    // Create entities
    std::vector<std::tuple<uint32_t, uint32_t, std::vector<uint8_t>>> commands = {
        {2, 1, makeRectPayload(10.0f, 20.0f, 30.0f, 40.0f)},
        {2, 2, makeRectPayload(50.0f, 50.0f, 20.0f, 20.0f)},
    };
    auto cmdBuffer = buildCommandBuffer(commands);
    engine1.applyCommandBuffer(cmdBuffer.data(), static_cast<uint32_t>(cmdBuffer.size()));

    // Select first entity
    std::vector<uint32_t> selection = {1};
    engine1.setSelection(selection.data(), static_cast<uint32_t>(selection.size()), 0);

    // Get snapshot with selection
    auto snapshot1 = engine1.buildSnapshotBytes();

    // Load into engine2
    engine2.loadSnapshotFromPtr(snapshot1.data(), static_cast<uint32_t>(snapshot1.size()));

    // Verify selection was restored
    auto restoredSelection = engine2.getSelectionIds();
    ASSERT_EQ(restoredSelection.size(), 1u);
    EXPECT_EQ(restoredSelection[0], 1u);
}
