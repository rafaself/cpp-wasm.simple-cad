#pragma once

#include <vector>
#include <unordered_map>
#include <cstdint>
#include <cmath>
#include <limits>
#include "engine/core/types.h"
#include "engine/entity/entity_manager.h"
#include "engine/text_system.h"

// Types
struct AABB {
    float minX, minY, maxX, maxY;
};

// Return struct for picking
struct PickResult {
    std::uint32_t id;
    std::uint16_t kind;      // PickEntityKind
    std::uint8_t subTarget;  // PickSubTarget
    int32_t subIndex;        // Vertex/Edge index
    float distance;
    float hitX, hitY;        // World hit point
};

enum class PickSubTarget : uint8_t {
    None = 0,
    Body = 1,
    Edge = 2,
    Vertex = 3,
    ResizeHandle = 4,
    RotateHandle = 5,
    TextBody = 6,
    TextCaret = 7
};

enum class PickEntityKind : uint16_t {
    Unknown = 0,
    Rect = 1,
    Circle = 2,
    Line = 3,
    Polyline = 4,
    Polygon = 5,
    Arrow = 6,
    Text = 7
};

// Internal candidate during picking
struct PickCandidate {
    std::uint32_t id;
    PickEntityKind kind;
    PickSubTarget subTarget;
    int32_t subIndex;
    float distance;
    std::uint32_t zIndex;

    // Sort order:
    // 1. SubTarget Priority: Handle > Vertex > Edge > Body
    // 2. Z-Index: Higher is better
    // 3. Distance: Closer is better
    bool operator<(const PickCandidate& other) const {
        // Priority map
        auto priority = [](PickSubTarget t) {
            switch(t) {
                case PickSubTarget::ResizeHandle: return 10;
                case PickSubTarget::RotateHandle: return 9;
                case PickSubTarget::Vertex: return 8;
                case PickSubTarget::TextCaret: return 8;
                case PickSubTarget::Edge: return 5;
                case PickSubTarget::Body: return 1;
                case PickSubTarget::TextBody: return 1;
                default: return 0;
            }
        };
        int p1 = priority(subTarget);
        int p2 = priority(other.subTarget);
        if (p1 != p2) return p1 > p2;

        // If priority same (e.g. Body vs Body), use Z-Index
        if (zIndex != other.zIndex) return zIndex > other.zIndex;

        // Finally distance
        return distance < other.distance;
    }
};

struct PickStats {
    std::uint32_t indexCellsQueried;
    std::uint32_t candidatesChecked;
};

class SpatialHashGrid {
public:
    SpatialHashGrid(float cellSize);
    void insert(std::uint32_t id, const AABB& bounds);
    void remove(std::uint32_t id);
    void clear();
    void query(const AABB& bounds, std::vector<std::uint32_t>& results) const;

private:
    float cellSize_;
    // Hash map from cell key to list of entity IDs
    std::unordered_map<std::int64_t, std::vector<std::uint32_t>> cells_;
    // Map from entity ID to list of keys it occupies (for fast removal)
    std::unordered_map<std::uint32_t, std::vector<std::int64_t>> entityCells_;

    std::int64_t hash(int x, int y) const;
};

class PickSystem {
public:
    PickSystem();

    void clear();
    void update(std::uint32_t id, const AABB& bounds);
    void remove(std::uint32_t id);

    void setDrawOrder(const std::vector<std::uint32_t>& order);
    void setZ(std::uint32_t id, std::uint32_t z);
    std::uint32_t getMaxZ() const;

    // Helpers to compute bounds
    static AABB computeRectAABB(const RectRec& r);
    static AABB computeCircleAABB(const CircleRec& c);
    static AABB computeLineAABB(const LineRec& l);
    static AABB computePolylineAABB(const PolyRec& pl, const std::vector<Point2>& points);
    static AABB computePolygonAABB(const PolygonRec& p);
    static AABB computeArrowAABB(const ArrowRec& a);

    // Pick
    std::uint32_t pick(float x, float y, float tolerance, float viewScale,
                       const EntityManager& entities, const TextSystem& textSystem);

    PickResult pickEx(float x, float y, float tolerance, float viewScale,
                      std::uint32_t pickMask,
                      const EntityManager& entities, const TextSystem& textSystem);

    void queryArea(const AABB& area, std::vector<std::uint32_t>& outResults) const;

    PickStats getLastStats() const { return lastStats_; }

private:
    SpatialHashGrid index_;
    std::unordered_map<std::uint32_t, std::uint32_t> zIndexMap_;
    mutable PickStats lastStats_{0, 0};

    bool checkCandidate(std::uint32_t id, float x, float y, float tol, float viewScale,
                        std::uint32_t pickMask,
                        const EntityManager& entities,
                        const TextSystem& textSystem,
                        PickCandidate& outCandidate);
};
