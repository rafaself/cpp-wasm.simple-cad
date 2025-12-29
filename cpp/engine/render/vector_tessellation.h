#ifndef ELETROCAD_ENGINE_VECTOR_TESSELLATION_H
#define ELETROCAD_ENGINE_VECTOR_TESSELLATION_H

#include "engine/core/types.h"
#include "engine/render/vector_ir.h"

#include <cstdint>
#include <unordered_map>
#include <vector>

namespace engine::vector {

struct TessellateOptions {
    float viewScale{1.0f};      // world->screen multiplier (used to interpret px tolerances)
    float tolerancePx{0.35f};   // curve flattening tolerance in screen-space pixels
};

struct QuadWork {
    Point2 p0;
    Point2 c;
    Point2 p1;
};

struct CubicWork {
    Point2 p0;
    Point2 c1;
    Point2 c2;
    Point2 p1;
};

class VectorTessellator {
public:
    VectorTessellator() = default;

    // Appends vertices (x,y,z,r,g,b,a) to outTriangles.
    // Caller owns z-ordering; this only generates geometry.
    void tessellateDocumentV1(const DocumentV1& doc, const TessellateOptions& opt, std::vector<float>& outTriangles);

private:
    // Scratch buffers reused across calls (no allocations in hot path when pre-reserved).
    std::unordered_map<std::uint32_t, const Path*> pathById_;

    std::vector<Point2> pathPoints_;                // concatenated contours
    std::vector<std::uint32_t> contourStarts_;      // start index per contour
    std::vector<std::uint8_t> contourClosed_;       // 0/1 per contour

    std::vector<Point2> contour_;                   // per-contour extracted points
    std::vector<Point2> dashPolyline_;              // per-contour dashed polyline
    std::vector<Point2> strokePts_;                 // per-contour stroke points (with cap extension)
    std::vector<Point2> strokeLeft_;
    std::vector<Point2> strokeRight_;

    std::vector<std::uint32_t> triIndices_;         // output indices for triangulation
    std::vector<std::uint32_t> earWork_;            // earclip mutable vertex list
    std::vector<QuadWork> quadStack_;
    std::vector<CubicWork> cubicStack_;

    void ensureScratchCapacity(std::size_t approxSegments);
};

} // namespace engine::vector

#endif // ELETROCAD_ENGINE_VECTOR_TESSELLATION_H
