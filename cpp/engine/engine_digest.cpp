// engine_digest.cpp - Document digest computation for CadEngine
// This file provides the getDocumentDigest() implementation.
// Separated from main engine.cpp to reduce file size per SRP guidelines.

#include "engine/engine.h"
#include "engine/string_utils.h"

using engine::kDigestOffset;
using engine::hashU32;
using engine::hashF32;
using engine::hashBytes;

CadEngine::DocumentDigest CadEngine::getDocumentDigest() const noexcept {
    std::uint64_t h = kDigestOffset;

    h = hashU32(h, 0x45444F43u); // "CODE" marker
    h = hashU32(h, kSnapshotVersion);

    const auto layers = entityManager_.layerStore.snapshot();
    h = hashU32(h, static_cast<std::uint32_t>(layers.size()));
    for (const auto& layer : layers) {
        h = hashU32(h, layer.id);
        h = hashU32(h, layer.order);
        h = hashU32(h, layer.flags);
        const std::string name = entityManager_.layerStore.getLayerName(layer.id);
        h = hashU32(h, static_cast<std::uint32_t>(name.size()));
        if (!name.empty()) {
            h = hashBytes(h, reinterpret_cast<const std::uint8_t*>(name.data()), name.size());
        }
    }

    std::vector<std::uint32_t> ids;
    ids.reserve(entityManager_.entities.size());
    for (const auto& kv : entityManager_.entities) ids.push_back(kv.first);
    std::sort(ids.begin(), ids.end());

    h = hashU32(h, static_cast<std::uint32_t>(ids.size()));
    for (const std::uint32_t id : ids) {
        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;
        const EntityRef ref = it->second;

        h = hashU32(h, id);
        h = hashU32(h, static_cast<std::uint32_t>(ref.kind));
        h = hashU32(h, entityManager_.getEntityLayer(id));
        h = hashU32(h, entityManager_.getEntityFlags(id));

        switch (ref.kind) {
            case EntityKind::Rect: {
                const RectRec* r = entityManager_.getRect(id);
                if (!r) break;
                h = hashF32(h, r->x);
                h = hashF32(h, r->y);
                h = hashF32(h, r->w);
                h = hashF32(h, r->h);
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
                const LineRec* r = entityManager_.getLine(id);
                if (!r) break;
                h = hashF32(h, r->x0);
                h = hashF32(h, r->y0);
                h = hashF32(h, r->x1);
                h = hashF32(h, r->y1);
                h = hashF32(h, r->r);
                h = hashF32(h, r->g);
                h = hashF32(h, r->b);
                h = hashF32(h, r->a);
                h = hashF32(h, r->enabled);
                h = hashF32(h, r->strokeWidthPx);
                break;
            }
            case EntityKind::Polyline: {
                const PolyRec* r = entityManager_.getPolyline(id);
                if (!r) break;
                h = hashU32(h, r->count);
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
                const auto& points = entityManager_.points;
                for (std::uint32_t i = 0; i < count; ++i) {
                    const std::uint32_t idx = offset + i;
                    if (idx >= points.size()) break;
                    h = hashF32(h, points[idx].x);
                    h = hashF32(h, points[idx].y);
                }
                break;
            }
            case EntityKind::Circle: {
                const CircleRec* r = entityManager_.getCircle(id);
                if (!r) break;
                h = hashF32(h, r->cx);
                h = hashF32(h, r->cy);
                h = hashF32(h, r->rx);
                h = hashF32(h, r->ry);
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
                const PolygonRec* r = entityManager_.getPolygon(id);
                if (!r) break;
                h = hashF32(h, r->cx);
                h = hashF32(h, r->cy);
                h = hashF32(h, r->rx);
                h = hashF32(h, r->ry);
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
                const ArrowRec* r = entityManager_.getArrow(id);
                if (!r) break;
                h = hashF32(h, r->ax);
                h = hashF32(h, r->ay);
                h = hashF32(h, r->bx);
                h = hashF32(h, r->by);
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
                const TextRec* r = textSystem_.store.getText(id);
                if (!r) break;
                h = hashF32(h, r->x);
                h = hashF32(h, r->y);
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

                const std::string_view content = textSystem_.store.getContent(id);
                h = hashU32(h, static_cast<std::uint32_t>(content.size()));
                if (!content.empty()) {
                    h = hashBytes(h, reinterpret_cast<const std::uint8_t*>(content.data()), content.size());
                }

                const auto& runs = textSystem_.store.getRuns(id);
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
    }

    h = hashU32(h, static_cast<std::uint32_t>(entityManager_.drawOrderIds.size()));
    for (const std::uint32_t id : entityManager_.drawOrderIds) {
        h = hashU32(h, id);
    }

    h = hashU32(h, static_cast<std::uint32_t>(selectionManager_.getOrdered().size()));
    for (const std::uint32_t id : selectionManager_.getOrdered()) {
        h = hashU32(h, id);
    }

    h = hashU32(h, nextEntityId_);

    return DocumentDigest{
        static_cast<std::uint32_t>(h & 0xFFFFFFFFu),
        static_cast<std::uint32_t>((h >> 32) & 0xFFFFFFFFu)
    };
}
