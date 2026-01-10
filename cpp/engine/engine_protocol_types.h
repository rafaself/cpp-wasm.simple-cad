#pragma once

#include "engine/core/types.h"
#include "engine/protocol/protocol_types.h"
#include "engine/persistence/snapshot.h"
#include "engine/command/commands.h"
#include "engine/interaction/pick_system.h"
#include "engine/interaction/interaction_types.h"

#include <array>
#include <cstddef>
#include <cstdint>
#include <initializer_list>

/**
 * Protocol constants and ABI hash helper.
 * Keep this separate from CadEngine to avoid mixing protocol and core concerns.
 */
struct EngineProtocolInfo {
    // Protocol versions (must be non-zero; keep in sync with TS).
    static constexpr std::uint32_t kProtocolVersion = 4;      // Handshake schema version
    static constexpr std::uint32_t kCommandVersion = 3;       // Command buffer version (EWDC v3)
    static constexpr std::uint32_t kSnapshotVersion = snapshotVersionEsnp; // Snapshot format version
    static constexpr std::uint32_t kEventStreamVersion = 1;   // Event stream schema version (reserved)
    static constexpr std::uint32_t kFeatureFlags =
        static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_PROTOCOL)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_LAYERS_FLAGS)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_SELECTION_ORDER)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_SNAPSHOT_VNEXT)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_EVENT_STREAM)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_OVERLAY_QUERIES)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_INTERACTIVE_TRANSFORM)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_ENGINE_HISTORY)
        | static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_ENGINE_DOCUMENT_SOT);
    static constexpr std::uint32_t kAbiHashOffset = 2166136261u;
    static constexpr std::uint32_t kAbiHashPrime = 16777619u;

protected:
    static constexpr std::uint32_t hashU32(std::uint32_t h, std::uint32_t v) {
        return (h ^ v) * kAbiHashPrime;
    }

    template <std::size_t N>
    static constexpr std::uint32_t hashArray(std::uint32_t h, const std::array<std::uint32_t, N>& values) {
        for (std::size_t i = 0; i < N; ++i) {
            h = hashU32(h, values[i]);
        }
        return h;
    }

    static constexpr std::uint32_t hashEnum(std::uint32_t h, std::uint32_t tag, std::initializer_list<std::uint32_t> values) {
        h = hashU32(h, tag);
        h = hashU32(h, static_cast<std::uint32_t>(values.size()));
        for (auto v : values) {
            h = hashU32(h, v);
        }
        return h;
    }

    template <std::size_t N>
    static constexpr std::uint32_t hashEnum(std::uint32_t h, std::uint32_t tag, const std::array<std::uint32_t, N>& values) {
        h = hashU32(h, tag);
        h = hashU32(h, static_cast<std::uint32_t>(N));
        return hashArray(h, values);
    }

    static constexpr std::uint32_t hashStruct(std::uint32_t h, std::uint32_t tag, std::uint32_t size, std::initializer_list<std::uint32_t> offsets) {
        h = hashU32(h, tag);
        h = hashU32(h, size);
        h = hashU32(h, static_cast<std::uint32_t>(offsets.size()));
        for (auto v : offsets) {
            h = hashU32(h, v);
        }
        return h;
    }

    template <std::size_t N>
    static constexpr std::uint32_t hashStruct(std::uint32_t h, std::uint32_t tag, std::uint32_t size, const std::array<std::uint32_t, N>& offsets) {
        h = hashU32(h, tag);
        h = hashU32(h, size);
        h = hashU32(h, static_cast<std::uint32_t>(N));
        return hashArray(h, offsets);
    }

    static constexpr std::uint32_t computeAbiHash() {
        std::uint32_t h = kAbiHashOffset;

        h = hashEnum(h, 0xE0000001u, {
            static_cast<std::uint32_t>(CommandOp::ClearAll),
            static_cast<std::uint32_t>(CommandOp::UpsertRect),
            static_cast<std::uint32_t>(CommandOp::UpsertLine),
            static_cast<std::uint32_t>(CommandOp::UpsertPolyline),
            static_cast<std::uint32_t>(CommandOp::DeleteEntity),
            static_cast<std::uint32_t>(CommandOp::SetDrawOrder),
            static_cast<std::uint32_t>(CommandOp::SetViewScale),
            static_cast<std::uint32_t>(CommandOp::UpsertCircle),
            static_cast<std::uint32_t>(CommandOp::UpsertPolygon),
            static_cast<std::uint32_t>(CommandOp::UpsertArrow),
            static_cast<std::uint32_t>(CommandOp::UpsertText),
            static_cast<std::uint32_t>(CommandOp::DeleteText),
            static_cast<std::uint32_t>(CommandOp::SetTextCaret),
            static_cast<std::uint32_t>(CommandOp::SetTextSelection),
            static_cast<std::uint32_t>(CommandOp::InsertTextContent),
            static_cast<std::uint32_t>(CommandOp::DeleteTextContent),
            static_cast<std::uint32_t>(CommandOp::ReplaceTextContent),
            static_cast<std::uint32_t>(CommandOp::ApplyTextStyle),
            static_cast<std::uint32_t>(CommandOp::SetTextAlign),
            static_cast<std::uint32_t>(CommandOp::SetLayerStyle),
            static_cast<std::uint32_t>(CommandOp::SetLayerStyleEnabled),
            static_cast<std::uint32_t>(CommandOp::SetEntityStyleOverride),
            static_cast<std::uint32_t>(CommandOp::ClearEntityStyleOverride),
            static_cast<std::uint32_t>(CommandOp::SetEntityStyleEnabled),
        });

        h = hashEnum(h, 0xE0000002u, {
            static_cast<std::uint32_t>(PickSubTarget::None),
            static_cast<std::uint32_t>(PickSubTarget::Body),
            static_cast<std::uint32_t>(PickSubTarget::Edge),
            static_cast<std::uint32_t>(PickSubTarget::Vertex),
            static_cast<std::uint32_t>(PickSubTarget::ResizeHandle),
            static_cast<std::uint32_t>(PickSubTarget::RotateHandle),
            static_cast<std::uint32_t>(PickSubTarget::TextBody),
            static_cast<std::uint32_t>(PickSubTarget::TextCaret),
        });

        h = hashEnum(h, 0xE0000003u, {
            static_cast<std::uint32_t>(PickEntityKind::Unknown),
            static_cast<std::uint32_t>(PickEntityKind::Rect),
            static_cast<std::uint32_t>(PickEntityKind::Circle),
            static_cast<std::uint32_t>(PickEntityKind::Line),
            static_cast<std::uint32_t>(PickEntityKind::Polyline),
            static_cast<std::uint32_t>(PickEntityKind::Polygon),
            static_cast<std::uint32_t>(PickEntityKind::Arrow),
            static_cast<std::uint32_t>(PickEntityKind::Text),
        });

        h = hashEnum(h, 0xE0000004u, {
            static_cast<std::uint32_t>(TransformMode::Move),
            static_cast<std::uint32_t>(TransformMode::VertexDrag),
            static_cast<std::uint32_t>(TransformMode::EdgeDrag),
            static_cast<std::uint32_t>(TransformMode::Resize),
        });

        h = hashEnum(h, 0xE0000005u, {
            static_cast<std::uint32_t>(TransformOpCode::MOVE),
            static_cast<std::uint32_t>(TransformOpCode::VERTEX_SET),
            static_cast<std::uint32_t>(TransformOpCode::RESIZE),
        });

        h = hashEnum(h, 0xE0000006u, {
            static_cast<std::uint32_t>(engine::protocol::EngineCapability::HAS_QUERY_MARQUEE),
            static_cast<std::uint32_t>(engine::protocol::EngineCapability::HAS_RESIZE_HANDLES),
            static_cast<std::uint32_t>(engine::protocol::EngineCapability::HAS_TRANSFORM_RESIZE),
        });

        h = hashEnum(h, 0xE0000007u, {
            static_cast<std::uint32_t>(TextStyleFlags::None),
            static_cast<std::uint32_t>(TextStyleFlags::Bold),
            static_cast<std::uint32_t>(TextStyleFlags::Italic),
            static_cast<std::uint32_t>(TextStyleFlags::Underline),
            static_cast<std::uint32_t>(TextStyleFlags::Strike),
        });

        h = hashEnum(h, 0xE0000008u, {
            static_cast<std::uint32_t>(TextAlign::Left),
            static_cast<std::uint32_t>(TextAlign::Center),
            static_cast<std::uint32_t>(TextAlign::Right),
        });

        h = hashEnum(h, 0xE0000009u, {
            static_cast<std::uint32_t>(TextBoxMode::AutoWidth),
            static_cast<std::uint32_t>(TextBoxMode::FixedWidth),
        });

        h = hashEnum(h, 0xE000000Au, {
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_PROTOCOL),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_LAYERS_FLAGS),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_SELECTION_ORDER),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_SNAPSHOT_VNEXT),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_EVENT_STREAM),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_OVERLAY_QUERIES),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_INTERACTIVE_TRANSFORM),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_ENGINE_HISTORY),
            static_cast<std::uint32_t>(engine::protocol::EngineFeatureFlags::FEATURE_ENGINE_DOCUMENT_SOT),
        });

        h = hashEnum(h, 0xE000000Bu, {
            static_cast<std::uint32_t>(LayerFlags::Visible),
            static_cast<std::uint32_t>(LayerFlags::Locked),
        });

        h = hashEnum(h, 0xE000000Cu, {
            static_cast<std::uint32_t>(EntityFlags::Visible),
            static_cast<std::uint32_t>(EntityFlags::Locked),
        });

        h = hashEnum(h, 0xE000000Du, {
            static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Name),
            static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Visible),
            static_cast<std::uint32_t>(engine::protocol::LayerPropMask::Locked),
        });

        h = hashEnum(h, 0xE0000010u, {
            static_cast<std::uint32_t>(engine::protocol::StyleTarget::Stroke),
            static_cast<std::uint32_t>(engine::protocol::StyleTarget::Fill),
            static_cast<std::uint32_t>(engine::protocol::StyleTarget::TextColor),
            static_cast<std::uint32_t>(engine::protocol::StyleTarget::TextBackground),
        });

        h = hashEnum(h, 0xE0000011u, {
            static_cast<std::uint32_t>(engine::protocol::StyleState::None),
            static_cast<std::uint32_t>(engine::protocol::StyleState::Layer),
            static_cast<std::uint32_t>(engine::protocol::StyleState::Override),
            static_cast<std::uint32_t>(engine::protocol::StyleState::Mixed),
        });

        h = hashEnum(h, 0xE0000012u, {
            static_cast<std::uint32_t>(engine::protocol::TriState::Off),
            static_cast<std::uint32_t>(engine::protocol::TriState::On),
            static_cast<std::uint32_t>(engine::protocol::TriState::Mixed),
        });

        h = hashEnum(h, 0xE000000Eu, {
            static_cast<std::uint32_t>(engine::protocol::SelectionMode::Replace),
            static_cast<std::uint32_t>(engine::protocol::SelectionMode::Add),
            static_cast<std::uint32_t>(engine::protocol::SelectionMode::Remove),
            static_cast<std::uint32_t>(engine::protocol::SelectionMode::Toggle),
        });

        h = hashEnum(h, 0xE000000Fu, {
            static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Shift),
            static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Ctrl),
            static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Alt),
            static_cast<std::uint32_t>(engine::protocol::SelectionModifier::Meta),
        });

        h = hashEnum(h, 0xE0000010u, {
            static_cast<std::uint32_t>(engine::protocol::MarqueeMode::Window),
            static_cast<std::uint32_t>(engine::protocol::MarqueeMode::Crossing),
        });

        h = hashEnum(h, 0xE0000011u, {
            static_cast<std::uint32_t>(engine::protocol::ReorderAction::BringToFront),
            static_cast<std::uint32_t>(engine::protocol::ReorderAction::SendToBack),
            static_cast<std::uint32_t>(engine::protocol::ReorderAction::BringForward),
            static_cast<std::uint32_t>(engine::protocol::ReorderAction::SendBackward),
        });

        h = hashEnum(h, 0xE0000012u, {
            static_cast<std::uint32_t>(engine::protocol::EventType::Overflow),
            static_cast<std::uint32_t>(engine::protocol::EventType::DocChanged),
            static_cast<std::uint32_t>(engine::protocol::EventType::EntityChanged),
            static_cast<std::uint32_t>(engine::protocol::EventType::EntityCreated),
            static_cast<std::uint32_t>(engine::protocol::EventType::EntityDeleted),
            static_cast<std::uint32_t>(engine::protocol::EventType::LayerChanged),
            static_cast<std::uint32_t>(engine::protocol::EventType::SelectionChanged),
            static_cast<std::uint32_t>(engine::protocol::EventType::OrderChanged),
            static_cast<std::uint32_t>(engine::protocol::EventType::HistoryChanged),
        });

        h = hashEnum(h, 0xE0000013u, {
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Geometry),
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style),
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Flags),
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Layer),
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Order),
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text),
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds),
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::RenderData),
        });

        h = hashEnum(h, 0xE0000014u, {
            static_cast<std::uint32_t>(engine::protocol::OverlayKind::Polyline),
            static_cast<std::uint32_t>(engine::protocol::OverlayKind::Polygon),
            static_cast<std::uint32_t>(engine::protocol::OverlayKind::Segment),
            static_cast<std::uint32_t>(engine::protocol::OverlayKind::Rect),
            static_cast<std::uint32_t>(engine::protocol::OverlayKind::Point),
        });

        h = hashEnum(h, 0xE0000015u, {
            static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Begin),
            static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Update),
            static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Commit),
            static_cast<std::uint32_t>(engine::protocol::TransformLogEvent::Cancel),
        });

        h = hashStruct(h, 0x53000001u, sizeof(engine::protocol::ProtocolInfo), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::ProtocolInfo, protocolVersion)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::ProtocolInfo, commandVersion)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::ProtocolInfo, snapshotVersion)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::ProtocolInfo, eventStreamVersion)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::ProtocolInfo, abiHash)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::ProtocolInfo, featureFlags)),
        });

        h = hashStruct(h, 0x53000002u, sizeof(engine::protocol::BufferMeta), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::BufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::BufferMeta, vertexCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::BufferMeta, capacity)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::BufferMeta, floatCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::BufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000003u, sizeof(engine::protocol::ByteBufferMeta), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::ByteBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::ByteBufferMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::ByteBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000004u, sizeof(engine::protocol::EngineStats), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, generation)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, rectCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lineCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, polylineCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, pointCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, triangleVertexCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lineVertexCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, rebuildAllGeometryCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lastLoadMs)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lastRebuildMs)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lastApplyMs)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lastTransformUpdateMs)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lastSnapCandidateCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineStats, lastSnapHitCount)),
        });

        h = hashStruct(h, 0x53000005u, sizeof(PickResult), {
            static_cast<std::uint32_t>(offsetof(PickResult, id)),
            static_cast<std::uint32_t>(offsetof(PickResult, kind)),
            static_cast<std::uint32_t>(offsetof(PickResult, subTarget)),
            static_cast<std::uint32_t>(offsetof(PickResult, subIndex)),
            static_cast<std::uint32_t>(offsetof(PickResult, distance)),
            static_cast<std::uint32_t>(offsetof(PickResult, hitX)),
            static_cast<std::uint32_t>(offsetof(PickResult, hitY)),
        });

        h = hashStruct(h, 0x53000006u, sizeof(TextHitResult), {
            static_cast<std::uint32_t>(offsetof(TextHitResult, charIndex)),
            static_cast<std::uint32_t>(offsetof(TextHitResult, lineIndex)),
            static_cast<std::uint32_t>(offsetof(TextHitResult, isLeadingEdge)),
        });

        h = hashStruct(h, 0x53000007u, sizeof(TextCaretPosition), {
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, x)),
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, y)),
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, height)),
            static_cast<std::uint32_t>(offsetof(TextCaretPosition, lineIndex)),
        });

        h = hashStruct(h, 0x53000008u, sizeof(engine::protocol::TextureBufferMeta), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextureBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextureBufferMeta, width)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextureBufferMeta, height)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextureBufferMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextureBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000009u, sizeof(engine::protocol::TextContentMeta), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextContentMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextContentMeta, ptr)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TextContentMeta, exists)),
        });

        h = hashStruct(h, 0x5300000Au, sizeof(engine::text::TextStyleSnapshot), {
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionStartLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionEndLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionStartByte)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, selectionEndByte)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, caretLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, caretByte)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, lineIndex)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, x)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, y)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, lineHeight)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, styleTriStateFlags)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, align)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, fontIdTriState)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, fontSizeTriState)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, fontId)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, fontSize)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, textGeneration)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextStyleSnapshot, styleTriStateParamsLen)),
        });

        h = hashStruct(h, 0x5300000Bu, sizeof(engine::text::ApplyTextStylePayload), {
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, textId)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, rangeStartLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, rangeEndLogical)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, flagsMask)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, flagsValue)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, mode)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, styleParamsVersion)),
            static_cast<std::uint32_t>(offsetof(engine::text::ApplyTextStylePayload, styleParamsLen)),
        });

        h = hashStruct(h, 0x5300000Cu, sizeof(RectPayload), {
            static_cast<std::uint32_t>(offsetof(RectPayload, x)),
            static_cast<std::uint32_t>(offsetof(RectPayload, y)),
            static_cast<std::uint32_t>(offsetof(RectPayload, w)),
            static_cast<std::uint32_t>(offsetof(RectPayload, h)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillR)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillG)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillB)),
            static_cast<std::uint32_t>(offsetof(RectPayload, fillA)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeR)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeG)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeB)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeA)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeEnabled)),
            static_cast<std::uint32_t>(offsetof(RectPayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x5300000Du, sizeof(LinePayload), {
            static_cast<std::uint32_t>(offsetof(LinePayload, x0)),
            static_cast<std::uint32_t>(offsetof(LinePayload, y0)),
            static_cast<std::uint32_t>(offsetof(LinePayload, x1)),
            static_cast<std::uint32_t>(offsetof(LinePayload, y1)),
            static_cast<std::uint32_t>(offsetof(LinePayload, r)),
            static_cast<std::uint32_t>(offsetof(LinePayload, g)),
            static_cast<std::uint32_t>(offsetof(LinePayload, b)),
            static_cast<std::uint32_t>(offsetof(LinePayload, a)),
            static_cast<std::uint32_t>(offsetof(LinePayload, enabled)),
            static_cast<std::uint32_t>(offsetof(LinePayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x5300000Eu, sizeof(PolylinePayloadHeader), {
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, r)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, g)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, b)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, a)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, enabled)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, strokeWidthPx)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, count)),
            static_cast<std::uint32_t>(offsetof(PolylinePayloadHeader, reserved)),
        });

        h = hashStruct(h, 0x5300000Fu, sizeof(DrawOrderPayloadHeader), {
            static_cast<std::uint32_t>(offsetof(DrawOrderPayloadHeader, count)),
            static_cast<std::uint32_t>(offsetof(DrawOrderPayloadHeader, reserved)),
        });

        h = hashStruct(h, 0x53000010u, sizeof(ViewScalePayload), {
            static_cast<std::uint32_t>(offsetof(ViewScalePayload, scale)),
        });

        h = hashStruct(h, 0x53000011u, sizeof(CirclePayload), {
            static_cast<std::uint32_t>(offsetof(CirclePayload, cx)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, cy)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, rx)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, ry)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, rot)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, sx)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, sy)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillR)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillG)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillB)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, fillA)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeR)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeG)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeB)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeA)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeEnabled)),
            static_cast<std::uint32_t>(offsetof(CirclePayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x53000012u, sizeof(PolygonPayload), {
            static_cast<std::uint32_t>(offsetof(PolygonPayload, sides)),
        });

        h = hashStruct(h, 0x53000013u, sizeof(ArrowPayload), {
            static_cast<std::uint32_t>(offsetof(ArrowPayload, ax)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, ay)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, bx)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, by)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, head)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeR)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeG)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeB)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeA)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeEnabled)),
            static_cast<std::uint32_t>(offsetof(ArrowPayload, strokeWidthPx)),
        });

        h = hashStruct(h, 0x53000014u, sizeof(TextPayloadHeader), {
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, x)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, y)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, rotation)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, boxMode)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, align)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, constraintWidth)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, runCount)),
            static_cast<std::uint32_t>(offsetof(TextPayloadHeader, contentLength)),
        });

        h = hashStruct(h, 0x53000015u, sizeof(TextRunPayload), {
            static_cast<std::uint32_t>(offsetof(TextRunPayload, startIndex)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, length)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, fontId)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, fontSize)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, colorRGBA)),
            static_cast<std::uint32_t>(offsetof(TextRunPayload, flags)),
        });

        h = hashStruct(h, 0x53000016u, sizeof(TextCaretPayload), {
            static_cast<std::uint32_t>(offsetof(TextCaretPayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextCaretPayload, caretIndex)),
        });

        h = hashStruct(h, 0x53000017u, sizeof(TextSelectionPayload), {
            static_cast<std::uint32_t>(offsetof(TextSelectionPayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextSelectionPayload, selectionStart)),
            static_cast<std::uint32_t>(offsetof(TextSelectionPayload, selectionEnd)),
        });

        h = hashStruct(h, 0x53000018u, sizeof(TextInsertPayloadHeader), {
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, textId)),
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, insertIndex)),
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, byteLength)),
            static_cast<std::uint32_t>(offsetof(TextInsertPayloadHeader, reserved)),
        });

        h = hashStruct(h, 0x53000019u, sizeof(TextDeletePayload), {
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, startIndex)),
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, endIndex)),
            static_cast<std::uint32_t>(offsetof(TextDeletePayload, reserved)),
        });

        h = hashStruct(h, 0x5300001Eu, sizeof(TextReplacePayloadHeader), {
            static_cast<std::uint32_t>(offsetof(TextReplacePayloadHeader, textId)),
            static_cast<std::uint32_t>(offsetof(TextReplacePayloadHeader, startIndex)),
            static_cast<std::uint32_t>(offsetof(TextReplacePayloadHeader, endIndex)),
            static_cast<std::uint32_t>(offsetof(TextReplacePayloadHeader, byteLength)),
        });

        h = hashStruct(h, 0x5300001Au, sizeof(TextAlignmentPayload), {
            static_cast<std::uint32_t>(offsetof(TextAlignmentPayload, textId)),
            static_cast<std::uint32_t>(offsetof(TextAlignmentPayload, align)),
        });

        h = hashStruct(h, 0x5300001Bu, sizeof(engine::text::TextLayoutEngine::SelectionRect), {
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, x)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, y)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, width)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, height)),
            static_cast<std::uint32_t>(offsetof(engine::text::TextLayoutEngine::SelectionRect, lineIndex)),
        });

        h = hashStruct(h, 0x5300001Cu, sizeof(TextBoundsResult), {
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, minX)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, minY)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, maxX)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, maxY)),
            static_cast<std::uint32_t>(offsetof(TextBoundsResult, valid)),
        });

        h = hashStruct(h, 0x5300001Du, sizeof(LayerRecord), {
            static_cast<std::uint32_t>(offsetof(LayerRecord, id)),
            static_cast<std::uint32_t>(offsetof(LayerRecord, order)),
            static_cast<std::uint32_t>(offsetof(LayerRecord, flags)),
        });

        h = hashStruct(h, 0x5300001Eu, sizeof(engine::protocol::StyleTargetSummary), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::StyleTargetSummary, state)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::StyleTargetSummary, enabledState)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::StyleTargetSummary, supportedState)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::StyleTargetSummary, reserved)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::StyleTargetSummary, colorRGBA)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::StyleTargetSummary, layerId)),
        });

        h = hashStruct(h, 0x5300001Fu, sizeof(engine::protocol::SelectionStyleSummary), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::SelectionStyleSummary, selectionCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::SelectionStyleSummary, stroke)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::SelectionStyleSummary, fill)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::SelectionStyleSummary, textColor)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::SelectionStyleSummary, textBackground)),
        });

        h = hashStruct(h, 0x53000020u, sizeof(engine::protocol::LayerStyleSnapshot), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, strokeRGBA)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, fillRGBA)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, textColorRGBA)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, textBackgroundRGBA)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, strokeEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, fillEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, textBackgroundEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::LayerStyleSnapshot, reserved)),
        });

        h = hashStruct(h, 0x5300001Eu, sizeof(engine::protocol::DocumentDigest), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::DocumentDigest, lo)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::DocumentDigest, hi)),
        });

        h = hashStruct(h, 0x5300001Fu, sizeof(engine::protocol::EngineEvent), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineEvent, type)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineEvent, flags)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineEvent, a)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineEvent, b)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineEvent, c)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EngineEvent, d)),
        });

        h = hashStruct(h, 0x53000020u, sizeof(engine::protocol::EventBufferMeta), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::EventBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EventBufferMeta, count)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EventBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000021u, sizeof(engine::protocol::OverlayPrimitive), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayPrimitive, kind)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayPrimitive, flags)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayPrimitive, count)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayPrimitive, offset)),
        });

        h = hashStruct(h, 0x53000022u, sizeof(engine::protocol::OverlayBufferMeta), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayBufferMeta, primitiveCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayBufferMeta, floatCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayBufferMeta, primitivesPtr)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::OverlayBufferMeta, dataPtr)),
        });

        h = hashStruct(h, 0x53000023u, sizeof(engine::protocol::EntityAabb), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityAabb, minX)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityAabb, minY)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityAabb, maxX)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityAabb, maxY)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityAabb, valid)),
        });

        h = hashStruct(h, 0x53000026u, sizeof(engine::protocol::EntityTransform), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityTransform, posX)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityTransform, posY)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityTransform, width)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityTransform, height)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityTransform, rotationDeg)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityTransform, hasRotation)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::EntityTransform, valid)),
        });

        h = hashStruct(h, 0x53000024u, sizeof(engine::protocol::HistoryMeta), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::HistoryMeta, depth)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::HistoryMeta, cursor)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::HistoryMeta, generation)),
        });

        h = hashStruct(h, 0x53000025u, sizeof(engine::protocol::TransformLogEntry), {
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, type)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, mode)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, idOffset)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, idCount)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, specificId)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, vertexIndex)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, x)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, y)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, modifiers)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, viewX)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, viewY)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, viewScale)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, viewWidth)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, viewHeight)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapGridEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapGridSize)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapTolerancePx)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapEndpointEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapMidpointEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapCenterEnabled)),
            static_cast<std::uint32_t>(offsetof(engine::protocol::TransformLogEntry, snapNearestEnabled)),
        });

        return h;
    }

public:
    static std::uint32_t getAbiHash() noexcept {
        static const std::uint32_t hash = computeAbiHash();
        return hash;
    }
};
