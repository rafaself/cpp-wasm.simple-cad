#include <gtest/gtest.h>
#include "engine/electrical.h"

using namespace engine;

TEST(ElectricalTest, ResolveAndSnap) {
    std::unordered_map<std::uint32_t, EntityRef> entities;
    std::vector<SymbolRec> symbols;
    std::vector<NodeRec> nodes;

    // Create a symbol
    symbols.push_back(SymbolRec{10, 1, 100.0f, 100.0f, 20.0f, 20.0f, 0.0f, 1.0f, 1.0f, 0.5f, 0.5f});
    entities[10] = EntityRef{EntityKind::Symbol, 0};

    // Create a node anchored to symbol
    nodes.push_back(NodeRec{20, NodeKind::Anchored, 10, 0.0f, 0.0f});
    entities[20] = EntityRef{EntityKind::Node, 0};

    Point2 out;
    EXPECT_TRUE(resolveNodePosition(entities, symbols, nodes, 20, out));
    EXPECT_NEAR(out.x, 110.0f, 1e-6);
    EXPECT_NEAR(out.y, 110.0f, 1e-6);

    auto snap = snapElectrical(entities, symbols, nodes, 110.0f, 110.0f, 5.0f);
    EXPECT_EQ(snap.kind, 2u);
    EXPECT_EQ(snap.id, 10u);
}
