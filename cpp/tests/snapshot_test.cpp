#include <gtest/gtest.h>
#include "engine/snapshot.h"

using namespace engine;

TEST(SnapshotTest, RoundTrip) {
    SnapshotData data;
    data.rects.push_back(RectRec{1, 10.0f, 20.0f, 30.0f, 40.0f, 0.1f, 0.2f, 0.3f});
    data.lines.push_back(LineRec{2, 0.0f, 0.0f, 5.0f, 5.0f});
    data.polylines.push_back(PolyRec{3, 0, 2});
    data.points.push_back(Point2{1.0f, 1.0f});
    data.points.push_back(Point2{2.0f, 2.0f});

    auto bytes = buildSnapshotBytes(data);
    ASSERT_GT(bytes.size(), 0u);

    auto parsed = parseSnapshot(bytes.data(), static_cast<uint32_t>(bytes.size()));
    EXPECT_EQ(parsed.rects.size(), data.rects.size());
    EXPECT_EQ(parsed.lines.size(), data.lines.size());
    EXPECT_EQ(parsed.points.size(), data.points.size());
}
