#pragma once

#include "engine/engine.h"
#include "engine/internal/engine_state.h"

class CadEngineTestAccessor {
public:
    static const EntityManager& entityManager(const CadEngine& engine) {
        return engine.state().entityManager_;
    }

    static EngineError lastError(const CadEngine& engine) {
        return engine.state().lastError;
    }

    static void upsertRect(CadEngine& engine, std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a) {
        engine.upsertRect(id, x, y, w, h, r, g, b, a);
    }

    static void upsertLine(CadEngine& engine, std::uint32_t id, float x0, float y0, float x1, float y1) {
        engine.upsertLine(id, x0, y0, x1, y1);
    }

    static void clearHistory(CadEngine& engine) {
        engine.clearHistory();
    }

    static void upsertCircle(
        CadEngine& engine,
        std::uint32_t id,
        float cx,
        float cy,
        float rx,
        float ry,
        float rot,
        float sx,
        float sy,
        float fillR,
        float fillG,
        float fillB,
        float fillA,
        float strokeR,
        float strokeG,
        float strokeB,
        float strokeA,
        float strokeEnabled,
        float strokeWidthPx) {
        engine.upsertCircle(
            id, cx, cy, rx, ry, rot, sx, sy,
            fillR, fillG, fillB, fillA,
            strokeR, strokeG, strokeB, strokeA,
            strokeEnabled, strokeWidthPx);
    }

    static void upsertPolygon(
        CadEngine& engine,
        std::uint32_t id,
        float cx,
        float cy,
        float rx,
        float ry,
        float rot,
        float sx,
        float sy,
        std::uint32_t sides,
        float fillR,
        float fillG,
        float fillB,
        float fillA,
        float strokeR,
        float strokeG,
        float strokeB,
        float strokeA,
        float strokeEnabled,
        float strokeWidthPx) {
        engine.upsertPolygon(
            id, cx, cy, rx, ry, rot, sx, sy, sides,
            fillR, fillG, fillB, fillA,
            strokeR, strokeG, strokeB, strokeA,
            strokeEnabled, strokeWidthPx);
    }

    static void upsertArrow(
        CadEngine& engine,
        std::uint32_t id,
        float ax,
        float ay,
        float bx,
        float by,
        float head,
        float strokeR,
        float strokeG,
        float strokeB,
        float strokeA,
        float strokeEnabled,
        float strokeWidthPx) {
        engine.upsertArrow(
            id, ax, ay, bx, by, head,
            strokeR, strokeG, strokeB, strokeA,
            strokeEnabled, strokeWidthPx);
    }

    static void deleteEntity(CadEngine& engine, std::uint32_t id) {
        engine.deleteEntity(id);
    }

    static void setViewTransform(CadEngine& engine, float x, float y, float scale, float width, float height) {
        auto& state = engine.state();
        state.viewX = x;
        state.viewY = y;
        state.viewScale = scale;
        state.viewWidth = width;
        state.viewHeight = height;
    }

    static float viewScale(const CadEngine& engine) {
        return engine.state().viewScale;
    }

    static TextSystem& textSystem(CadEngine& engine) {
        return engine.state().textSystem_;
    }

    static const TextSystem& textSystem(const CadEngine& engine) {
        return engine.state().textSystem_;
    }

    static std::uint32_t generation(const CadEngine& engine) {
        return engine.state().generation;
    }

    static bool tryGetEntityGeomZ(const CadEngine& engine, std::uint32_t id, float& outZ) {
        return engine.tryGetEntityGeomZ(id, outZ);
    }

    static bool setEntityGeomZ(CadEngine& engine, std::uint32_t id, float z) {
        return engine.setEntityGeomZ(id, z);
    }
};
