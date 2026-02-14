#include "engine/interaction/interaction_session.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include <algorithm>
#include <cmath>

// ============================================================================
// Draft Implementation (Phantom Entity System)
// ============================================================================
// The draft system now creates a real temporary entity (phantom) with a reserved ID
// that gets rendered by the normal render pipeline. This ensures consistent visuals
// between draft preview and final entity.

void InteractionSession::beginDraft(const BeginDraftPayload& p) {
    // Cancel any existing draft first
    if (draft_.active) {
        removePhantomEntity();
    }

    draft_.active = true;
    float startX = p.x;
    float startY = p.y;
    applyGridSnap(startX, startY, snapOptions);

    draft_.kind = p.kind;
    draft_.startX = startX;
    draft_.startY = startY;
    draft_.currentX = startX;
    draft_.currentY = startY;
    draft_.fillR = p.fillR; draft_.fillG = p.fillG; draft_.fillB = p.fillB; draft_.fillA = p.fillA;
    draft_.strokeR = p.strokeR; draft_.strokeG = p.strokeG; draft_.strokeB = p.strokeB; draft_.strokeA = p.strokeA;
    draft_.strokeEnabled = p.strokeEnabled;
    draft_.strokeWidthPx = p.strokeWidthPx;
    draft_.sides = p.sides;
    draft_.head = p.head;
    draft_.flags = p.flags;
    draft_.points.clear();

    if (p.kind == static_cast<std::uint32_t>(EntityKind::Polyline)) {
        draft_.points.push_back({p.x, p.y});
    }

    // Create the phantom entity for immediate visual feedback
    upsertPhantomEntity();
    engine_.state().renderDirty = true;
}

void InteractionSession::updateDraft(float x, float y, std::uint32_t modifiers) {
    if (!draft_.active) return;
    applyGridSnap(x, y, snapOptions);
    const bool shiftDown = (modifiers & static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift)) != 0;
    const bool orthoShift = shiftDown && orthoOptions.shiftOverrideEnabled;
    const bool orthoActive = orthoOptions.persistentEnabled || orthoShift;
    if (orthoActive) {
        auto applyOrtho = [&](float anchorX, float anchorY) {
            const float dx = x - anchorX;
            const float dy = y - anchorY;
            if (std::abs(dx) >= std::abs(dy)) {
                y = anchorY;
            } else {
                x = anchorX;
            }
        };
        if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Line) ||
            draft_.kind == static_cast<std::uint32_t>(EntityKind::Arrow)) {
            applyOrtho(draft_.startX, draft_.startY);
        } else if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Polyline) && !draft_.points.empty()) {
            const Point2& anchor = draft_.points.back();
            applyOrtho(anchor.x, anchor.y);
        }
    } else if (shiftDown) {
        auto snapAngle = [&](float anchorX, float anchorY) {
            const float vecX = x - anchorX;
            const float vecY = y - anchorY;
            const float len = std::sqrt(vecX * vecX + vecY * vecY);
            if (len <= 1e-6f) return;
            constexpr float kPi = 3.14159265358979323846f;
            constexpr float kStep = kPi * 0.25f;
            const float angle = std::atan2(vecY, vecX);
            const float snapped = std::round(angle / kStep) * kStep;
            x = anchorX + std::cos(snapped) * len;
            y = anchorY + std::sin(snapped) * len;
        };
        if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Line) ||
            draft_.kind == static_cast<std::uint32_t>(EntityKind::Arrow)) {
            snapAngle(draft_.startX, draft_.startY);
        } else if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Polyline) && !draft_.points.empty()) {
            const Point2& anchor = draft_.points.back();
            snapAngle(anchor.x, anchor.y);
        } else if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Rect) ||
                   draft_.kind == static_cast<std::uint32_t>(EntityKind::Circle) ||
                   draft_.kind == static_cast<std::uint32_t>(EntityKind::Polygon)) {
            // Proportional constraint: force 1:1 aspect ratio (square bounding box)
            const float dx = x - draft_.startX;
            const float dy = y - draft_.startY;
            const float size = std::max(std::abs(dx), std::abs(dy));
            x = draft_.startX + (dx >= 0.0f ? size : -size);
            y = draft_.startY + (dy >= 0.0f ? size : -size);
        }
    }
    draft_.currentX = x;
    draft_.currentY = y;

    // Update the phantom entity to reflect new position
    upsertPhantomEntity();
    engine_.state().renderDirty = true;
}

void InteractionSession::appendDraftPoint(float x, float y, std::uint32_t modifiers) {
    if (!draft_.active) return;
    applyGridSnap(x, y, snapOptions);
    const bool shiftDown = (modifiers & static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift)) != 0;
    const bool orthoShift = shiftDown && orthoOptions.shiftOverrideEnabled;
    const bool orthoActive = orthoOptions.persistentEnabled || orthoShift;
    if (draft_.kind == static_cast<std::uint32_t>(EntityKind::Polyline) && !draft_.points.empty()) {
        const Point2& anchor = draft_.points.back();
        if (orthoActive) {
            const float dx = x - anchor.x;
            const float dy = y - anchor.y;
            if (std::abs(dx) >= std::abs(dy)) {
                y = anchor.y;
            } else {
                x = anchor.x;
            }
        } else if (shiftDown) {
            const float vecX = x - anchor.x;
            const float vecY = y - anchor.y;
            const float len = std::sqrt(vecX * vecX + vecY * vecY);
            if (len > 1e-6f) {
                constexpr float kPi = 3.14159265358979323846f;
                constexpr float kStep = kPi * 0.25f;
                const float angle = std::atan2(vecY, vecX);
                const float snapped = std::round(angle / kStep) * kStep;
                x = anchor.x + std::cos(snapped) * len;
                y = anchor.y + std::sin(snapped) * len;
            }
        }
    }
    draft_.points.push_back({x, y});
    draft_.currentX = x;
    draft_.currentY = y;

    // Update phantom entity with new point
    upsertPhantomEntity();
    engine_.state().renderDirty = true;
}

std::uint32_t InteractionSession::commitDraft() {
    if (!draft_.active) return 0;

    // Remove the phantom entity first
    removePhantomEntity();

    // Allocate a real entity ID
    const std::uint32_t id = engine_.allocateEntityId();

    // Create the final entity via CadEngine (which handles history)
    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Rect: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            if (w > 0.001f && h > 0.001f)
                engine_.upsertRect(id, x0, y0, w, h, draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Line:
            engine_.upsertLine(id, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        case EntityKind::Circle: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            if (w > 0.001f && h > 0.001f)
                engine_.upsertCircle(id, x0 + w/2, y0 + h/2, w/2, h/2, 0, 1, 1, draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Polygon: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            if (w > 0.001f && h > 0.001f) {
                float rot = 0.0f; // All polygons point up (no special rotation for triangles)
                engine_.upsertPolygon(id, x0 + w/2, y0 + h/2, w/2, h/2, rot, 1, 1, static_cast<std::uint32_t>(draft_.sides), draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            }
            break;
        }
        case EntityKind::Polyline: {
            if (draft_.points.size() < 2) break;
            std::uint32_t offset = static_cast<std::uint32_t>(entityManager_.points.size());
            for (const auto& p : draft_.points) {
                entityManager_.points.push_back({p.x, p.y});
            }
            engine_.upsertPolyline(id, offset, static_cast<std::uint32_t>(draft_.points.size()), draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Arrow: {
            engine_.upsertArrow(id, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY, draft_.head, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA, draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Text: break;
    }

    // If we just committed a polyline, the phantom entity points generated during draft
    // are now garbage (the new entity has its own fresh points).
    // We must compact to avoid leaking thousands of points in the active session.
    if (static_cast<EntityKind>(draft_.kind) == EntityKind::Polyline) {
        engine_.compactPolylinePoints();
    }

    // Auto-select the newly created entity
    engine_.setSelection(&id, 1, engine::protocol::SelectionMode::Replace);

    // Apply ByLayer inheritance if requested
    if (draft_.flags & static_cast<std::uint32_t>(DraftFlags::FillByLayer)) {
        engine_.clearEntityStyleOverride(&id, 1, engine::protocol::StyleTarget::Fill);
    }
    if (draft_.flags & static_cast<std::uint32_t>(DraftFlags::StrokeByLayer)) {
        engine_.clearEntityStyleOverride(&id, 1, engine::protocol::StyleTarget::Stroke);
    }

    draft_.active = false;
    draft_.points.clear();
    engine_.state().renderDirty = true;
    return id;
}

void InteractionSession::cancelDraft() {
    if (!draft_.active) return;

    removePhantomEntity();

    // If we cancelled a polyline, the phantom points are garbage.
    if (static_cast<EntityKind>(draft_.kind) == EntityKind::Polyline) {
        engine_.compactPolylinePoints();
    }

    draft_.active = false;
    draft_.points.clear();
    engine_.state().renderDirty = true;
}

// ============================================================================
// Phantom Entity Helpers
// ============================================================================

void InteractionSession::upsertPhantomEntity() {
    if (!draft_.active) return;

    const std::uint32_t phantomId = DRAFT_ENTITY_ID;

    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Rect: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            // Always create, even if small (will be filtered at commit)
            entityManager_.upsertRect(phantomId, x0, y0, std::max(w, 0.1f), std::max(h, 0.1f),
                draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA,
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Line: {
            entityManager_.upsertLine(phantomId, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY,
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Circle: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            entityManager_.upsertCircle(phantomId, x0 + w/2, y0 + h/2, std::max(w/2, 0.1f), std::max(h/2, 0.1f), 0, 1, 1,
                draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA,
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Polygon: {
            float x0 = std::min(draft_.startX, draft_.currentX);
            float y0 = std::min(draft_.startY, draft_.currentY);
            float w = std::abs(draft_.currentX - draft_.startX);
            float h = std::abs(draft_.currentY - draft_.startY);
            float rot = 0.0f; // All polygons point up (no special rotation for triangles)
            entityManager_.upsertPolygon(phantomId, x0 + w/2, y0 + h/2, std::max(w/2, 0.1f), std::max(h/2, 0.1f), rot, 1, 1,
                static_cast<std::uint32_t>(draft_.sides),
                draft_.fillR, draft_.fillG, draft_.fillB, draft_.fillA,
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Polyline: {
            // For polyline, we need to handle the points specially
            // First, find and remove any existing phantom polyline points
            auto it = entityManager_.entities.find(phantomId);
            if (it != entityManager_.entities.end() && it->second.kind == EntityKind::Polyline) {
                // Remove old polyline - points will be orphaned but that's ok for phantom
            }

            // Calculate how many points we have (draft points + current cursor)
            size_t totalPoints = draft_.points.size() + 1; // +1 for current position
            if (totalPoints < 2) {
                totalPoints = 2; // Need at least 2 for a valid polyline
            }

            // Use a reserved area at the end of points for phantom
            // This is a simplification - in production you'd want proper point management
            std::uint32_t offset = static_cast<std::uint32_t>(entityManager_.points.size());
            for (const auto& p : draft_.points) {
                entityManager_.points.push_back({p.x, p.y});
            }
            // Add current cursor position
            entityManager_.points.push_back({draft_.currentX, draft_.currentY});

            entityManager_.upsertPolyline(phantomId, offset, static_cast<std::uint32_t>(totalPoints),
                draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Arrow: {
            entityManager_.upsertArrow(phantomId, draft_.startX, draft_.startY, draft_.currentX, draft_.currentY,
                draft_.head, draft_.strokeR, draft_.strokeG, draft_.strokeB, draft_.strokeA,
                draft_.strokeEnabled, draft_.strokeWidthPx);
            break;
        }
        case EntityKind::Text: break;
    }

    // Set up style overrides for phantom entity so it renders with correct colors
    // (not layer defaults). This matches how committed entities work via initShapeStyleOverrides.
    const EntityKind kind = static_cast<EntityKind>(draft_.kind);
    const bool hasFill = (kind == EntityKind::Rect || kind == EntityKind::Circle || kind == EntityKind::Polygon);
    const bool hasStroke = (kind != EntityKind::Text);

    if (hasFill || hasStroke) {
        EntityStyleOverrides& overrides = entityManager_.ensureEntityStyleOverrides(phantomId);
        overrides.colorMask = 0;
        overrides.enabledMask = 0;

        if (hasFill) {
            const std::uint8_t fillBit = EntityManager::styleTargetMask(StyleTarget::Fill);
            if (!(draft_.flags & static_cast<std::uint32_t>(DraftFlags::FillByLayer))) {
                overrides.colorMask |= fillBit;
            }
            overrides.enabledMask |= fillBit;
            overrides.fillEnabled = draft_.fillA > 0.5f ? 1.0f : 0.0f;
        }
        if (hasStroke) {
            const std::uint8_t strokeBit = EntityManager::styleTargetMask(StyleTarget::Stroke);
            if (!(draft_.flags & static_cast<std::uint32_t>(DraftFlags::StrokeByLayer))) {
                overrides.colorMask |= strokeBit;
            }
            overrides.enabledMask |= strokeBit;
        }
    }

    // Move phantom to end of draw order so it renders on top of all other entities
    auto& drawOrder = entityManager_.drawOrderIds;
    auto it = std::find(drawOrder.begin(), drawOrder.end(), phantomId);
    if (it != drawOrder.end()) {
        drawOrder.erase(it);
        drawOrder.push_back(phantomId);
    }
}

void InteractionSession::removePhantomEntity() {
    const std::uint32_t phantomId = DRAFT_ENTITY_ID;

    // Simply delete the phantom entity from the entity manager
    entityManager_.deleteEntity(phantomId);

    // Trigger a full rebuild since we removed an entity
    engine_.state().renderDirty = true;
}

DraftDimensions InteractionSession::getDraftDimensions() const {
    DraftDimensions dims{};
    dims.active = draft_.active;
    dims.kind = draft_.kind;

    if (!draft_.active) {
        return dims;
    }

    // Calculate bounding box based on entity kind
    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Rect:
        case EntityKind::Circle:
        case EntityKind::Polygon: {
            dims.minX = std::min(draft_.startX, draft_.currentX);
            dims.minY = std::min(draft_.startY, draft_.currentY);
            dims.maxX = std::max(draft_.startX, draft_.currentX);
            dims.maxY = std::max(draft_.startY, draft_.currentY);
            break;
        }
        case EntityKind::Line:
        case EntityKind::Arrow: {
            dims.minX = std::min(draft_.startX, draft_.currentX);
            dims.minY = std::min(draft_.startY, draft_.currentY);
            dims.maxX = std::max(draft_.startX, draft_.currentX);
            dims.maxY = std::max(draft_.startY, draft_.currentY);
            break;
        }
        case EntityKind::Polyline: {
            if (draft_.points.empty()) {
                dims.minX = dims.minY = dims.maxX = dims.maxY = 0;
            } else {
                dims.minX = dims.maxX = draft_.points[0].x;
                dims.minY = dims.maxY = draft_.points[0].y;
                for (const auto& p : draft_.points) {
                    dims.minX = std::min(dims.minX, p.x);
                    dims.minY = std::min(dims.minY, p.y);
                    dims.maxX = std::max(dims.maxX, p.x);
                    dims.maxY = std::max(dims.maxY, p.y);
                }
                // Include current cursor position
                dims.minX = std::min(dims.minX, draft_.currentX);
                dims.minY = std::min(dims.minY, draft_.currentY);
                dims.maxX = std::max(dims.maxX, draft_.currentX);
                dims.maxY = std::max(dims.maxY, draft_.currentY);
            }
            break;
        }
        default:
            break;
    }

    dims.width = dims.maxX - dims.minX;
    dims.height = dims.maxY - dims.minY;
    dims.centerX = (dims.minX + dims.maxX) / 2.0f;
    dims.centerY = (dims.minY + dims.maxY) / 2.0f;

    constexpr float kRadToDeg = 57.29577951308232f;
    const auto segmentLength = [](float ax, float ay, float bx, float by) {
        const float dx = bx - ax;
        const float dy = by - ay;
        return std::sqrt(dx * dx + dy * dy);
    };
    const auto segmentAngleDeg = [&](float ax, float ay, float bx, float by) {
        const float dx = bx - ax;
        const float dy = by - ay;
        if (std::abs(dx) <= 1e-6f && std::abs(dy) <= 1e-6f) return 0.0f;
        return std::atan2(dy, dx) * kRadToDeg;
    };

    switch (static_cast<EntityKind>(draft_.kind)) {
        case EntityKind::Line:
        case EntityKind::Arrow: {
            const float len = segmentLength(draft_.startX, draft_.startY, draft_.currentX, draft_.currentY);
            dims.length = len;
            dims.segmentLength = len;
            dims.angleDeg = segmentAngleDeg(draft_.startX, draft_.startY, draft_.currentX, draft_.currentY);
            break;
        }
        case EntityKind::Polyline: {
            float total = 0.0f;
            if (draft_.points.size() >= 2) {
                for (std::size_t i = 1; i < draft_.points.size(); ++i) {
                    const Point2& a = draft_.points[i - 1];
                    const Point2& b = draft_.points[i];
                    total += segmentLength(a.x, a.y, b.x, b.y);
                }
            }
            if (!draft_.points.empty()) {
                const Point2& anchor = draft_.points.back();
                const float segLen = segmentLength(anchor.x, anchor.y, draft_.currentX, draft_.currentY);
                dims.segmentLength = segLen;
                dims.angleDeg = segmentAngleDeg(anchor.x, anchor.y, draft_.currentX, draft_.currentY);
                if (segLen > 1e-6f) {
                    total += segLen;
                }
            }
            dims.length = total;
            break;
        }
        case EntityKind::Circle:
        case EntityKind::Polygon: {
            const float r = std::min(std::abs(dims.width), std::abs(dims.height)) * 0.5f;
            dims.radius = r;
            dims.diameter = r * 2.0f;
            dims.length = std::sqrt(dims.width * dims.width + dims.height * dims.height);
            dims.angleDeg = segmentAngleDeg(draft_.startX, draft_.startY, draft_.currentX, draft_.currentY);
            break;
        }
        case EntityKind::Rect:
        default: {
            dims.length = std::sqrt(dims.width * dims.width + dims.height * dims.height);
            dims.angleDeg = segmentAngleDeg(draft_.startX, draft_.startY, draft_.currentX, draft_.currentY);
            break;
        }
    }

    return dims;
}
