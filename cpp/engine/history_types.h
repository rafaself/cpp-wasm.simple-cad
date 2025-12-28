#pragma once

#include "engine/types.h"
#include "engine/snapshot.h"
#include <vector>
#include <string>
#include <unordered_map>

// Interactive transform snapshot
struct TransformSnapshot {
    std::uint32_t id;
    float x;
    float y;
    float w;
    float h;
    std::vector<Point2> points;
};

// Entity snapshot for history/undo/redo
struct EntitySnapshot {
    std::uint32_t id;
    EntityKind kind;
    std::uint32_t layerId;
    std::uint32_t flags;

    // Union-like storage of potential entity data matching snapshot.h structs
    RectRec rect;
    LineRec line;
    PolyRec poly;     
    CircleRec circle;
    PolygonRec polygon;
    ArrowRec arrow;
    
    // Text specific
    TextPayloadHeader textHeader;  
    std::vector<TextRunPayload> textRuns; 
    std::string textContent; 

    // Poly/variable specific
    std::vector<Point2> points;
};

// A single entry in the undo/redo stack
struct HistoryEntry {
    bool hasLayerChange = false;
    std::vector<engine::LayerSnapshot> layersBefore;
    std::vector<engine::LayerSnapshot> layersAfter;

    struct EntityChange {
        std::uint32_t id;
        bool existedBefore;
        bool existedAfter;
        EntitySnapshot before;
        EntitySnapshot after;
    };
    std::vector<EntityChange> entities;

    bool hasDrawOrderChange = false;
    std::vector<std::uint32_t> drawOrderBefore;
    std::vector<std::uint32_t> drawOrderAfter;

    bool hasSelectionChange = false;
    std::vector<std::uint32_t> selectionBefore;
    std::vector<std::uint32_t> selectionAfter;

    std::uint32_t nextIdBefore = 0;
    std::uint32_t nextIdAfter = 0;
    
    std::uint32_t generation = 0;
};

// Transaction state for accumulating a HistoryEntry
struct HistoryTransaction {
    bool active = false;
    HistoryEntry entry;
    std::unordered_map<std::uint32_t, std::size_t> entityIndex;
};
