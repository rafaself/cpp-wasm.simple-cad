#include <gtest/gtest.h>
#include "engine/engine.h"
#include "tests/test_accessors.h"

TEST(EventStreamTest, CoalescesEntityChanges) {
    CadEngine engine;

    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 20.0f, 1.0f, 0.0f, 0.0f, 1.0f);
    engine.pollEvents(256); // drain creation events

    engine.setEntityFlags(1,
                          static_cast<std::uint32_t>(EntityFlags::Locked),
                          static_cast<std::uint32_t>(EntityFlags::Locked));
    engine.setEntityLayer(1, 2);
    CadEngineTestAccessor::upsertRect(engine, 1, 1.0f, 2.0f, 11.0f, 21.0f, 0.5f, 0.5f, 0.5f, 1.0f);

    auto meta = engine.pollEvents(256);
    ASSERT_GE(meta.count, 2u);

    const auto* events = reinterpret_cast<const CadEngine::EngineEvent*>(meta.ptr);
    ASSERT_NE(events, nullptr);

    EXPECT_EQ(events[0].type, static_cast<std::uint16_t>(CadEngine::EventType::DocChanged));
    EXPECT_EQ(events[1].type, static_cast<std::uint16_t>(CadEngine::EventType::EntityChanged));
    EXPECT_EQ(events[1].a, 1u);

    const std::uint32_t expectedMask =
        static_cast<std::uint32_t>(CadEngine::ChangeMask::Geometry)
        | static_cast<std::uint32_t>(CadEngine::ChangeMask::Style)
        | static_cast<std::uint32_t>(CadEngine::ChangeMask::Bounds)
        | static_cast<std::uint32_t>(CadEngine::ChangeMask::Flags)
        | static_cast<std::uint32_t>(CadEngine::ChangeMask::Layer);
    EXPECT_EQ(events[1].b, expectedMask);
}

TEST(EventStreamTest, PollRespectsMaxEvents) {
    CadEngine engine;
    CadEngineTestAccessor::upsertRect(engine, 1, 0.0f, 0.0f, 10.0f, 20.0f, 1.0f, 0.0f, 0.0f, 1.0f);

    auto metaA = engine.pollEvents(2);
    ASSERT_EQ(metaA.count, 2u);
    const auto* eventsA = reinterpret_cast<const CadEngine::EngineEvent*>(metaA.ptr);
    ASSERT_NE(eventsA, nullptr);
    EXPECT_EQ(eventsA[0].type, static_cast<std::uint16_t>(CadEngine::EventType::DocChanged));
    EXPECT_EQ(eventsA[1].type, static_cast<std::uint16_t>(CadEngine::EventType::EntityCreated));

    auto metaB = engine.pollEvents(2);
    ASSERT_EQ(metaB.count, 2u);
    const auto* eventsB = reinterpret_cast<const CadEngine::EngineEvent*>(metaB.ptr);
    ASSERT_NE(eventsB, nullptr);
    EXPECT_EQ(eventsB[0].type, static_cast<std::uint16_t>(CadEngine::EventType::OrderChanged));
    EXPECT_EQ(eventsB[1].type, static_cast<std::uint16_t>(CadEngine::EventType::HistoryChanged));
}

TEST(EventStreamTest, OverflowTriggersResyncAck) {
    CadEngine engine;

    for (std::uint32_t i = 1; i <= 3000; i++) {
        CadEngineTestAccessor::upsertRect(engine, i, 0.0f, 0.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f, 1.0f);
    }

    auto meta = engine.pollEvents(1024);
    ASSERT_EQ(meta.count, 1u);
    const auto* events = reinterpret_cast<const CadEngine::EngineEvent*>(meta.ptr);
    ASSERT_NE(events, nullptr);
    ASSERT_EQ(events[0].type, static_cast<std::uint16_t>(CadEngine::EventType::Overflow));

    const std::uint32_t overflowGen = events[0].a;
    engine.ackResync(overflowGen);

    auto metaAfter = engine.pollEvents(16);
    EXPECT_EQ(metaAfter.count, 0u);
}
