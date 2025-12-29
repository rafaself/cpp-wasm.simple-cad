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

    static void deleteEntity(CadEngine& engine, std::uint32_t id) {
        engine.deleteEntity(id);
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
};
