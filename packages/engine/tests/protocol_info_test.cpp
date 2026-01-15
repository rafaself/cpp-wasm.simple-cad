#include <gtest/gtest.h>
#include "engine/engine.h"

TEST(ProtocolInfoTest, NonZeroAndStable) {
    CadEngine engine;
    const auto info1 = engine.getProtocolInfo();
    const auto info2 = engine.getProtocolInfo();

    EXPECT_EQ(info1.protocolVersion, EngineProtocolInfo::kProtocolVersion);
    EXPECT_EQ(info1.commandVersion, EngineProtocolInfo::kCommandVersion);
    EXPECT_EQ(info1.snapshotVersion, EngineProtocolInfo::kSnapshotVersion);
    EXPECT_EQ(info1.eventStreamVersion, EngineProtocolInfo::kEventStreamVersion);
    EXPECT_EQ(info1.featureFlags, EngineProtocolInfo::kFeatureFlags);

    EXPECT_NE(info1.protocolVersion, 0u);
    EXPECT_NE(info1.commandVersion, 0u);
    EXPECT_NE(info1.snapshotVersion, 0u);
    EXPECT_NE(info1.eventStreamVersion, 0u);
    EXPECT_NE(info1.abiHash, 0u);
    EXPECT_NE(info1.featureFlags, 0u);

    EXPECT_EQ(info1.abiHash, info2.abiHash);
    EXPECT_EQ(info1.featureFlags, info2.featureFlags);
}
