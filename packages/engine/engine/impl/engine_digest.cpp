// engine_digest.cpp - Document digest computation for CadEngine
// This file provides the getDocumentDigest() implementation.
// Separated from main engine.cpp to reduce file size per SRP guidelines.

#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/core/string_utils.h"

using engine::kDigestOffset;
using engine::hashU32;
using engine::hashF32;
using engine::hashBytes;

engine::protocol::DocumentDigest CadEngine::getDocumentDigest() const noexcept {
    std::uint64_t h = kDigestOffset;

    h = hashU32(h, 0x45444F43u); // "CODE" marker
    h = hashU32(h, EngineProtocolInfo::kSnapshotVersion);

    const auto layers = state().entityManager_.layerStore.snapshot();
    h = hashU32(h, static_cast<std::uint32_t>(layers.size()));
    for (const auto& layer : layers) {
        h = hashU32(h, layer.id);
        h = hashU32(h, layer.order);
        h = hashU32(h, layer.flags);
        const std::string name = state().entityManager_.layerStore.getLayerName(layer.id);
        h = hashU32(h, static_cast<std::uint32_t>(name.size()));
        if (!name.empty()) {
            h = hashBytes(h, reinterpret_cast<const std::uint8_t*>(name.data()), name.size());
        }
        const LayerStyle style = state().entityManager_.layerStore.getLayerStyle(layer.id);
        h = hashF32(h, style.stroke.color.r);
        h = hashF32(h, style.stroke.color.g);
        h = hashF32(h, style.stroke.color.b);
        h = hashF32(h, style.stroke.color.a);
        h = hashF32(h, style.stroke.enabled);
        h = hashF32(h, style.fill.color.r);
        h = hashF32(h, style.fill.color.g);
        h = hashF32(h, style.fill.color.b);
        h = hashF32(h, style.fill.color.a);
        h = hashF32(h, style.fill.enabled);
        h = hashF32(h, style.textColor.color.r);
        h = hashF32(h, style.textColor.color.g);
        h = hashF32(h, style.textColor.color.b);
        h = hashF32(h, style.textColor.color.a);
        h = hashF32(h, style.textColor.enabled);
        h = hashF32(h, style.textBackground.color.r);
        h = hashF32(h, style.textBackground.color.g);
        h = hashF32(h, style.textBackground.color.b);
        h = hashF32(h, style.textBackground.color.a);
        h = hashF32(h, style.textBackground.enabled);
    }

    std::vector<std::uint32_t> ids;
    ids.reserve(state().entityManager_.entities.size());
    for (const auto& kv : state().entityManager_.entities) ids.push_back(kv.first);
    std::sort(ids.begin(), ids.end());

    h = hashU32(h, static_cast<std::uint32_t>(ids.size()));
    for (const std::uint32_t id : ids) {
        auto it = state().entityManager_.entities.find(id);
        if (it == state().entityManager_.entities.end()) continue;
        const EntityRef ref = it->second;

        h = hashU32(h, id);
        h = hashU32(h, static_cast<std::uint32_t>(ref.kind));
        h = hashU32(h, state().entityManager_.getEntityLayer(id));
        h = hashU32(h, state().entityManager_.getEntityFlags(id));

        switch (ref.kind) {
            case EntityKind::Rect: {
                const RectRec* r = state().entityManager_.getRect(id);
                if (!r) break;
                h = hashF32(h, r->x);
                h = hashF32(h, r->y);
                h = hashF32(h, r->w);
                h = hashF32(h, r->h);
                h = hashF32(h, r->elevationZ);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Line: {
                const LineRec* r = state().entityManager_.getLine(id);
                if (!r) break;
                h = hashF32(h, r->x0);
                h = hashF32(h, r->y0);
                h = hashF32(h, r->x1);
                h = hashF32(h, r->y1);
                h = hashF32(h, r->elevationZ);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->enabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Polyline: {
                const PolyRec* r = state().entityManager_.getPolyline(id);
                if (!r) break;
                h = hashU32(h, r->count);
                h = hashF32(h, r->elevationZ);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->enabled);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);

                const std::uint32_t offset = r->offset;
                const std::uint32_t count = r->count;
                const auto& points = state().entityManager_.points;
                for (std::uint32_t i = 0; i < count; ++i) {
                    const std::uint32_t idx = offset + i;
                    if (idx >= points.size()) break;
                    h = hashF32(h, points[idx].x);
                    h = hashF32(h, points[idx].y);
                }
                break;
            }
            case EntityKind::Circle: {
                const CircleRec* r = state().entityManager_.getCircle(id);
                if (!r) break;
                h = hashF32(h, r->cx);
                h = hashF32(h, r->cy);
                h = hashF32(h, r->rx);
                h = hashF32(h, r->ry);
                h = hashF32(h, r->elevationZ);
                h = hashF32(h, r->rot);
                h = hashF32(h, r->sx);
                h = hashF32(h, r->sy);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Polygon: {
                const PolygonRec* r = state().entityManager_.getPolygon(id);
                if (!r) break;
                h = hashF32(h, r->cx);
                h = hashF32(h, r->cy);
                h = hashF32(h, r->rx);
                h = hashF32(h, r->ry);
                h = hashF32(h, r->elevationZ);
                h = hashF32(h, r->rot);
                h = hashF32(h, r->sx);
                h = hashF32(h, r->sy);
                h = hashU32(h, r->sides);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Arrow: {
                const ArrowRec* r = state().entityManager_.getArrow(id);
                if (!r) break;
                h = hashF32(h, r->ax);
                h = hashF32(h, r->ay);
                h = hashF32(h, r->bx);
                h = hashF32(h, r->by);
                h = hashF32(h, r->elevationZ);
                h = hashF32(h, r->head);
                h = hashF32(h, r->sr);
                h = hashF32(h, r->sg);
                h = hashF32(h, r->sb);
                h = hashF32(h, r->sa);
                h = hashF32(h, r->strokeEnabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Text: {
                const TextRec* r = state().textSystem_.store.getText(id);
                if (!r) break;
                h = hashF32(h, r->x);
                h = hashF32(h, r->y);
                h = hashF32(h, r->elevationZ);
                h = hashF32(h, r->rotation);
                h = hashU32(h, static_cast<std::uint32_t>(r->boxMode));
                h = hashU32(h, static_cast<std::uint32_t>(r->align));
                h = hashF32(h, r->constraintWidth);
                h = hashF32(h, r->layoutWidth);
                h = hashF32(h, r->layoutHeight);
                h = hashF32(h, r->minX);
                h = hashF32(h, r->minY);
                h = hashF32(h, r->maxX);
                h = hashF32(h, r->maxY);

                const std::string_view content = state().textSystem_.store.getContent(id);
                h = hashU32(h, static_cast<std::uint32_t>(content.size()));
                if (!content.empty()) {
                    h = hashBytes(h, reinterpret_cast<const std::uint8_t*>(content.data()), content.size());
                }

                const auto& runs = state().textSystem_.store.getRuns(id);
                h = hashU32(h, static_cast<std::uint32_t>(runs.size()));
                for (const auto& run : runs) {
                    h = hashU32(h, run.startIndex);
                    h = hashU32(h, run.length);
                    h = hashU32(h, run.fontId);
                    h = hashF32(h, run.fontSize);
                    h = hashU32(h, run.colorRGBA);
                    h = hashU32(h, static_cast<std::uint32_t>(run.flags));
                }
                break;
            }
            default:
                break;
        }

        const EntityStyleOverrides* overrides = state().entityManager_.getEntityStyleOverrides(id);
        const std::uint8_t colorMask = overrides ? overrides->colorMask : 0;
        const std::uint8_t enabledMask = overrides ? overrides->enabledMask : 0;
        h = hashU32(h, static_cast<std::uint32_t>(colorMask));
        h = hashU32(h, static_cast<std::uint32_t>(enabledMask));
        const StyleColor textColor = overrides ? overrides->textColor : StyleColor{};
        const StyleColor textBackground = overrides ? overrides->textBackground : StyleColor{};
        const float fillEnabled = overrides ? overrides->fillEnabled : 0.0f;
        const float textBackgroundEnabled = overrides ? overrides->textBackgroundEnabled : 0.0f;
        h = hashF32(h, textColor.r);
        h = hashF32(h, textColor.g);
        h = hashF32(h, textColor.b);
        h = hashF32(h, textColor.a);
        h = hashF32(h, textBackground.r);
        h = hashF32(h, textBackground.g);
        h = hashF32(h, textBackground.b);
        h = hashF32(h, textBackground.a);
        h = hashF32(h, fillEnabled);
        h = hashF32(h, textBackgroundEnabled);
    }

    h = hashU32(h, static_cast<std::uint32_t>(state().entityManager_.drawOrderIds.size()));
    for (const std::uint32_t id : state().entityManager_.drawOrderIds) {
        h = hashU32(h, id);
    }

    h = hashU32(h, static_cast<std::uint32_t>(state().selectionManager_.getOrdered().size()));
    for (const std::uint32_t id : state().selectionManager_.getOrdered()) {
        h = hashU32(h, id);
    }

    h = hashU32(h, state().nextEntityId_);

    return engine::protocol::DocumentDigest{
        static_cast<std::uint32_t>(h & 0xFFFFFFFFu),
        static_cast<std::uint32_t>((h >> 32) & 0xFFFFFFFFu)
    };
}
