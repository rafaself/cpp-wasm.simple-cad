#include "engine/command/command_dispatch.h"
#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/text/text_style_contract.h"
#include "engine/core/logging.h"
#include <cstring>

#ifndef ENGINE_FEATURE_POLYLINE
#define ENGINE_FEATURE_POLYLINE 1
#endif

#ifndef ENGINE_FEATURE_CIRCLE
#define ENGINE_FEATURE_CIRCLE 1
#endif

#ifndef ENGINE_FEATURE_POLYGON
#define ENGINE_FEATURE_POLYGON 1
#endif

#ifndef ENGINE_FEATURE_DRAFT
#define ENGINE_FEATURE_DRAFT 1
#endif

#ifndef ENGINE_FEATURE_TEXT_EDITING
#define ENGINE_FEATURE_TEXT_EDITING 1
#endif

namespace engine {

EngineError dispatchCommand(
    CadEngine* self,
    std::uint32_t op,
    std::uint32_t id,
    const std::uint8_t* payload,
    std::uint32_t payloadByteCount
) {
    switch (op) {
        case static_cast<std::uint32_t>(CommandOp::ClearAll): {
            self->markLayerChange();
            self->markDrawOrderChange();
            self->markSelectionChange();
            for (const auto& kv : self->state().entityManager_.entities) {
                self->markEntityChange(kv.first);
            }
            self->clearWorld();
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteEntity): {
            self->deleteEntity(id);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetViewScale): {
            if (payloadByteCount != sizeof(ViewScalePayload)) return EngineError::InvalidPayloadSize;
            ViewScalePayload p;
            std::memcpy(&p, payload, sizeof(ViewScalePayload));
            const float s = (p.scale > 1e-6f && std::isfinite(p.scale)) ? p.scale : 1.0f;
            self->state().viewScale = s;
            self->state().viewX = p.x;
            self->state().viewY = p.y;
            self->state().viewWidth = p.width;
            self->state().viewHeight = p.height;
            self->state().renderDirty = true;
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetDrawOrder): {
            if (payloadByteCount < sizeof(DrawOrderPayloadHeader)) return EngineError::InvalidPayloadSize;
            self->markDrawOrderChange();
            DrawOrderPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(DrawOrderPayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(DrawOrderPayloadHeader) + static_cast<std::size_t>(count) * 4;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            self->state().entityManager_.drawOrderIds.clear();
            self->state().entityManager_.drawOrderIds.reserve(count);
            std::size_t o = sizeof(DrawOrderPayloadHeader);
            for (std::uint32_t i = 0; i < count; i++) {
                std::uint32_t sid;
                std::memcpy(&sid, payload + o, sizeof(std::uint32_t));
                o += sizeof(std::uint32_t);
                self->state().entityManager_.drawOrderIds.push_back(sid);
            }
            self->state().renderDirty = true;
            self->state().pickSystem_.setDrawOrder(self->state().entityManager_.drawOrderIds);
            if (!self->state().selectionManager_.isEmpty()) self->state().selectionManager_.rebuildOrder(self->state().entityManager_.drawOrderIds);
            self->recordOrderChanged();
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertRect): {
            if (payloadByteCount != sizeof(RectPayload)) return EngineError::InvalidPayloadSize;
            RectPayload p;
            std::memcpy(&p, payload, sizeof(RectPayload));
            if (!std::isfinite(p.elevationZ)) return EngineError::InvalidPayloadSize;
            self->upsertRect(id, p.x, p.y, p.w, p.h, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx, p.elevationZ);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertLine): {
            if (payloadByteCount != sizeof(LinePayload)) return EngineError::InvalidPayloadSize;
            LinePayload p;
            std::memcpy(&p, payload, sizeof(LinePayload));
            if (!std::isfinite(p.elevationZ)) return EngineError::InvalidPayloadSize;
            self->upsertLine(id, p.x0, p.y0, p.x1, p.y1, p.r, p.g, p.b, p.a, p.enabled, p.strokeWidthPx, p.elevationZ);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertPolyline): {
#if ENGINE_FEATURE_POLYLINE
            if (payloadByteCount < sizeof(PolylinePayloadHeader)) return EngineError::InvalidPayloadSize;
            PolylinePayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(PolylinePayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(PolylinePayloadHeader) + static_cast<std::size_t>(count) * 8;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            if (!std::isfinite(hdr.elevationZ)) return EngineError::InvalidPayloadSize;
            if (count < 2) {
                self->deleteEntity(id);
                break;
            }

            const std::uint32_t offset = static_cast<std::uint32_t>(self->state().entityManager_.points.size());
            self->state().entityManager_.points.reserve(self->state().entityManager_.points.size() + count);
            std::size_t ppos = sizeof(PolylinePayloadHeader);
            for (std::uint32_t j = 0; j < count; j++) {
                Point2 pt;
                std::memcpy(&pt, payload + ppos, sizeof(Point2));
                ppos += sizeof(Point2);
                self->state().entityManager_.points.push_back(pt);
            }
            self->upsertPolyline(id, offset, count, hdr.r, hdr.g, hdr.b, hdr.a, hdr.enabled, hdr.strokeWidthPx, hdr.elevationZ);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertCircle): {
#if ENGINE_FEATURE_CIRCLE
            if (payloadByteCount != sizeof(CirclePayload)) return EngineError::InvalidPayloadSize;
            CirclePayload p;
            std::memcpy(&p, payload, sizeof(CirclePayload));
            if (!std::isfinite(p.elevationZ)) return EngineError::InvalidPayloadSize;
            self->upsertCircle(id, p.cx, p.cy, p.rx, p.ry, p.rot, p.sx, p.sy, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx, p.elevationZ);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertPolygon): {
#if ENGINE_FEATURE_POLYGON
            if (payloadByteCount != sizeof(PolygonPayload)) return EngineError::InvalidPayloadSize;
            PolygonPayload p;
            std::memcpy(&p, payload, sizeof(PolygonPayload));
            if (!std::isfinite(p.elevationZ)) return EngineError::InvalidPayloadSize;
            self->upsertPolygon(id, p.cx, p.cy, p.rx, p.ry, p.rot, p.sx, p.sy, p.sides, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx, p.elevationZ);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertArrow): {
            if (payloadByteCount != sizeof(ArrowPayload)) return EngineError::InvalidPayloadSize;
            ArrowPayload p;
            std::memcpy(&p, payload, sizeof(ArrowPayload));
            if (!std::isfinite(p.elevationZ)) return EngineError::InvalidPayloadSize;
            self->upsertArrow(id, p.ax, p.ay, p.bx, p.by, p.head, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx, p.elevationZ);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetLayerStyle): {
            if (payloadByteCount != sizeof(LayerStylePayload)) return EngineError::InvalidPayloadSize;
            LayerStylePayload p;
            std::memcpy(&p, payload, sizeof(LayerStylePayload));
            self->setLayerStyle(id, static_cast<engine::protocol::StyleTarget>(p.target), p.colorRGBA);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetLayerStyleEnabled): {
            if (payloadByteCount != sizeof(LayerStyleEnabledPayload)) return EngineError::InvalidPayloadSize;
            LayerStyleEnabledPayload p;
            std::memcpy(&p, payload, sizeof(LayerStyleEnabledPayload));
            self->setLayerStyleEnabled(id, static_cast<engine::protocol::StyleTarget>(p.target), p.enabled != 0);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetEntityStyleOverride): {
            if (payloadByteCount < sizeof(EntityStylePayloadHeader)) return EngineError::InvalidPayloadSize;
            EntityStylePayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(EntityStylePayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(EntityStylePayloadHeader) + static_cast<std::size_t>(count) * 4;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            const auto* ids = reinterpret_cast<const std::uint32_t*>(payload + sizeof(EntityStylePayloadHeader));
            self->setEntityStyleOverride(ids, count, static_cast<engine::protocol::StyleTarget>(hdr.target), hdr.colorRGBA);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::ClearEntityStyleOverride): {
            if (payloadByteCount < sizeof(EntityStyleClearPayloadHeader)) return EngineError::InvalidPayloadSize;
            EntityStyleClearPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(EntityStyleClearPayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(EntityStyleClearPayloadHeader) + static_cast<std::size_t>(count) * 4;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            const auto* ids = reinterpret_cast<const std::uint32_t*>(payload + sizeof(EntityStyleClearPayloadHeader));
            self->clearEntityStyleOverride(ids, count, static_cast<engine::protocol::StyleTarget>(hdr.target));
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetEntityStyleEnabled): {
            if (payloadByteCount < sizeof(EntityStyleEnabledPayloadHeader)) return EngineError::InvalidPayloadSize;
            EntityStyleEnabledPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(EntityStyleEnabledPayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(EntityStyleEnabledPayloadHeader) + static_cast<std::size_t>(count) * 4;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            const auto* ids = reinterpret_cast<const std::uint32_t*>(payload + sizeof(EntityStyleEnabledPayloadHeader));
            self->setEntityStyleEnabled(ids, count, static_cast<engine::protocol::StyleTarget>(hdr.target), hdr.enabled != 0);
            break;
        }
        // =======================================================================
        // Text Commands
        // =======================================================================
        case static_cast<std::uint32_t>(CommandOp::UpsertText): {
            if (payloadByteCount < sizeof(TextPayloadHeader)) return EngineError::InvalidPayloadSize;
            
            TextPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(TextPayloadHeader));
            
            const std::size_t runsSize = static_cast<std::size_t>(hdr.runCount) * sizeof(TextRunPayload);
            const std::size_t expected = sizeof(TextPayloadHeader) + runsSize + hdr.contentLength + sizeof(float);
            if (payloadByteCount != expected) return EngineError::InvalidPayloadSize;
            
            const TextRunPayload* runs = reinterpret_cast<const TextRunPayload*>(payload + sizeof(TextPayloadHeader));
            const char* content = reinterpret_cast<const char*>(payload + sizeof(TextPayloadHeader) + runsSize);
            float elevationZ = 0.0f;
            std::memcpy(&elevationZ, payload + sizeof(TextPayloadHeader) + runsSize + hdr.contentLength, sizeof(float));
            if (!std::isfinite(elevationZ)) return EngineError::InvalidPayloadSize;
            
            if (!self->upsertText(id, hdr, runs, hdr.runCount, content, hdr.contentLength)) {
                return EngineError::InvalidOperation;
            }
            if (TextRec* rec = self->state().textSystem_.store.getTextMutable(id)) {
                rec->elevationZ = elevationZ;
            }
            ENGINE_LOG_DEBUG("[DEBUG] UpsertText: successfully stored text id=%u", id);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteText): {
            if (!self->deleteText(id)) {
                // Not an error if text doesn't exist - idempotent delete
            }
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextCaret): {
#if ENGINE_FEATURE_TEXT_EDITING
            if (payloadByteCount != sizeof(TextCaretPayload)) return EngineError::InvalidPayloadSize;
            TextCaretPayload p;
            std::memcpy(&p, payload, sizeof(TextCaretPayload));
            self->setTextCaret(p.textId, p.caretIndex);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextSelection): {
#if ENGINE_FEATURE_TEXT_EDITING
            if (payloadByteCount != sizeof(TextSelectionPayload)) return EngineError::InvalidPayloadSize;
            TextSelectionPayload p;
            std::memcpy(&p, payload, sizeof(TextSelectionPayload));
            self->setTextSelection(p.textId, p.selectionStart, p.selectionEnd);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::InsertTextContent): {
#if ENGINE_FEATURE_TEXT_EDITING
            if (payloadByteCount < sizeof(TextInsertPayloadHeader)) return EngineError::InvalidPayloadSize;
            
            TextInsertPayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(TextInsertPayloadHeader));
            
            const std::size_t expected = sizeof(TextInsertPayloadHeader) + hdr.byteLength;
            if (payloadByteCount != expected) return EngineError::InvalidPayloadSize;
            
            const char* content = reinterpret_cast<const char*>(payload + sizeof(TextInsertPayloadHeader));
            if (!self->insertTextContent(hdr.textId, hdr.insertIndex, content, hdr.byteLength)) {
                return EngineError::InvalidOperation;
            }
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteTextContent): {
#if ENGINE_FEATURE_TEXT_EDITING
            if (payloadByteCount != sizeof(TextDeletePayload)) return EngineError::InvalidPayloadSize;
            TextDeletePayload p;
            std::memcpy(&p, payload, sizeof(TextDeletePayload));
            if (!self->deleteTextContent(p.textId, p.startIndex, p.endIndex)) {
                return EngineError::InvalidOperation;
            }
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::ReplaceTextContent): {
#if ENGINE_FEATURE_TEXT_EDITING
            if (payloadByteCount < sizeof(TextReplacePayloadHeader)) return EngineError::InvalidPayloadSize;

            TextReplacePayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(TextReplacePayloadHeader));

            const std::size_t expected = sizeof(TextReplacePayloadHeader) + hdr.byteLength;
            if (payloadByteCount != expected) return EngineError::InvalidPayloadSize;

            const char* content = reinterpret_cast<const char*>(payload + sizeof(TextReplacePayloadHeader));
            if (!self->replaceTextContent(hdr.textId, hdr.startIndex, hdr.endIndex, content, hdr.byteLength)) {
                return EngineError::InvalidOperation;
            }
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::ApplyTextStyle): {
#if ENGINE_FEATURE_TEXT_EDITING
            using engine::text::ApplyTextStylePayload;
            if (payloadByteCount < engine::text::applyTextStyleHeaderBytes) {
                return EngineError::InvalidPayloadSize;
            }
            ApplyTextStylePayload p;
            std::memcpy(&p, payload, engine::text::applyTextStyleHeaderBytes);
            const std::size_t expected = engine::text::applyTextStyleHeaderBytes + p.styleParamsLen;
            if (payloadByteCount != expected) {
                return EngineError::InvalidPayloadSize;
            }
            if (id != 0 && id != p.textId) {
                return EngineError::InvalidPayloadSize;
            }
            const std::uint8_t* params = payload + engine::text::applyTextStyleHeaderBytes;
            if (!self->applyTextStyle(p, params, p.styleParamsLen)) {
                return EngineError::InvalidOperation;
            }
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextAlign): {
            if (payloadByteCount != sizeof(TextAlignmentPayload)) return EngineError::InvalidPayloadSize;
            TextAlignmentPayload p;
            std::memcpy(&p, payload, sizeof(TextAlignmentPayload));
            if (!self->setTextAlign(p.textId, static_cast<TextAlign>(p.align))) {
                return EngineError::InvalidOperation;
            }
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::BeginDraft): {
#if ENGINE_FEATURE_DRAFT
            if (payloadByteCount != sizeof(BeginDraftPayload)) return EngineError::InvalidPayloadSize;
            BeginDraftPayload p;
            std::memcpy(&p, payload, sizeof(BeginDraftPayload));
            self->beginDraft(p);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::UpdateDraft): {
#if ENGINE_FEATURE_DRAFT
            if (payloadByteCount != sizeof(UpdateDraftPayload)) return EngineError::InvalidPayloadSize;
            UpdateDraftPayload p;
            std::memcpy(&p, payload, sizeof(UpdateDraftPayload));
            self->updateDraft(p.x, p.y, p.modifiers);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::AppendDraftPoint): {
#if ENGINE_FEATURE_DRAFT
            if (payloadByteCount != sizeof(UpdateDraftPayload)) return EngineError::InvalidPayloadSize;
            UpdateDraftPayload p;
            std::memcpy(&p, payload, sizeof(UpdateDraftPayload));
            self->appendDraftPoint(p.x, p.y, p.modifiers);
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::CommitDraft): {
#if ENGINE_FEATURE_DRAFT
            self->commitDraft();
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        case static_cast<std::uint32_t>(CommandOp::CancelDraft): {
#if ENGINE_FEATURE_DRAFT
            self->cancelDraft();
            break;
#else
            return EngineError::InvalidOperation;
#endif
        }
        default:
            if (self) {
                for (const auto& ext : self->state().domainExtensions_) {
                    if (!ext) continue;
                    const EngineError err = ext->handleCommand(*self, op, id, payload, payloadByteCount);
                    if (err != EngineError::UnknownCommand) {
                        return err;
                    }
                }
                for (const auto* plugin : self->state().pluginExtensions_) {
                    if (!plugin || !plugin->handle_command) continue;
                    const std::uint32_t code = plugin->handle_command(self, op, id, payload, payloadByteCount);
                    if (code != static_cast<std::uint32_t>(EngineError::UnknownCommand)) {
                        return static_cast<EngineError>(code);
                    }
                }
            }
            return EngineError::UnknownCommand;
    }
    return EngineError::Ok;
}

} // namespace engine
