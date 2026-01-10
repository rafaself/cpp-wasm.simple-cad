// CadEngine render buffer methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/render/render.h"

namespace {
    bool isEntityVisibleForRenderThunk(void* ctx, std::uint32_t id) {
        const auto* engine = static_cast<const CadEngine*>(ctx);
        return engine ? engine->isEntityVisibleForRender(id) : true;
    }

    bool resolveStyleForRenderThunk(void* ctx, std::uint32_t id, EntityKind kind, engine::ResolvedShapeStyle& out) {
        const auto* engine = static_cast<const CadEngine*>(ctx);
        if (!engine) return false;
        const ResolvedStyle style = engine->resolveStyleForRender(id, kind);
        out.fillR = style.fill.color.r;
        out.fillG = style.fill.color.g;
        out.fillB = style.fill.color.b;
        out.fillA = style.fill.color.a;
        out.strokeR = style.stroke.color.r;
        out.strokeG = style.stroke.color.g;
        out.strokeB = style.stroke.color.b;
        out.strokeA = style.stroke.color.a;
        out.fillEnabled = style.fill.enabled;
        out.strokeEnabled = style.stroke.enabled;
        return true;
    }
}

ResolvedStyle CadEngine::resolveStyleForRender(std::uint32_t id, EntityKind kind) const {
    return state().entityManager_.resolveStyle(id, kind);
}

void CadEngine::pushVertex(float x, float y, float z, float r, float g, float b, std::vector<float>& target) const {
    target.push_back(x); target.push_back(y); target.push_back(z);
    target.push_back(r); target.push_back(g); target.push_back(b);
}
void CadEngine::pushVertex(float x, float y, float z, std::vector<float>& target) const {
    target.push_back(x); target.push_back(y); target.push_back(z);
}

void CadEngine::addRect(float x, float y, float w, float h, float r, float g, float b) const {
    // This overload is unused by the main render path and assumes full opacity if called directly.
    // However, the main render loop uses engine::rebuildRenderBuffers -> addRectToBuffers 
    // which operates on RectRec (containing 'a').
    // Let's implement it assuming full opacity or just delegate to helper.
    const float x0 = x;
    const float y0 = y;
    const float x1 = x + w;
    const float y1 = y + h;
    constexpr float z = 0.0f;

    pushVertex(x0, y0, z, r, g, b, state().triangleVertices);
    pushVertex(x1, y0, z, r, g, b, state().triangleVertices);
    pushVertex(x1, y1, z, r, g, b, state().triangleVertices);

    pushVertex(x0, y0, z, r, g, b, state().triangleVertices);
    pushVertex(x1, y1, z, r, g, b, state().triangleVertices);
    pushVertex(x0, y1, z, r, g, b, state().triangleVertices);
}

void CadEngine::addRectOutline(float x, float y, float w, float h) const {
    const float x0 = x;
    const float y0 = y;
    const float x1 = x + w;
    const float y1 = y + h;
    constexpr float z = 0.0f;
    addLineSegment(x0, y0, x1, y0, z);
    addLineSegment(x1, y0, x1, y1, z);
    addLineSegment(x1, y1, x0, y1, z);
    addLineSegment(x0, y1, x0, y0, z);
    addLineSegment(x0, y1, x0, y0, z);
}

void CadEngine::addGridToBuffers() const {
    if (!state().interactionSession_.snapOptions.enabled || !state().interactionSession_.snapOptions.gridEnabled || state().interactionSession_.snapOptions.gridSize <= 0.001f) {
        return;
    }
    // Simple safeguard against invalid view
    if (state().viewScale <= 1e-6f || state().viewWidth <= 0.0f || state().viewHeight <= 0.0f) return;

    const float s = state().viewScale;
    // Visible world area
    const float minX = -state().viewX / s;
    const float minY = -state().viewY / s;
    const float maxX = (state().viewWidth - state().viewX) / s;
    const float maxY = (state().viewHeight - state().viewY) / s;

    // Expand slightly to cover fully
    const float margin = state().interactionSession_.snapOptions.gridSize;
    const float startX = std::floor((minX - margin) / state().interactionSession_.snapOptions.gridSize) * state().interactionSession_.snapOptions.gridSize;
    const float startY = std::floor((minY - margin) / state().interactionSession_.snapOptions.gridSize) * state().interactionSession_.snapOptions.gridSize;
    const float endX = maxX + margin;
    const float endY = maxY + margin;

    // Grid Color: Light Gray, modest alpha
    const float r = 0.5f;
    const float g = 0.5f;
    const float b = 0.5f;
    const float a = 0.3f; 

    auto pushV = [&](float x, float y) {
        state().lineVertices.push_back(x);
        state().lineVertices.push_back(y);
        state().lineVertices.push_back(0.0f); // z
        state().lineVertices.push_back(r);
        state().lineVertices.push_back(g);
        state().lineVertices.push_back(b);
        state().lineVertices.push_back(a);
    };

    // Limit grid lines to avoid freezing on massive zoom out
    const float width = endX - startX;
    const float height = endY - startY;
    const float estLines = (width + height) / state().interactionSession_.snapOptions.gridSize;
    
    // Draw grid
    if (estLines < 5000) {
        // Vertical lines
        for (float x = startX; x <= endX; x += state().interactionSession_.snapOptions.gridSize) {
            pushV(x, startY);
            pushV(x, endY);
        }
        // Horizontal lines
        for (float y = startY; y <= endY; y += state().interactionSession_.snapOptions.gridSize) {
            pushV(startX, y);
            pushV(endX, y);
        }
    }
}

void CadEngine::addLineSegment(float x0, float y0, float x1, float y1, float z) const {
    // Default color for legacy line helpers (not used by main render path).
    constexpr float r = 1.0f;
    constexpr float g = 1.0f;
    constexpr float b = 1.0f;
    constexpr float a = 1.0f;
    state().lineVertices.push_back(x0);
    state().lineVertices.push_back(y0);
    state().lineVertices.push_back(z);
    state().lineVertices.push_back(r);
    state().lineVertices.push_back(g);
    state().lineVertices.push_back(b);
    state().lineVertices.push_back(a);
    state().lineVertices.push_back(x1);
    state().lineVertices.push_back(y1);
    state().lineVertices.push_back(z);
    state().lineVertices.push_back(r);
    state().lineVertices.push_back(g);
    state().lineVertices.push_back(b);
    state().lineVertices.push_back(a);
}

void CadEngine::rebuildRenderBuffers() const {
    const double t0 = emscripten_get_now();
    state().rebuildAllGeometryCount_++;
    
    engine::rebuildRenderBuffers(
        state().entityManager_.rects,
        state().entityManager_.lines,
        state().entityManager_.polylines,
        state().entityManager_.points,
        state().entityManager_.circles,
        state().entityManager_.polygons,
        state().entityManager_.arrows,
        state().entityManager_.entities,
        state().entityManager_.drawOrderIds,
        state().viewScale,
        state().triangleVertices,
        state().lineVertices,
        const_cast<CadEngine*>(this),
        &isEntityVisibleForRenderThunk,
        &resolveStyleForRenderThunk,
        &state().renderRanges_
    );

    state().interactionSession_.appendDraftLineVertices(state().lineVertices);
    
    // Grid rendering is handled by the WebGL GridPass (frontend).
    // Draft preview lines are appended from the interaction session after geometry rebuild.
    state().renderDirty = false;
    state().pendingFullRebuild_ = false;
    
    const double t1 = emscripten_get_now();
    state().lastRebuildMs = static_cast<float>(t1 - t0);
}

bool CadEngine::refreshEntityRenderRange(std::uint32_t id) const {
    if (state().renderDirty) return false;
    const auto rangeIt = state().renderRanges_.find(id);
    if (rangeIt == state().renderRanges_.end()) return false;
    const auto entIt = state().entityManager_.entities.find(id);
    if (entIt == state().entityManager_.entities.end()) return false;

    std::vector<float> temp;
    temp.reserve(rangeIt->second.count);
    const bool appended = engine::buildEntityRenderData(
        id,
        entIt->second,
        state().entityManager_.rects,
        state().entityManager_.lines,
        state().entityManager_.polylines,
        state().entityManager_.points,
        state().entityManager_.circles,
        state().entityManager_.polygons,
        state().entityManager_.arrows,
        state().viewScale,
        temp,
        const_cast<CadEngine*>(this),
        &isEntityVisibleForRenderThunk,
        &resolveStyleForRenderThunk
    );

    if (!appended) return false;
    if (temp.size() != rangeIt->second.count) {
        state().pendingFullRebuild_ = true;
        return false;
    }
    const std::size_t start = rangeIt->second.offset;
    if (start + temp.size() > state().triangleVertices.size()) {
        state().pendingFullRebuild_ = true;
        return false;
    }

    std::copy(temp.begin(), temp.end(), state().triangleVertices.begin() + static_cast<std::ptrdiff_t>(start));
    return true;
}
