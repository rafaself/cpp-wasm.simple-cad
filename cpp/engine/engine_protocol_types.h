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
 * Container for protocol-facing aliases and constants.
 * CadEngine publicly inherits from this to expose nested type names
 * without mixing protocol details with the main engine interface.
 */
struct EngineProtocolTypes {
    // Expose legacy nested type names for backwards compatibility with existing callers/tests
    using CommandOp = ::CommandOp;

    // Protocol types (aliased from engine::protocol namespace for backwards compatibility)
    using EngineCapability = engine::protocol::EngineCapability;
    using EngineFeatureFlags = engine::protocol::EngineFeatureFlags;
    using LayerPropMask = engine::protocol::LayerPropMask;
    using SelectionMode = engine::protocol::SelectionMode;
    using SelectionModifier = engine::protocol::SelectionModifier;
    using MarqueeMode = engine::protocol::MarqueeMode;
    using ReorderAction = engine::protocol::ReorderAction;
    using EventType = engine::protocol::EventType;
    using ChangeMask = engine::protocol::ChangeMask;
    using OverlayKind = engine::protocol::OverlayKind;
    using ProtocolInfo = engine::protocol::ProtocolInfo;
    using BufferMeta = engine::protocol::BufferMeta;
    using ByteBufferMeta = engine::protocol::ByteBufferMeta;
    using TextureBufferMeta = engine::protocol::TextureBufferMeta;
    using DocumentDigest = engine::protocol::DocumentDigest;
    using HistoryMeta = engine::protocol::HistoryMeta;
    using EngineEvent = engine::protocol::EngineEvent;
    using EventBufferMeta = engine::protocol::EventBufferMeta;
    using OverlayPrimitive = engine::protocol::OverlayPrimitive;
    using OverlayBufferMeta = engine::protocol::OverlayBufferMeta;
    using EntityAabb = engine::protocol::EntityAabb;
    using EngineStats = engine::protocol::EngineStats;
    using TransformLogEvent = engine::protocol::TransformLogEvent;
    using TransformLogEntry = engine::protocol::TransformLogEntry;
    using TextContentMeta = engine::protocol::TextContentMeta;

    // Protocol versions (must be non-zero; keep in sync with TS).
    static constexpr std::uint32_t kProtocolVersion = 3;      // Handshake schema version
    static constexpr std::uint32_t kCommandVersion = 2;       // Command buffer version (EWDC v2)
    static constexpr std::uint32_t kSnapshotVersion = snapshotVersionEsnp; // Snapshot format version (ESNP v1)
    static constexpr std::uint32_t kEventStreamVersion = 1;   // Event stream schema version (reserved)
    static constexpr std::uint32_t kFeatureFlags =
        static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_PROTOCOL)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_LAYERS_FLAGS)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SELECTION_ORDER)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SNAPSHOT_VNEXT)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_EVENT_STREAM)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_OVERLAY_QUERIES)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_INTERACTIVE_TRANSFORM)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_HISTORY)
        | static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_DOCUMENT_SOT);
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
            static_cast<std::uint32_t>(CommandOp::ApplyTextStyle),
            static_cast<std::uint32_t>(CommandOp::SetTextAlign),
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
            static_cast<std::uint32_t>(EngineCapability::HAS_QUERY_MARQUEE),
            static_cast<std::uint32_t>(EngineCapability::HAS_RESIZE_HANDLES),
            static_cast<std::uint32_t>(EngineCapability::HAS_TRANSFORM_RESIZE),
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
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_PROTOCOL),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_LAYERS_FLAGS),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SELECTION_ORDER),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_SNAPSHOT_VNEXT),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_EVENT_STREAM),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_OVERLAY_QUERIES),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_INTERACTIVE_TRANSFORM),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_HISTORY),
            static_cast<std::uint32_t>(EngineFeatureFlags::FEATURE_ENGINE_DOCUMENT_SOT),
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
            static_cast<std::uint32_t>(LayerPropMask::Name),
            static_cast<std::uint32_t>(LayerPropMask::Visible),
            static_cast<std::uint32_t>(LayerPropMask::Locked),
        });

        h = hashEnum(h, 0xE000000Eu, {
            static_cast<std::uint32_t>(SelectionMode::Replace),
            static_cast<std::uint32_t>(SelectionMode::Add),
            static_cast<std::uint32_t>(SelectionMode::Remove),
            static_cast<std::uint32_t>(SelectionMode::Toggle),
        });

        h = hashEnum(h, 0xE000000Fu, {
            static_cast<std::uint32_t>(SelectionModifier::Shift),
            static_cast<std::uint32_t>(SelectionModifier::Ctrl),
            static_cast<std::uint32_t>(SelectionModifier::Alt),
            static_cast<std::uint32_t>(SelectionModifier::Meta),
        });

        h = hashEnum(h, 0xE0000010u, {
            static_cast<std::uint32_t>(MarqueeMode::Window),
            static_cast<std::uint32_t>(MarqueeMode::Crossing),
        });

        h = hashEnum(h, 0xE0000011u, {
            static_cast<std::uint32_t>(ReorderAction::BringToFront),
            static_cast<std::uint32_t>(ReorderAction::SendToBack),
            static_cast<std::uint32_t>(ReorderAction::BringForward),
            static_cast<std::uint32_t>(ReorderAction::SendBackward),
        });

        h = hashEnum(h, 0xE0000012u, {
            static_cast<std::uint32_t>(EventType::Overflow),
            static_cast<std::uint32_t>(EventType::DocChanged),
            static_cast<std::uint32_t>(EventType::EntityChanged),
            static_cast<std::uint32_t>(EventType::EntityCreated),
            static_cast<std::uint32_t>(EventType::EntityDeleted),
            static_cast<std::uint32_t>(EventType::LayerChanged),
            static_cast<std::uint32_t>(EventType::SelectionChanged),
            static_cast<std::uint32_t>(EventType::OrderChanged),
            static_cast<std::uint32_t>(EventType::HistoryChanged),
        });

        h = hashEnum(h, 0xE0000013u, {
            static_cast<std::uint32_t>(ChangeMask::Geometry),
            static_cast<std::uint32_t>(ChangeMask::Style),
            static_cast<std::uint32_t>(ChangeMask::Flags),
            static_cast<std::uint32_t>(ChangeMask::Layer),
            static_cast<std::uint32_t>(ChangeMask::Order),
            static_cast<std::uint32_t>(ChangeMask::Text),
            static_cast<std::uint32_t>(ChangeMask::Bounds),
            static_cast<std::uint32_t>(ChangeMask::RenderData),
        });

        h = hashEnum(h, 0xE0000014u, {
            static_cast<std::uint32_t>(OverlayKind::Polyline),
            static_cast<std::uint32_t>(OverlayKind::Polygon),
            static_cast<std::uint32_t>(OverlayKind::Segment),
            static_cast<std::uint32_t>(OverlayKind::Rect),
            static_cast<std::uint32_t>(OverlayKind::Point),
        });

        h = hashEnum(h, 0xE0000015u, {
            static_cast<std::uint32_t>(TransformLogEvent::Begin),
            static_cast<std::uint32_t>(TransformLogEvent::Update),
            static_cast<std::uint32_t>(TransformLogEvent::Commit),
            static_cast<std::uint32_t>(TransformLogEvent::Cancel),
        });

        h = hashStruct(h, 0x53000001u, sizeof(ProtocolInfo), {
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, protocolVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, commandVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, snapshotVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, eventStreamVersion)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, abiHash)),
            static_cast<std::uint32_t>(offsetof(ProtocolInfo, featureFlags)),
        });

        h = hashStruct(h, 0x53000002u, sizeof(BufferMeta), {
            static_cast<std::uint32_t>(offsetof(BufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, vertexCount)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, capacity)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, floatCount)),
            static_cast<std::uint32_t>(offsetof(BufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000003u, sizeof(ByteBufferMeta), {
            static_cast<std::uint32_t>(offsetof(ByteBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(ByteBufferMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(ByteBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000004u, sizeof(EngineStats), {
            static_cast<std::uint32_t>(offsetof(EngineStats, generation)),
            static_cast<std::uint32_t>(offsetof(EngineStats, rectCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lineCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, polylineCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, pointCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, triangleVertexCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lineVertexCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, rebuildAllGeometryCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastLoadMs)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastRebuildMs)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastApplyMs)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastTransformUpdateMs)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastSnapCandidateCount)),
            static_cast<std::uint32_t>(offsetof(EngineStats, lastSnapHitCount)),
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

        h = hashStruct(h, 0x53000008u, sizeof(TextureBufferMeta), {
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, width)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, height)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(TextureBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000009u, sizeof(TextContentMeta), {
            static_cast<std::uint32_t>(offsetof(TextContentMeta, byteCount)),
            static_cast<std::uint32_t>(offsetof(TextContentMeta, ptr)),
            static_cast<std::uint32_t>(offsetof(TextContentMeta, exists)),
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

        h = hashStruct(h, 0x5300001Eu, sizeof(DocumentDigest), {
            static_cast<std::uint32_t>(offsetof(DocumentDigest, lo)),
            static_cast<std::uint32_t>(offsetof(DocumentDigest, hi)),
        });

        h = hashStruct(h, 0x5300001Fu, sizeof(EngineEvent), {
            static_cast<std::uint32_t>(offsetof(EngineEvent, type)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, flags)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, a)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, b)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, c)),
            static_cast<std::uint32_t>(offsetof(EngineEvent, d)),
        });

        h = hashStruct(h, 0x53000020u, sizeof(EventBufferMeta), {
            static_cast<std::uint32_t>(offsetof(EventBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(EventBufferMeta, count)),
            static_cast<std::uint32_t>(offsetof(EventBufferMeta, ptr)),
        });

        h = hashStruct(h, 0x53000021u, sizeof(OverlayPrimitive), {
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, kind)),
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, flags)),
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, count)),
            static_cast<std::uint32_t>(offsetof(OverlayPrimitive, offset)),
        });

        h = hashStruct(h, 0x53000022u, sizeof(OverlayBufferMeta), {
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, generation)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, primitiveCount)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, floatCount)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, primitivesPtr)),
            static_cast<std::uint32_t>(offsetof(OverlayBufferMeta, dataPtr)),
        });

        h = hashStruct(h, 0x53000023u, sizeof(EntityAabb), {
            static_cast<std::uint32_t>(offsetof(EntityAabb, minX)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, minY)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, maxX)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, maxY)),
            static_cast<std::uint32_t>(offsetof(EntityAabb, valid)),
        });

        h = hashStruct(h, 0x53000024u, sizeof(HistoryMeta), {
            static_cast<std::uint32_t>(offsetof(HistoryMeta, depth)),
            static_cast<std::uint32_t>(offsetof(HistoryMeta, cursor)),
            static_cast<std::uint32_t>(offsetof(HistoryMeta, generation)),
        });

        h = hashStruct(h, 0x53000025u, sizeof(TransformLogEntry), {
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, type)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, mode)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, idOffset)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, idCount)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, specificId)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, vertexIndex)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, x)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, y)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, modifiers)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, viewX)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, viewY)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, viewScale)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, viewWidth)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, viewHeight)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapEnabled)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapGridEnabled)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapGridSize)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapTolerancePx)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapEndpointEnabled)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapMidpointEnabled)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapCenterEnabled)),
            static_cast<std::uint32_t>(offsetof(TransformLogEntry, snapNearestEnabled)),
        });

        return h;
    }

public:
    static std::uint32_t getAbiHash() noexcept {
        static const std::uint32_t hash = computeAbiHash();
        return hash;
    }
};
