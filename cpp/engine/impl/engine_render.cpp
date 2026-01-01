// CadEngine render buffer methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"
#include "engine/render/render.h"

namespace {
    bool isEntityVisibleForRenderThunk(void* ctx, std::uint32_t id) {
        const auto* engine = static_cast<const CadEngine*>(ctx);
        return engine ? engine->isEntityVisibleForRender(id) : true;
    }
}

void CadEngine::pushVertex(float x, float y, float z, float r, float g, float b, std::vector<float>& target) const {
    target.push_back(x); target.push_back(y); target.push_back(z);
    target.push_back(r); target.push_back(g); target.push_back(b);
}
void CadEngine::pushVertex(float x, float y, float z, std::vector<float>& target) const {
    target.push_back(x); target.push_back(y); target.push_back(z);
}

void CadEngine::addRect(float x, float y, float w, float h, float r, float g, float b) const {
    // This overload is likely deprecated or unused for internal logic now, 
    // but kept for API compatibility if needed. It assumes full opacity if called directly.
    // However, the main render loop uses engine::rebuildRenderBuffers -> addRectToBuffers 
    // which operates on RectRec (containing 'a').
    // Let's implement it assuming full opacity or just delegate to helper.
    const float x0 = x;
    const float y0 = y;
    const float x1 = x + w;
    const float y1 = y + h;
    constexpr float z = 0.0f;

    pushVertex(x0, y0, z, r, g, b, triangleVertices);
    pushVertex(x1, y0, z, r, g, b, triangleVertices);
    pushVertex(x1, y1, z, r, g, b, triangleVertices);

    pushVertex(x0, y0, z, r, g, b, triangleVertices);
    pushVertex(x1, y1, z, r, g, b, triangleVertices);
    pushVertex(x0, y1, z, r, g, b, triangleVertices);
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
    if (!interactionSession_.snapOptions.enabled || !interactionSession_.snapOptions.gridEnabled || interactionSession_.snapOptions.gridSize <= 0.001f) {
        return;
    }
    // Simple safeguard against invalid view
    if (viewScale <= 1e-6f || viewWidth <= 0.0f || viewHeight <= 0.0f) return;

    const float s = viewScale;
    // Visible world area
    const float minX = -viewX / s;
    const float minY = -viewY / s;
    const float maxX = (viewWidth - viewX) / s;
    const float maxY = (viewHeight - viewY) / s;

    // Expand slightly to cover fully
    const float margin = interactionSession_.snapOptions.gridSize;
    const float startX = std::floor((minX - margin) / interactionSession_.snapOptions.gridSize) * interactionSession_.snapOptions.gridSize;
    const float startY = std::floor((minY - margin) / interactionSession_.snapOptions.gridSize) * interactionSession_.snapOptions.gridSize;
    const float endX = maxX + margin;
    const float endY = maxY + margin;

    // Grid Color: Light Gray, modest alpha
    const float r = 0.5f;
    const float g = 0.5f;
    const float b = 0.5f;
    const float a = 0.3f; 

    auto pushV = [&](float x, float y) {
        lineVertices.push_back(x);
        lineVertices.push_back(y);
        lineVertices.push_back(0.0f); // z
        lineVertices.push_back(r);
        lineVertices.push_back(g);
        lineVertices.push_back(b);
        lineVertices.push_back(a);
    };

    // Limit grid lines to avoid freezing on massive zoom out
    const float width = endX - startX;
    const float height = endY - startY;
    const float estLines = (width + height) / interactionSession_.snapOptions.gridSize;
    
    // Draw grid
    if (estLines < 5000) {
        // Vertical lines
        for (float x = startX; x <= endX; x += interactionSession_.snapOptions.gridSize) {
            pushV(x, startY);
            pushV(x, endY);
        }
        // Horizontal lines
        for (float y = startY; y <= endY; y += interactionSession_.snapOptions.gridSize) {
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
    lineVertices.push_back(x0);
    lineVertices.push_back(y0);
    lineVertices.push_back(z);
    lineVertices.push_back(r);
    lineVertices.push_back(g);
    lineVertices.push_back(b);
    lineVertices.push_back(a);
    lineVertices.push_back(x1);
    lineVertices.push_back(y1);
    lineVertices.push_back(z);
    lineVertices.push_back(r);
    lineVertices.push_back(g);
    lineVertices.push_back(b);
    lineVertices.push_back(a);
}

void CadEngine::rebuildRenderBuffers() const {
    const double t0 = emscripten_get_now();
    rebuildAllGeometryCount_++;
    
    engine::rebuildRenderBuffers(
        entityManager_.rects,
        entityManager_.lines,
        entityManager_.polylines,
        entityManager_.points,
        entityManager_.circles,
        entityManager_.polygons,
        entityManager_.arrows,
        entityManager_.entities,
        entityManager_.drawOrderIds,
        viewScale,
        triangleVertices,
        lineVertices,
        const_cast<CadEngine*>(this),
        &isEntityVisibleForRenderThunk,
        &renderRanges_
    );
    
    // Grid rendering is handled by the WebGL GridPass (frontend).
    // Draft rendering is now handled by the phantom entity system (no addDraftToBuffers needed).
    renderDirty = false;
    pendingFullRebuild_ = false;
    
    const double t1 = emscripten_get_now();
    lastRebuildMs = static_cast<float>(t1 - t0);
}

bool CadEngine::refreshEntityRenderRange(std::uint32_t id) const {
    if (renderDirty) return false;
    const auto rangeIt = renderRanges_.find(id);
    if (rangeIt == renderRanges_.end()) return false;
    const auto entIt = entityManager_.entities.find(id);
    if (entIt == entityManager_.entities.end()) return false;

    std::vector<float> temp;
    temp.reserve(rangeIt->second.count);
    const bool appended = engine::buildEntityRenderData(
        id,
        entIt->second,
        entityManager_.rects,
        entityManager_.lines,
        entityManager_.polylines,
        entityManager_.points,
        entityManager_.circles,
        entityManager_.polygons,
        entityManager_.arrows,
        viewScale,
        temp,
        const_cast<CadEngine*>(this),
        &isEntityVisibleForRenderThunk
    );

    if (!appended) return false;
    if (temp.size() != rangeIt->second.count) {
        pendingFullRebuild_ = true;
        return false;
    }
    const std::size_t start = rangeIt->second.offset;
    if (start + temp.size() > triangleVertices.size()) {
        pendingFullRebuild_ = true;
        return false;
    }

    std::copy(temp.begin(), temp.end(), triangleVertices.begin() + static_cast<std::ptrdiff_t>(start));
    return true;
}

#include "engine/internal/engine_state_aliases_undef.h"

