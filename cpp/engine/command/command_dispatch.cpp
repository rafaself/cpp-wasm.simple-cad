#include "engine/command/command_dispatch.h"
#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"
#include "engine/text/text_style_contract.h"
#include <cstring>
#include <cstdio>

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
            for (const auto& kv : self->entityManager_.entities) {
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
            self->viewScale = s;
            self->viewX = p.x;
            self->viewY = p.y;
            self->viewWidth = p.width;
            self->viewHeight = p.height;
            self->renderDirty = true;
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
            self->entityManager_.drawOrderIds.clear();
            self->entityManager_.drawOrderIds.reserve(count);
            std::size_t o = sizeof(DrawOrderPayloadHeader);
            for (std::uint32_t i = 0; i < count; i++) {
                std::uint32_t sid;
                std::memcpy(&sid, payload + o, sizeof(std::uint32_t));
                o += sizeof(std::uint32_t);
                self->entityManager_.drawOrderIds.push_back(sid);
            }
            self->renderDirty = true;
            self->pickSystem_.setDrawOrder(self->entityManager_.drawOrderIds);
            if (!self->selectionManager_.isEmpty()) self->selectionManager_.rebuildOrder(self->entityManager_.drawOrderIds);
            self->recordOrderChanged();
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertRect): {
            if (payloadByteCount != sizeof(RectPayload)) return EngineError::InvalidPayloadSize;
            RectPayload p;
            std::memcpy(&p, payload, sizeof(RectPayload));
            self->upsertRect(id, p.x, p.y, p.w, p.h, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertLine): {
            if (payloadByteCount != sizeof(LinePayload)) return EngineError::InvalidPayloadSize;
            LinePayload p;
            std::memcpy(&p, payload, sizeof(LinePayload));
            self->upsertLine(id, p.x0, p.y0, p.x1, p.y1, p.r, p.g, p.b, p.a, p.enabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertPolyline): {
            if (payloadByteCount < sizeof(PolylinePayloadHeader)) return EngineError::InvalidPayloadSize;
            PolylinePayloadHeader hdr;
            std::memcpy(&hdr, payload, sizeof(PolylinePayloadHeader));
            const std::uint32_t count = hdr.count;
            const std::size_t expected = sizeof(PolylinePayloadHeader) + static_cast<std::size_t>(count) * 8;
            if (expected != payloadByteCount) return EngineError::InvalidPayloadSize;
            if (count < 2) {
                self->deleteEntity(id);
                break;
            }

            const std::uint32_t offset = static_cast<std::uint32_t>(self->entityManager_.points.size());
            self->entityManager_.points.reserve(self->entityManager_.points.size() + count);
            std::size_t ppos = sizeof(PolylinePayloadHeader);
            for (std::uint32_t j = 0; j < count; j++) {
                Point2 pt;
                std::memcpy(&pt, payload + ppos, sizeof(Point2));
                ppos += sizeof(Point2);
                self->entityManager_.points.push_back(pt);
            }
            self->upsertPolyline(id, offset, count, hdr.r, hdr.g, hdr.b, hdr.a, hdr.enabled, hdr.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertCircle): {
            if (payloadByteCount != sizeof(CirclePayload)) return EngineError::InvalidPayloadSize;
            CirclePayload p;
            std::memcpy(&p, payload, sizeof(CirclePayload));
            self->upsertCircle(id, p.cx, p.cy, p.rx, p.ry, p.rot, p.sx, p.sy, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertPolygon): {
            if (payloadByteCount != sizeof(PolygonPayload)) return EngineError::InvalidPayloadSize;
            PolygonPayload p;
            std::memcpy(&p, payload, sizeof(PolygonPayload));
            self->upsertPolygon(id, p.cx, p.cy, p.rx, p.ry, p.rot, p.sx, p.sy, p.sides, p.fillR, p.fillG, p.fillB, p.fillA, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpsertArrow): {
            if (payloadByteCount != sizeof(ArrowPayload)) return EngineError::InvalidPayloadSize;
            ArrowPayload p;
            std::memcpy(&p, payload, sizeof(ArrowPayload));
            self->upsertArrow(id, p.ax, p.ay, p.bx, p.by, p.head, p.strokeR, p.strokeG, p.strokeB, p.strokeA, p.strokeEnabled, p.strokeWidthPx);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetLayerStyle): {
            if (payloadByteCount != sizeof(LayerStylePayload)) return EngineError::InvalidPayloadSize;
            LayerStylePayload p;
            std::memcpy(&p, payload, sizeof(LayerStylePayload));
            self->setLayerStyle(id, static_cast<CadEngine::StyleTarget>(p.target), p.colorRGBA);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetLayerStyleEnabled): {
            if (payloadByteCount != sizeof(LayerStyleEnabledPayload)) return EngineError::InvalidPayloadSize;
            LayerStyleEnabledPayload p;
            std::memcpy(&p, payload, sizeof(LayerStyleEnabledPayload));
            self->setLayerStyleEnabled(id, static_cast<CadEngine::StyleTarget>(p.target), p.enabled != 0);
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
            self->setEntityStyleOverride(ids, count, static_cast<CadEngine::StyleTarget>(hdr.target), hdr.colorRGBA);
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
            self->clearEntityStyleOverride(ids, count, static_cast<CadEngine::StyleTarget>(hdr.target));
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
            self->setEntityStyleEnabled(ids, count, static_cast<CadEngine::StyleTarget>(hdr.target), hdr.enabled != 0);
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
            const std::size_t expected = sizeof(TextPayloadHeader) + runsSize + hdr.contentLength;
            if (payloadByteCount != expected) return EngineError::InvalidPayloadSize;
            
            const TextRunPayload* runs = reinterpret_cast<const TextRunPayload*>(payload + sizeof(TextPayloadHeader));
            const char* content = reinterpret_cast<const char*>(payload + sizeof(TextPayloadHeader) + runsSize);
            
            if (!self->upsertText(id, hdr, runs, hdr.runCount, content, hdr.contentLength)) {
                return EngineError::InvalidOperation;
            }
            printf("[DEBUG] UpsertText: successfully stored text id=%u\n", id);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteText): {
            if (!self->deleteText(id)) {
                // Not an error if text doesn't exist - idempotent delete
            }
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextCaret): {
            if (payloadByteCount != sizeof(TextCaretPayload)) return EngineError::InvalidPayloadSize;
            TextCaretPayload p;
            std::memcpy(&p, payload, sizeof(TextCaretPayload));
            self->setTextCaret(p.textId, p.caretIndex);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::SetTextSelection): {
            if (payloadByteCount != sizeof(TextSelectionPayload)) return EngineError::InvalidPayloadSize;
            TextSelectionPayload p;
            std::memcpy(&p, payload, sizeof(TextSelectionPayload));
            self->setTextSelection(p.textId, p.selectionStart, p.selectionEnd);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::InsertTextContent): {
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
        }
        case static_cast<std::uint32_t>(CommandOp::DeleteTextContent): {
            if (payloadByteCount != sizeof(TextDeletePayload)) return EngineError::InvalidPayloadSize;
            TextDeletePayload p;
            std::memcpy(&p, payload, sizeof(TextDeletePayload));
            if (!self->deleteTextContent(p.textId, p.startIndex, p.endIndex)) {
                return EngineError::InvalidOperation;
            }
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::ReplaceTextContent): {
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
        }
        case static_cast<std::uint32_t>(CommandOp::ApplyTextStyle): {
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
            if (payloadByteCount != sizeof(BeginDraftPayload)) return EngineError::InvalidPayloadSize;
            BeginDraftPayload p;
            std::memcpy(&p, payload, sizeof(BeginDraftPayload));
            self->beginDraft(p);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::UpdateDraft): {
            if (payloadByteCount != sizeof(UpdateDraftPayload)) return EngineError::InvalidPayloadSize;
            UpdateDraftPayload p;
            std::memcpy(&p, payload, sizeof(UpdateDraftPayload));
            self->updateDraft(p.x, p.y, p.modifiers);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::AppendDraftPoint): {
            if (payloadByteCount != sizeof(UpdateDraftPayload)) return EngineError::InvalidPayloadSize;
            UpdateDraftPayload p;
            std::memcpy(&p, payload, sizeof(UpdateDraftPayload));
            self->appendDraftPoint(p.x, p.y, p.modifiers);
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::CommitDraft): {
            self->commitDraft();
            break;
        }
        case static_cast<std::uint32_t>(CommandOp::CancelDraft): {
            self->cancelDraft();
            break;
        }
        default:
            return EngineError::UnknownCommand;
    }
    return EngineError::Ok;
}

} // namespace engine

#include "engine/internal/engine_state_aliases_undef.h"
