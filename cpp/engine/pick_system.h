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

enum class PickSubTarget : std::uint8_t {
    None = 0,
    Body = 1,
    Edge = 2,
    Vertex = 3,
    ResizeHandle = 4,
    RotateHandle = 5,
    TextBody = 6,
    TextCaret = 7
};

enum class PickEntityKind : std::uint16_t {
    Unknown = 0,
    Rect = 1,
    Circle = 2,
    Line = 3,
    Polyline = 4,
    Polygon = 5,
    Arrow = 6,
    Text = 7
};

struct PickResult {
    std::uint32_t id;          // 0 = miss
    std::uint16_t kind;        // PickEntityKind (cast to uint16)
    std::uint8_t subTarget;    // PickSubTarget (cast to uint8)
    std::int32_t subIndex;     // vertex index / edge index / handle index / caret index; -1 if N/A
    float distance;            // best distance in world units (>=0).
    float hitX;                // world hit point
    float hitY;                // world hit point
};

// Internal candidate for sorting
struct PickCandidate {
    std::uint32_t id;
    float distance;
    std::uint32_t zIndex; // Higher is better (top-most)

    // Extended info for PickEx
    PickEntityKind kind;
    PickSubTarget subTarget;
    std::int32_t subIndex;

    bool operator<(const PickCandidate& other) const {
        // Priority:
        // 1. Distance (lower is better) - strict tolerance check
        // 2. SubTarget Priority (Vertex > Handle > Edge > Body)
        // 3. Z-Index (higher is better)
        // 4. ID (higher is better, consistent fallback)

        if (std::abs(distance - other.distance) > 1e-4f) {
            return distance < other.distance;
        }

        // If distances are equal, check SubTarget priority
        // We want Vertex(3) > Edge(2) > Body(1).
        // Handles(4,5) are also high priority.
        // Let's define a priority score.
        auto getPriority = [](PickSubTarget t) {
            switch(t) {
                case PickSubTarget::Vertex: return 10;
                case PickSubTarget::ResizeHandle: return 9;
                case PickSubTarget::RotateHandle: return 9;
                case PickSubTarget::TextCaret: return 8;
                case PickSubTarget::Edge: return 5;
                case PickSubTarget::TextBody: return 1;
                case PickSubTarget::Body: return 1;
                default: return 0;
            }
        };

        int p1 = getPriority(subTarget);
        int p2 = getPriority(other.subTarget);
        if (p1 != p2) {
            return p1 > p2; // Higher priority wins
        }

        if (zIndex != other.zIndex) {
            return zIndex > other.zIndex;
        }
        return id > other.id;
    }
};

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

    void query(const AABB& bounds, std::vector<std::uint32_t>& results) const;

private:
    float cellSize_;
    std::unordered_map<std::int64_t, std::vector<std::uint32_t>> cells_;
    std::unordered_map<std::uint32_t, std::vector<std::int64_t>> entityCells_;

    std::int64_t hash(int ix, int iy) const;
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
    std::uint32_t getMaxZ() const;

    // Legacy pick (returns ID only)
    std::uint32_t pick(
        float x, float y,
        float tolerance,
        float viewScale,
        const EntityManager& entities,
        const TextSystem& textSystem
    );

    // New extended pick
    PickResult pickEx(
        float x, float y,
        float tolerance,
        float viewScale,
        std::uint32_t pickMask,
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

    // Helper to evaluate a single candidate for pickEx
    bool checkCandidate(
        std::uint32_t id,
        float x, float y,
        float tol,
        float viewScale,
        std::uint32_t pickMask,
        const EntityManager& entities,
        const TextSystem& textSystem,
        PickCandidate& outCandidate
    );
};
