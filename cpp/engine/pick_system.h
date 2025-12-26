#pragma once

#include "engine/types.h"
#include "engine/entity_manager.h"
#include "engine/text_system.h"
#include <vector>
#include <unordered_map>
#include <cstdint>
#include <limits>
#include <cmath>
#include <algorithm>

struct AABB {
    float minX, minY, maxX, maxY;

    bool intersects(const AABB& other) const {
        return (minX <= other.maxX && maxX >= other.minX &&
                minY <= other.maxY && maxY >= other.minY);
    }

    void expand(float v) {
        minX -= v; minY -= v;
        maxX += v; maxY += v;
    }
};

class SpatialHashGrid {
public:
    SpatialHashGrid(float cellSize = 50.0f);

    void insert(std::uint32_t id, const AABB& bounds);
    void remove(std::uint32_t id);
    void clear();

    // Returns a reference to a reused vector to avoid allocation, copy immediately if needed.
    // However, for safety in multi-step pick, we'll return a value or populate a target vector.
    // Let's populate a target vector to avoid allocs.
    void query(const AABB& bounds, std::vector<std::uint32_t>& results) const;

private:
    float cellSize_;
    // Map cell hash -> list of entity IDs
    std::unordered_map<std::int64_t, std::vector<std::uint32_t>> cells_;
    // Map entity ID -> list of cell hashes (for efficient removal)
    std::unordered_map<std::uint32_t, std::vector<std::int64_t>> entityCells_;

    std::int64_t hash(int ix, int iy) const;
};

struct PickResult {
    std::uint32_t id;
    float distance;
    std::uint32_t zIndex; // Higher is better (top-most)

    bool operator<(const PickResult& other) const {
        // Priority:
        // 1. Distance (lower is better)
        // 2. Z-Index (higher is better)
        // 3. ID (higher is better, consistent fallback)

        if (std::abs(distance - other.distance) > 1e-4f) {
            return distance < other.distance;
        }
        if (zIndex != other.zIndex) {
            return zIndex > other.zIndex;
        }
        return id > other.id;
    }
};

class PickSystem {
public:
    PickSystem();

    void clear();

    // Lifecycle integration
    void update(std::uint32_t id, const AABB& bounds);
    void remove(std::uint32_t id);

    // Updates Z-order map for efficient "top-most" resolution
    void setDrawOrder(const std::vector<std::uint32_t>& order);

    // Sets specific Z-index for an entity (e.g. on upsert)
    void setZ(std::uint32_t id, std::uint32_t z);
    // Gets current max Z
    std::uint32_t getMaxZ() const;

    // Main pick entry point
    // Returns 0 if no hit
    std::uint32_t pick(
        float x, float y,
        float tolerance,
        float viewScale,
        const EntityManager& entities,
        const TextSystem& textSystem
    );

    // AABB Computation Helpers
    static AABB computeRectAABB(const RectRec& r);
    static AABB computeCircleAABB(const CircleRec& c);
    static AABB computeLineAABB(const LineRec& l);
    static AABB computePolylineAABB(const PolyRec& pl, const std::vector<Point2>& points);
    static AABB computePolygonAABB(const PolygonRec& p);
    static AABB computeArrowAABB(const ArrowRec& a);

    // Stats (Dev only)
    struct Stats {
        std::uint32_t candidatesChecked;
        std::uint32_t indexCellsQueried;
    };
    Stats getLastStats() const { return lastStats_; }

private:
    SpatialHashGrid index_;
    std::unordered_map<std::uint32_t, std::uint32_t> zIndexMap_;
    Stats lastStats_{0, 0};

    // Hit Test Implementations
    float hitTestRect(float x, float y, float tol, const RectRec& r);
    float hitTestCircle(float x, float y, float tol, const CircleRec& c);
    float hitTestLine(float x, float y, float tol, float viewScale, const LineRec& l);
    float hitTestPolyline(float x, float y, float tol, float viewScale, const PolyRec& pl, const std::vector<Point2>& points);
    float hitTestPolygon(float x, float y, float tol, const PolygonRec& p);
    float hitTestArrow(float x, float y, float tol, float viewScale, const ArrowRec& a);
    float hitTestText(float x, float y, float tol, std::uint32_t id, const TextSystem& textSystem);
};
