#ifdef EMSCRIPTEN
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#endif

// Include the engine public API header for bindings.
#include "engine/engine.h"
#include "engine/interaction/pick_system.h" // For PickResult definition

#ifdef EMSCRIPTEN
EMSCRIPTEN_BINDINGS(cad_engine_module) {
    emscripten::enum_<TextBoxMode>("TextBoxMode")
        .value("AutoWidth", TextBoxMode::AutoWidth)
        .value("FixedWidth", TextBoxMode::FixedWidth);

    // Pick enums
    emscripten::enum_<PickSubTarget>("PickSubTarget")
        .value("None", PickSubTarget::None)
        .value("Body", PickSubTarget::Body)
        .value("Edge", PickSubTarget::Edge)
        .value("Vertex", PickSubTarget::Vertex)
        .value("ResizeHandle", PickSubTarget::ResizeHandle)
        .value("RotateHandle", PickSubTarget::RotateHandle)
        .value("TextBody", PickSubTarget::TextBody)
        .value("TextCaret", PickSubTarget::TextCaret);

    emscripten::enum_<PickEntityKind>("PickEntityKind")
        .value("Unknown", PickEntityKind::Unknown)
        .value("Rect", PickEntityKind::Rect)
        .value("Circle", PickEntityKind::Circle)
        .value("Line", PickEntityKind::Line)
        .value("Polyline", PickEntityKind::Polyline)
        .value("Polygon", PickEntityKind::Polygon)
        .value("Arrow", PickEntityKind::Arrow)
        .value("Text", PickEntityKind::Text);

    emscripten::enum_<CadEngine::TransformMode>("TransformMode")
        .value("Move", CadEngine::TransformMode::Move)
        .value("VertexDrag", CadEngine::TransformMode::VertexDrag)
        .value("EdgeDrag", CadEngine::TransformMode::EdgeDrag)
        .value("Resize", CadEngine::TransformMode::Resize)
        .value("Rotate", CadEngine::TransformMode::Rotate);

    emscripten::enum_<CadEngine::TransformOpCode>("TransformOpCode")
        .value("MOVE", CadEngine::TransformOpCode::MOVE)
        .value("VERTEX_SET", CadEngine::TransformOpCode::VERTEX_SET)
        .value("RESIZE", CadEngine::TransformOpCode::RESIZE)
        .value("ROTATE", CadEngine::TransformOpCode::ROTATE);

    emscripten::enum_<engine::protocol::SelectionMode>("SelectionMode")
        .value("Replace", engine::protocol::SelectionMode::Replace)
        .value("Add", engine::protocol::SelectionMode::Add)
        .value("Remove", engine::protocol::SelectionMode::Remove)
        .value("Toggle", engine::protocol::SelectionMode::Toggle);

    emscripten::enum_<engine::protocol::SelectionModifier>("SelectionModifier")
        .value("Shift", engine::protocol::SelectionModifier::Shift)
        .value("Ctrl", engine::protocol::SelectionModifier::Ctrl)
        .value("Alt", engine::protocol::SelectionModifier::Alt)
        .value("Meta", engine::protocol::SelectionModifier::Meta);

    emscripten::enum_<engine::protocol::MarqueeMode>("MarqueeMode")
        .value("Window", engine::protocol::MarqueeMode::Window)
        .value("Crossing", engine::protocol::MarqueeMode::Crossing);

    emscripten::enum_<engine::protocol::ReorderAction>("ReorderAction")
        .value("BringToFront", engine::protocol::ReorderAction::BringToFront)
        .value("SendToBack", engine::protocol::ReorderAction::SendToBack)
        .value("BringForward", engine::protocol::ReorderAction::BringForward)
        .value("SendBackward", engine::protocol::ReorderAction::SendBackward);

    emscripten::enum_<engine::protocol::EngineCapability>("EngineCapability")
        .value("HAS_QUERY_MARQUEE", engine::protocol::EngineCapability::HAS_QUERY_MARQUEE)
        .value("HAS_RESIZE_HANDLES", engine::protocol::EngineCapability::HAS_RESIZE_HANDLES)
        .value("HAS_TRANSFORM_RESIZE", engine::protocol::EngineCapability::HAS_TRANSFORM_RESIZE);

    emscripten::class_<CadEngine>("CadEngine")
        .constructor<>()
        .function("clear", &CadEngine::clear)
        .function("allocBytes", &CadEngine::allocBytes)
        .function("freeBytes", &CadEngine::freeBytes)
        .function("applyCommandBuffer", &CadEngine::applyCommandBuffer)
        .function("reserveWorld", &CadEngine::reserveWorld)
        .function("loadSnapshotFromPtr", &CadEngine::loadSnapshotFromPtr)
        .function("getVertexCount", &CadEngine::getVertexCount)
        .function("getVertexDataPtr", &CadEngine::getVertexDataPtr)
        .function("getPositionBufferMeta", &CadEngine::getPositionBufferMeta)
        .function("getLineBufferMeta", &CadEngine::getLineBufferMeta)
        .function("saveSnapshot", &CadEngine::saveSnapshot)
        .function("getSnapshotBufferMeta", &CadEngine::getSnapshotBufferMeta)
        .function("getFullSnapshotMeta", &CadEngine::getFullSnapshotMeta)
        .function("getCapabilities", &CadEngine::getCapabilities)
        .function("getProtocolInfo", &CadEngine::getProtocolInfo)
        .function("allocateEntityId", &CadEngine::allocateEntityId)
        .function("allocateLayerId", &CadEngine::allocateLayerId)
        .function("getDocumentDigest", &CadEngine::getDocumentDigest)
        .function("getHistoryMeta", &CadEngine::getHistoryMeta)
        .function("beginHistoryEntry", &CadEngine::beginHistoryEntry)
        .function("commitHistoryEntry", &CadEngine::commitHistoryEntry)
        .function("discardHistoryEntry", &CadEngine::discardHistoryEntry)
        .function("rollbackHistoryEntry", &CadEngine::rollbackHistoryEntry)
        .function("canUndo", &CadEngine::canUndo)
        .function("canRedo", &CadEngine::canRedo)
        .function("undo", &CadEngine::undo)
        .function("redo", &CadEngine::redo)
        .function("pollEvents", &CadEngine::pollEvents)
        .function("ackResync", &CadEngine::ackResync)
        .function("hasPendingEvents", &CadEngine::hasPendingEvents)
        .function("getSelectionOutlineMeta", &CadEngine::getSelectionOutlineMeta)
        .function("getSelectionHandleMeta", &CadEngine::getSelectionHandleMeta)
        .function("getOrientedHandleMeta", &CadEngine::getOrientedHandleMeta)
        .function("getSnapOverlayMeta", &CadEngine::getSnapOverlayMeta)
        .function("getEntityAabb", &CadEngine::getEntityAabb)
        .function("getSelectionBounds", &CadEngine::getSelectionBounds)
        .function("getEntityTransform", &CadEngine::getEntityTransform)
        .function("setEntityPosition", &CadEngine::setEntityPosition)
        .function("setEntitySize", &CadEngine::setEntitySize)
        .function("setEntityRotation", &CadEngine::setEntityRotation)
        .function("setEntityLength", &CadEngine::setEntityLength)
        .function("setEntityScale", &CadEngine::setEntityScale)
        .function("getLayersSnapshot", &CadEngine::getLayersSnapshot)
        .function("getLayerName", &CadEngine::getLayerName)
        .function("getLayerStyle", &CadEngine::getLayerStyle)
        .function("setLayerProps", &CadEngine::setLayerProps)
        .function("deleteLayer", &CadEngine::deleteLayer)
        .function("getEntityFlags", &CadEngine::getEntityFlags)
        .function("setEntityFlags", &CadEngine::setEntityFlags)
        .function("setEntityLayer", &CadEngine::setEntityLayer)
        .function("getEntityLayer", &CadEngine::getEntityLayer)
        .function("getEntityKind", &CadEngine::getEntityKind)
        .function("tryGetEntityGeomZ", emscripten::optional_override([](const CadEngine& self, std::uint32_t entityId) {
            float z = 0.0f;
            const bool ok = self.tryGetEntityGeomZ(entityId, z);
            emscripten::val result = emscripten::val::object();
            result.set("ok", ok);
            result.set("z", z);
            return result;
        }))
        .function("setEntityGeomZ", &CadEngine::setEntityGeomZ)
        .function("getSelectionIds", &CadEngine::getSelectionIds)
        .function("getSelectionGeneration", &CadEngine::getSelectionGeneration)
        .function("getSelectionStyleSummary", &CadEngine::getSelectionStyleSummary)
        .function("clearSelection", &CadEngine::clearSelection)
        .function("setSelection", emscripten::optional_override([](CadEngine& self, std::uintptr_t idsPtr, std::uint32_t idCount, int mode) {
            self.setSelection(reinterpret_cast<const std::uint32_t*>(idsPtr), idCount, static_cast<engine::protocol::SelectionMode>(mode));
        }))
        .function("selectByPick", &CadEngine::selectByPick)
        .function("marqueeSelect", &CadEngine::marqueeSelect)
        .function("getDrawOrderSnapshot", &CadEngine::getDrawOrderSnapshot)
        .function("reorderEntities", emscripten::optional_override([](CadEngine& self, std::uintptr_t idsPtr, std::uint32_t idCount, int action, std::uint32_t refId) {
            self.reorderEntities(reinterpret_cast<const std::uint32_t*>(idsPtr), idCount, static_cast<engine::protocol::ReorderAction>(action), refId);
        }))
        .function("pick", &CadEngine::pick)
        .function("pickEx", &CadEngine::pickEx)
        .function("pickCandidates", &CadEngine::pickCandidates)
        .function("pickSelectionHandle", &CadEngine::pickSelectionHandle)
        .function("pickSideHandle", &CadEngine::pickSideHandle)
        .function("queryArea", &CadEngine::queryArea)
        .function("queryMarquee", &CadEngine::queryMarquee)
        .function("getStats", &CadEngine::getStats)
        .function("setSnapOptions", &CadEngine::setSnapOptions)
        .function("setOrthoOptions", &CadEngine::setOrthoOptions)
        .function("getSnappedPoint", emscripten::optional_override([](const CadEngine& self, float x, float y) {
            auto p = self.getSnappedPoint(x, y);
             return emscripten::val::array(std::vector<float>{p.first, p.second});
        }))
        // Text system methods
        .function("initializeTextSystem", &CadEngine::initializeTextSystem)
        .function("loadFont", &CadEngine::loadFont)
        .function("loadFontEx", &CadEngine::loadFontEx)
        .function("hitTestText", &CadEngine::hitTestText)
        .function("getTextCaretPosition", &CadEngine::getTextCaretPosition)
        .function("rebuildTextQuadBuffer", &CadEngine::rebuildTextQuadBuffer)
        .function("getTextQuadBufferMeta", &CadEngine::getTextQuadBufferMeta)
        .function("getAtlasTextureMeta", &CadEngine::getAtlasTextureMeta)
        .function("isAtlasDirty", &CadEngine::isAtlasDirty)
        .function("clearAtlasDirty", &CadEngine::clearAtlasDirty)
        .function("isTextQuadsDirty", &CadEngine::isTextQuadsDirty)
        .function("getTextContentMeta", &CadEngine::getTextContentMeta)
        .function("getTextSelectionRects", &CadEngine::getTextSelectionRects)
        .function("getAllTextMetas", &CadEngine::getAllTextMetas)
        .function("getTextStyleSnapshot", &CadEngine::getTextStyleSnapshot)
        .function("getTextStyleSummary", &CadEngine::getTextStyleSummary)
        .function("setTextConstraintWidth", &CadEngine::setTextConstraintWidth)
        .function("setTextPosition", &CadEngine::setTextPosition)
        .function("getVisualPrevCharIndex", &CadEngine::getVisualPrevCharIndex)
        .function("getVisualNextCharIndex", &CadEngine::getVisualNextCharIndex)
        .function("getWordLeftIndex", &CadEngine::getWordLeftIndex)
        .function("getWordRightIndex", &CadEngine::getWordRightIndex)
        .function("getLineStartIndex", &CadEngine::getLineStartIndex)
        .function("getLineEndIndex", &CadEngine::getLineEndIndex)
        .function("getLineUpIndex", &CadEngine::getLineUpIndex)
        .function("getLineDownIndex", &CadEngine::getLineDownIndex)
        .function("getTextBounds", emscripten::optional_override([](CadEngine& self, std::uint32_t textId) {
            float x1=0, y1=0, x2=0, y2=0;
            if (self.getTextBounds(textId, x1, y1, x2, y2)) {
                return TextBoundsResult{x1, y1, x2, y2, true};
            }
            return TextBoundsResult{0,0,0,0, false};
            return TextBoundsResult{0,0,0,0, false};
        }))
        // Interaction Session
        .function("beginTransform", emscripten::optional_override([](
            CadEngine& self,
            std::uintptr_t idsPtr,
            std::uint32_t idCount,
            int mode,
            std::uint32_t specificId,
            int32_t vertexIndex,
            float screenX,
            float screenY,
            float viewX,
            float viewY,
            float viewScale,
            float viewWidth,
            float viewHeight,
            std::uint32_t modifiers) {
            self.beginTransform(
                reinterpret_cast<const std::uint32_t*>(idsPtr),
                idCount,
                static_cast<CadEngine::TransformMode>(mode),
                specificId,
                vertexIndex,
                screenX,
                screenY,
                viewX,
                viewY,
                viewScale,
                viewWidth,
                viewHeight,
                modifiers);
        }))
        .function("updateTransform", &CadEngine::updateTransform)
        .function("commitTransform", &CadEngine::commitTransform)
        .function("cancelTransform", &CadEngine::cancelTransform)
        .function("isInteractionActive", &CadEngine::isInteractionActive)
        .function("getTransformState", &CadEngine::getTransformState)
        .function("getCommitResultCount", &CadEngine::getCommitResultCount)
        .function("getCommitResultIdsPtr", &CadEngine::getCommitResultIdsPtr)
        .function("getCommitResultOpCodesPtr", &CadEngine::getCommitResultOpCodesPtr)
        .function("getCommitResultPayloadsPtr", &CadEngine::getCommitResultPayloadsPtr)
        .function("setTransformLogEnabled", &CadEngine::setTransformLogEnabled)
        .function("clearTransformLog", &CadEngine::clearTransformLog)
        .function("replayTransformLog", &CadEngine::replayTransformLog)
        .function("isTransformLogOverflowed", &CadEngine::isTransformLogOverflowed)
        .function("getTransformLogCount", &CadEngine::getTransformLogCount)
        .function("getTransformLogPtr", &CadEngine::getTransformLogPtr)
        .function("getTransformLogIdCount", &CadEngine::getTransformLogIdCount)
        .function("getTransformLogIdsPtr", &CadEngine::getTransformLogIdsPtr)
        // Draft System
        .function("getDraftDimensions", &CadEngine::getDraftDimensions);
    
    // ... values ...

    emscripten::value_object<PickResult>("PickResult")
        .field("id", &PickResult::id)
        .field("kind", &PickResult::kind)
        .field("subTarget", &PickResult::subTarget)
        .field("subIndex", &PickResult::subIndex)
        .field("distance", &PickResult::distance)
        .field("hitX", &PickResult::hitX)
        .field("hitY", &PickResult::hitY);

    emscripten::value_object<TransformState>("TransformState")
        .field("active", &TransformState::active)
        .field("mode", &TransformState::mode)
        .field("rotationDeltaDeg", &TransformState::rotationDeltaDeg)
        .field("pivotX", &TransformState::pivotX)
        .field("pivotY", &TransformState::pivotY);

    emscripten::value_object<engine::protocol::ProtocolInfo>("ProtocolInfo")
        .field("protocolVersion", &engine::protocol::ProtocolInfo::protocolVersion)
        .field("commandVersion", &engine::protocol::ProtocolInfo::commandVersion)
        .field("snapshotVersion", &engine::protocol::ProtocolInfo::snapshotVersion)
        .field("eventStreamVersion", &engine::protocol::ProtocolInfo::eventStreamVersion)
        .field("abiHash", &engine::protocol::ProtocolInfo::abiHash)
        .field("featureFlags", &engine::protocol::ProtocolInfo::featureFlags);

    emscripten::value_object<LayerRecord>("LayerRecord")
        .field("id", &LayerRecord::id)
        .field("order", &LayerRecord::order)
        .field("flags", &LayerRecord::flags);

    emscripten::value_object<engine::protocol::BufferMeta>("BufferMeta")
        .field("generation", &engine::protocol::BufferMeta::generation)
        .field("vertexCount", &engine::protocol::BufferMeta::vertexCount)
        .field("capacity", &engine::protocol::BufferMeta::capacity)
        .field("floatCount", &engine::protocol::BufferMeta::floatCount)
        .field("ptr", &engine::protocol::BufferMeta::ptr);

    emscripten::value_object<engine::protocol::ByteBufferMeta>("ByteBufferMeta")
        .field("generation", &engine::protocol::ByteBufferMeta::generation)
        .field("byteCount", &engine::protocol::ByteBufferMeta::byteCount)
        .field("ptr", &engine::protocol::ByteBufferMeta::ptr);

    emscripten::value_object<engine::protocol::EngineEvent>("EngineEvent")
        .field("type", &engine::protocol::EngineEvent::type)
        .field("flags", &engine::protocol::EngineEvent::flags)
        .field("a", &engine::protocol::EngineEvent::a)
        .field("b", &engine::protocol::EngineEvent::b)
        .field("c", &engine::protocol::EngineEvent::c)
        .field("d", &engine::protocol::EngineEvent::d);

    emscripten::value_object<engine::protocol::EventBufferMeta>("EventBufferMeta")
        .field("generation", &engine::protocol::EventBufferMeta::generation)
        .field("count", &engine::protocol::EventBufferMeta::count)
        .field("ptr", &engine::protocol::EventBufferMeta::ptr);

    emscripten::value_object<engine::protocol::DocumentDigest>("DocumentDigest")
        .field("lo", &engine::protocol::DocumentDigest::lo)
        .field("hi", &engine::protocol::DocumentDigest::hi);

    emscripten::value_object<engine::protocol::HistoryMeta>("HistoryMeta")
        .field("depth", &engine::protocol::HistoryMeta::depth)
        .field("cursor", &engine::protocol::HistoryMeta::cursor)
        .field("generation", &engine::protocol::HistoryMeta::generation);

    emscripten::value_object<engine::protocol::StyleTargetSummary>("StyleTargetSummary")
        .field("state", &engine::protocol::StyleTargetSummary::state)
        .field("enabledState", &engine::protocol::StyleTargetSummary::enabledState)
        .field("supportedState", &engine::protocol::StyleTargetSummary::supportedState)
        .field("reserved", &engine::protocol::StyleTargetSummary::reserved)
        .field("colorRGBA", &engine::protocol::StyleTargetSummary::colorRGBA)
        .field("layerId", &engine::protocol::StyleTargetSummary::layerId);

    emscripten::value_object<engine::protocol::SelectionStyleSummary>("SelectionStyleSummary")
        .field("selectionCount", &engine::protocol::SelectionStyleSummary::selectionCount)
        .field("stroke", &engine::protocol::SelectionStyleSummary::stroke)
        .field("fill", &engine::protocol::SelectionStyleSummary::fill)
        .field("textColor", &engine::protocol::SelectionStyleSummary::textColor)
        .field("textBackground", &engine::protocol::SelectionStyleSummary::textBackground);

    emscripten::value_object<engine::protocol::LayerStyleSnapshot>("LayerStyleSnapshot")
        .field("strokeRGBA", &engine::protocol::LayerStyleSnapshot::strokeRGBA)
        .field("fillRGBA", &engine::protocol::LayerStyleSnapshot::fillRGBA)
        .field("textColorRGBA", &engine::protocol::LayerStyleSnapshot::textColorRGBA)
        .field("textBackgroundRGBA", &engine::protocol::LayerStyleSnapshot::textBackgroundRGBA)
        .field("strokeEnabled", &engine::protocol::LayerStyleSnapshot::strokeEnabled)
        .field("fillEnabled", &engine::protocol::LayerStyleSnapshot::fillEnabled)
        .field("textBackgroundEnabled", &engine::protocol::LayerStyleSnapshot::textBackgroundEnabled)
        .field("reserved", &engine::protocol::LayerStyleSnapshot::reserved);

    emscripten::value_object<engine::protocol::EngineStats>("EngineStats")
        .field("generation", &engine::protocol::EngineStats::generation)
        .field("rectCount", &engine::protocol::EngineStats::rectCount)
        .field("lineCount", &engine::protocol::EngineStats::lineCount)
        .field("polylineCount", &engine::protocol::EngineStats::polylineCount)
        .field("pointCount", &engine::protocol::EngineStats::pointCount)
        .field("triangleVertexCount", &engine::protocol::EngineStats::triangleVertexCount)
        .field("lineVertexCount", &engine::protocol::EngineStats::lineVertexCount)
        .field("rebuildAllGeometryCount", &engine::protocol::EngineStats::rebuildAllGeometryCount)
        .field("lastLoadMs", &engine::protocol::EngineStats::lastLoadMs)
        .field("lastRebuildMs", &engine::protocol::EngineStats::lastRebuildMs)
        .field("lastApplyMs", &engine::protocol::EngineStats::lastApplyMs)
        .field("lastTransformUpdateMs", &engine::protocol::EngineStats::lastTransformUpdateMs)
        .field("lastSnapCandidateCount", &engine::protocol::EngineStats::lastSnapCandidateCount)
        .field("lastSnapHitCount", &engine::protocol::EngineStats::lastSnapHitCount);

    emscripten::value_object<engine::protocol::OverlayBufferMeta>("OverlayBufferMeta")
        .field("generation", &engine::protocol::OverlayBufferMeta::generation)
        .field("primitiveCount", &engine::protocol::OverlayBufferMeta::primitiveCount)
        .field("floatCount", &engine::protocol::OverlayBufferMeta::floatCount)
        .field("primitivesPtr", &engine::protocol::OverlayBufferMeta::primitivesPtr)
        .field("dataPtr", &engine::protocol::OverlayBufferMeta::dataPtr);

    // OrientedHandleMeta - OBB handles with pre-rotated positions
    emscripten::value_object<engine::protocol::OrientedHandleMeta>("OrientedHandleMeta")
        .field("generation", &engine::protocol::OrientedHandleMeta::generation)
        .field("entityId", &engine::protocol::OrientedHandleMeta::entityId)
        .field("blX", &engine::protocol::OrientedHandleMeta::blX)
        .field("blY", &engine::protocol::OrientedHandleMeta::blY)
        .field("brX", &engine::protocol::OrientedHandleMeta::brX)
        .field("brY", &engine::protocol::OrientedHandleMeta::brY)
        .field("trX", &engine::protocol::OrientedHandleMeta::trX)
        .field("trY", &engine::protocol::OrientedHandleMeta::trY)
        .field("tlX", &engine::protocol::OrientedHandleMeta::tlX)
        .field("tlY", &engine::protocol::OrientedHandleMeta::tlY)
        .field("southX", &engine::protocol::OrientedHandleMeta::southX)
        .field("southY", &engine::protocol::OrientedHandleMeta::southY)
        .field("eastX", &engine::protocol::OrientedHandleMeta::eastX)
        .field("eastY", &engine::protocol::OrientedHandleMeta::eastY)
        .field("northX", &engine::protocol::OrientedHandleMeta::northX)
        .field("northY", &engine::protocol::OrientedHandleMeta::northY)
        .field("westX", &engine::protocol::OrientedHandleMeta::westX)
        .field("westY", &engine::protocol::OrientedHandleMeta::westY)
        .field("rotateHandleX", &engine::protocol::OrientedHandleMeta::rotateHandleX)
        .field("rotateHandleY", &engine::protocol::OrientedHandleMeta::rotateHandleY)
        .field("centerX", &engine::protocol::OrientedHandleMeta::centerX)
        .field("centerY", &engine::protocol::OrientedHandleMeta::centerY)
        .field("rotationRad", &engine::protocol::OrientedHandleMeta::rotationRad)
        .field("hasRotateHandle", &engine::protocol::OrientedHandleMeta::hasRotateHandle)
        .field("hasResizeHandles", &engine::protocol::OrientedHandleMeta::hasResizeHandles)
        .field("hasSideHandles", &engine::protocol::OrientedHandleMeta::hasSideHandles)
        .field("selectionCount", &engine::protocol::OrientedHandleMeta::selectionCount)
        .field("isGroup", &engine::protocol::OrientedHandleMeta::isGroup)
        .field("valid", &engine::protocol::OrientedHandleMeta::valid);

    emscripten::value_object<engine::protocol::EntityAabb>("EntityAabb")
        .field("minX", &engine::protocol::EntityAabb::minX)
        .field("minY", &engine::protocol::EntityAabb::minY)
        .field("maxX", &engine::protocol::EntityAabb::maxX)
        .field("maxY", &engine::protocol::EntityAabb::maxY)
        .field("valid", &engine::protocol::EntityAabb::valid);

    emscripten::value_object<engine::protocol::EntityTransform>("EntityTransform")
        .field("posX", &engine::protocol::EntityTransform::posX)
        .field("posY", &engine::protocol::EntityTransform::posY)
        .field("width", &engine::protocol::EntityTransform::width)
        .field("height", &engine::protocol::EntityTransform::height)
        .field("rotationDeg", &engine::protocol::EntityTransform::rotationDeg)
        .field("hasRotation", &engine::protocol::EntityTransform::hasRotation)
        .field("valid", &engine::protocol::EntityTransform::valid);

    emscripten::value_object<DraftDimensions>("DraftDimensions")
        .field("minX", &DraftDimensions::minX)
        .field("minY", &DraftDimensions::minY)
        .field("maxX", &DraftDimensions::maxX)
        .field("maxY", &DraftDimensions::maxY)
        .field("width", &DraftDimensions::width)
        .field("height", &DraftDimensions::height)
        .field("centerX", &DraftDimensions::centerX)
        .field("centerY", &DraftDimensions::centerY)
        .field("length", &DraftDimensions::length)
        .field("segmentLength", &DraftDimensions::segmentLength)
        .field("angleDeg", &DraftDimensions::angleDeg)
        .field("radius", &DraftDimensions::radius)
        .field("diameter", &DraftDimensions::diameter)
        .field("kind", &DraftDimensions::kind)
        .field("active", &DraftDimensions::active);

    // Text-related value objects
    emscripten::value_object<TextHitResult>("TextHitResult")
        .field("byteIndex", &TextHitResult::charIndex)  // Renamed from charIndex to byteIndex for clarity
        .field("lineIndex", &TextHitResult::lineIndex)
        .field("isLeadingEdge", &TextHitResult::isLeadingEdge);

    emscripten::value_object<TextCaretPosition>("TextCaretPosition")
        .field("x", &TextCaretPosition::x)
        .field("y", &TextCaretPosition::y)
        .field("height", &TextCaretPosition::height)
        .field("lineIndex", &TextCaretPosition::lineIndex);

    emscripten::value_object<engine::protocol::TextureBufferMeta>("TextureBufferMeta")
        .field("generation", &engine::protocol::TextureBufferMeta::generation)
        .field("width", &engine::protocol::TextureBufferMeta::width)
        .field("height", &engine::protocol::TextureBufferMeta::height)
        .field("byteCount", &engine::protocol::TextureBufferMeta::byteCount)
        .field("ptr", &engine::protocol::TextureBufferMeta::ptr);

    emscripten::value_object<engine::protocol::TextContentMeta>("TextContentMeta")
        .field("byteCount", &engine::protocol::TextContentMeta::byteCount)
        .field("ptr", &engine::protocol::TextContentMeta::ptr)
        .field("exists", &engine::protocol::TextContentMeta::exists);

    emscripten::value_object<engine::text::TextStyleSnapshot>("TextStyleSnapshot")
        .field("selectionStartLogical", &engine::text::TextStyleSnapshot::selectionStartLogical)
        .field("selectionEndLogical", &engine::text::TextStyleSnapshot::selectionEndLogical)
        .field("selectionStartByte", &engine::text::TextStyleSnapshot::selectionStartByte)
        .field("selectionEndByte", &engine::text::TextStyleSnapshot::selectionEndByte)
        .field("caretLogical", &engine::text::TextStyleSnapshot::caretLogical)
        .field("caretByte", &engine::text::TextStyleSnapshot::caretByte)
        .field("lineIndex", &engine::text::TextStyleSnapshot::lineIndex)
        .field("x", &engine::text::TextStyleSnapshot::x)
        .field("y", &engine::text::TextStyleSnapshot::y)
        .field("lineHeight", &engine::text::TextStyleSnapshot::lineHeight)
        .field("styleTriStateFlags", &engine::text::TextStyleSnapshot::styleTriStateFlags)
        .field("align", &engine::text::TextStyleSnapshot::align)
        .field("fontIdTriState", &engine::text::TextStyleSnapshot::fontIdTriState)
        .field("fontSizeTriState", &engine::text::TextStyleSnapshot::fontSizeTriState)
        .field("fontId", &engine::text::TextStyleSnapshot::fontId)
        .field("fontSize", &engine::text::TextStyleSnapshot::fontSize)
        .field("textGeneration", &engine::text::TextStyleSnapshot::textGeneration)
        .field("styleTriStateParamsLen", &engine::text::TextStyleSnapshot::styleTriStateParamsLen);

    emscripten::value_object<TextBoundsResult>("TextBoundsResult")
        .field("minX", &TextBoundsResult::minX)
        .field("minY", &TextBoundsResult::minY)
        .field("maxX", &TextBoundsResult::maxX)
        .field("maxY", &TextBoundsResult::maxY)
        .field("valid", &TextBoundsResult::valid);

    emscripten::value_object<CadEngine::TextSelectionRect>("TextSelectionRect")
        .field("x", &CadEngine::TextSelectionRect::x)
        .field("y", &CadEngine::TextSelectionRect::y)
        .field("width", &CadEngine::TextSelectionRect::width)
        .field("height", &CadEngine::TextSelectionRect::height)
        .field("lineIndex", &CadEngine::TextSelectionRect::lineIndex);

    emscripten::value_object<CadEngine::TextEntityMeta>("TextEntityMeta")
        .field("id", &CadEngine::TextEntityMeta::id)
        .field("boxMode", &CadEngine::TextEntityMeta::boxMode)
        .field("constraintWidth", &CadEngine::TextEntityMeta::constraintWidth)
        .field("rotation", &CadEngine::TextEntityMeta::rotation);

    emscripten::register_vector<PickResult>("VectorPickResult");
    emscripten::register_vector<std::uint32_t>("VectorUInt32");
    emscripten::register_vector<CadEngine::TextSelectionRect>("VectorTextSelectionRect");
    emscripten::register_vector<CadEngine::TextEntityMeta>("VectorTextEntityMeta");
    emscripten::register_vector<LayerRecord>("VectorLayerRecord");
}
#endif
