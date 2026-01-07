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

    emscripten::enum_<CadEngine::SelectionMode>("SelectionMode")
        .value("Replace", CadEngine::SelectionMode::Replace)
        .value("Add", CadEngine::SelectionMode::Add)
        .value("Remove", CadEngine::SelectionMode::Remove)
        .value("Toggle", CadEngine::SelectionMode::Toggle);

    emscripten::enum_<CadEngine::SelectionModifier>("SelectionModifier")
        .value("Shift", CadEngine::SelectionModifier::Shift)
        .value("Ctrl", CadEngine::SelectionModifier::Ctrl)
        .value("Alt", CadEngine::SelectionModifier::Alt)
        .value("Meta", CadEngine::SelectionModifier::Meta);

    emscripten::enum_<CadEngine::MarqueeMode>("MarqueeMode")
        .value("Window", CadEngine::MarqueeMode::Window)
        .value("Crossing", CadEngine::MarqueeMode::Crossing);

    emscripten::enum_<CadEngine::ReorderAction>("ReorderAction")
        .value("BringToFront", CadEngine::ReorderAction::BringToFront)
        .value("SendToBack", CadEngine::ReorderAction::SendToBack)
        .value("BringForward", CadEngine::ReorderAction::BringForward)
        .value("SendBackward", CadEngine::ReorderAction::SendBackward);

    emscripten::enum_<CadEngine::EngineCapability>("EngineCapability")
        .value("HAS_QUERY_MARQUEE", CadEngine::EngineCapability::HAS_QUERY_MARQUEE)
        .value("HAS_RESIZE_HANDLES", CadEngine::EngineCapability::HAS_RESIZE_HANDLES)
        .value("HAS_TRANSFORM_RESIZE", CadEngine::EngineCapability::HAS_TRANSFORM_RESIZE);

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
        .function("canUndo", &CadEngine::canUndo)
        .function("canRedo", &CadEngine::canRedo)
        .function("undo", &CadEngine::undo)
        .function("redo", &CadEngine::redo)
        .function("pollEvents", &CadEngine::pollEvents)
        .function("ackResync", &CadEngine::ackResync)
        .function("hasPendingEvents", &CadEngine::hasPendingEvents)
        .function("getSelectionOutlineMeta", &CadEngine::getSelectionOutlineMeta)
        .function("getSelectionHandleMeta", &CadEngine::getSelectionHandleMeta)
        .function("getSnapOverlayMeta", &CadEngine::getSnapOverlayMeta)
        .function("getEntityAabb", &CadEngine::getEntityAabb)
        .function("getSelectionBounds", &CadEngine::getSelectionBounds)
        .function("getEntityTransform", &CadEngine::getEntityTransform)
        .function("setEntityPosition", &CadEngine::setEntityPosition)
        .function("setEntitySize", &CadEngine::setEntitySize)
        .function("setEntityRotation", &CadEngine::setEntityRotation)
        .function("setEntityLength", &CadEngine::setEntityLength)
        .function("getLayersSnapshot", &CadEngine::getLayersSnapshot)
        .function("getLayerName", &CadEngine::getLayerName)
        .function("getLayerStyle", &CadEngine::getLayerStyle)
        .function("setLayerProps", &CadEngine::setLayerProps)
        .function("deleteLayer", &CadEngine::deleteLayer)
        .function("getEntityFlags", &CadEngine::getEntityFlags)
        .function("setEntityFlags", &CadEngine::setEntityFlags)
        .function("setEntityLayer", &CadEngine::setEntityLayer)
        .function("getEntityLayer", &CadEngine::getEntityLayer)
        .function("getSelectionIds", &CadEngine::getSelectionIds)
        .function("getSelectionGeneration", &CadEngine::getSelectionGeneration)
        .function("getSelectionStyleSummary", &CadEngine::getSelectionStyleSummary)
        .function("clearSelection", &CadEngine::clearSelection)
        .function("setSelection", emscripten::optional_override([](CadEngine& self, std::uintptr_t idsPtr, std::uint32_t idCount, int mode) {
            self.setSelection(reinterpret_cast<const std::uint32_t*>(idsPtr), idCount, static_cast<CadEngine::SelectionMode>(mode));
        }))
        .function("selectByPick", &CadEngine::selectByPick)
        .function("marqueeSelect", &CadEngine::marqueeSelect)
        .function("getDrawOrderSnapshot", &CadEngine::getDrawOrderSnapshot)
        .function("reorderEntities", emscripten::optional_override([](CadEngine& self, std::uintptr_t idsPtr, std::uint32_t idCount, int action, std::uint32_t refId) {
            self.reorderEntities(reinterpret_cast<const std::uint32_t*>(idsPtr), idCount, static_cast<CadEngine::ReorderAction>(action), refId);
        }))
        .function("pick", &CadEngine::pick)
        .function("pickEx", &CadEngine::pickEx)
        .function("queryArea", &CadEngine::queryArea)
        .function("queryMarquee", &CadEngine::queryMarquee)
        .function("getStats", &CadEngine::getStats)
        .function("setSnapOptions", &CadEngine::setSnapOptions)
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

    emscripten::value_object<CadEngine::ProtocolInfo>("ProtocolInfo")
        .field("protocolVersion", &CadEngine::ProtocolInfo::protocolVersion)
        .field("commandVersion", &CadEngine::ProtocolInfo::commandVersion)
        .field("snapshotVersion", &CadEngine::ProtocolInfo::snapshotVersion)
        .field("eventStreamVersion", &CadEngine::ProtocolInfo::eventStreamVersion)
        .field("abiHash", &CadEngine::ProtocolInfo::abiHash)
        .field("featureFlags", &CadEngine::ProtocolInfo::featureFlags);

    emscripten::value_object<LayerRecord>("LayerRecord")
        .field("id", &LayerRecord::id)
        .field("order", &LayerRecord::order)
        .field("flags", &LayerRecord::flags);

    emscripten::value_object<CadEngine::BufferMeta>("BufferMeta")
        .field("generation", &CadEngine::BufferMeta::generation)
        .field("vertexCount", &CadEngine::BufferMeta::vertexCount)
        .field("capacity", &CadEngine::BufferMeta::capacity)
        .field("floatCount", &CadEngine::BufferMeta::floatCount)
        .field("ptr", &CadEngine::BufferMeta::ptr);

    emscripten::value_object<CadEngine::ByteBufferMeta>("ByteBufferMeta")
        .field("generation", &CadEngine::ByteBufferMeta::generation)
        .field("byteCount", &CadEngine::ByteBufferMeta::byteCount)
        .field("ptr", &CadEngine::ByteBufferMeta::ptr);

    emscripten::value_object<CadEngine::EngineEvent>("EngineEvent")
        .field("type", &CadEngine::EngineEvent::type)
        .field("flags", &CadEngine::EngineEvent::flags)
        .field("a", &CadEngine::EngineEvent::a)
        .field("b", &CadEngine::EngineEvent::b)
        .field("c", &CadEngine::EngineEvent::c)
        .field("d", &CadEngine::EngineEvent::d);

    emscripten::value_object<CadEngine::EventBufferMeta>("EventBufferMeta")
        .field("generation", &CadEngine::EventBufferMeta::generation)
        .field("count", &CadEngine::EventBufferMeta::count)
        .field("ptr", &CadEngine::EventBufferMeta::ptr);

    emscripten::value_object<CadEngine::DocumentDigest>("DocumentDigest")
        .field("lo", &CadEngine::DocumentDigest::lo)
        .field("hi", &CadEngine::DocumentDigest::hi);

    emscripten::value_object<CadEngine::HistoryMeta>("HistoryMeta")
        .field("depth", &CadEngine::HistoryMeta::depth)
        .field("cursor", &CadEngine::HistoryMeta::cursor)
        .field("generation", &CadEngine::HistoryMeta::generation);

    emscripten::value_object<CadEngine::StyleTargetSummary>("StyleTargetSummary")
        .field("state", &CadEngine::StyleTargetSummary::state)
        .field("enabledState", &CadEngine::StyleTargetSummary::enabledState)
        .field("supportedState", &CadEngine::StyleTargetSummary::supportedState)
        .field("reserved", &CadEngine::StyleTargetSummary::reserved)
        .field("colorRGBA", &CadEngine::StyleTargetSummary::colorRGBA)
        .field("layerId", &CadEngine::StyleTargetSummary::layerId);

    emscripten::value_object<CadEngine::SelectionStyleSummary>("SelectionStyleSummary")
        .field("selectionCount", &CadEngine::SelectionStyleSummary::selectionCount)
        .field("stroke", &CadEngine::SelectionStyleSummary::stroke)
        .field("fill", &CadEngine::SelectionStyleSummary::fill)
        .field("textColor", &CadEngine::SelectionStyleSummary::textColor)
        .field("textBackground", &CadEngine::SelectionStyleSummary::textBackground);

    emscripten::value_object<CadEngine::LayerStyleSnapshot>("LayerStyleSnapshot")
        .field("strokeRGBA", &CadEngine::LayerStyleSnapshot::strokeRGBA)
        .field("fillRGBA", &CadEngine::LayerStyleSnapshot::fillRGBA)
        .field("textColorRGBA", &CadEngine::LayerStyleSnapshot::textColorRGBA)
        .field("textBackgroundRGBA", &CadEngine::LayerStyleSnapshot::textBackgroundRGBA)
        .field("strokeEnabled", &CadEngine::LayerStyleSnapshot::strokeEnabled)
        .field("fillEnabled", &CadEngine::LayerStyleSnapshot::fillEnabled)
        .field("textBackgroundEnabled", &CadEngine::LayerStyleSnapshot::textBackgroundEnabled)
        .field("reserved", &CadEngine::LayerStyleSnapshot::reserved);

    emscripten::value_object<CadEngine::EngineStats>("EngineStats")
        .field("generation", &CadEngine::EngineStats::generation)
        .field("rectCount", &CadEngine::EngineStats::rectCount)
        .field("lineCount", &CadEngine::EngineStats::lineCount)
        .field("polylineCount", &CadEngine::EngineStats::polylineCount)
        .field("pointCount", &CadEngine::EngineStats::pointCount)
        .field("triangleVertexCount", &CadEngine::EngineStats::triangleVertexCount)
        .field("lineVertexCount", &CadEngine::EngineStats::lineVertexCount)
        .field("rebuildAllGeometryCount", &CadEngine::EngineStats::rebuildAllGeometryCount)
        .field("lastLoadMs", &CadEngine::EngineStats::lastLoadMs)
        .field("lastRebuildMs", &CadEngine::EngineStats::lastRebuildMs)
        .field("lastApplyMs", &CadEngine::EngineStats::lastApplyMs)
        .field("lastTransformUpdateMs", &CadEngine::EngineStats::lastTransformUpdateMs)
        .field("lastSnapCandidateCount", &CadEngine::EngineStats::lastSnapCandidateCount)
        .field("lastSnapHitCount", &CadEngine::EngineStats::lastSnapHitCount);

    emscripten::value_object<CadEngine::OverlayBufferMeta>("OverlayBufferMeta")
        .field("generation", &CadEngine::OverlayBufferMeta::generation)
        .field("primitiveCount", &CadEngine::OverlayBufferMeta::primitiveCount)
        .field("floatCount", &CadEngine::OverlayBufferMeta::floatCount)
        .field("primitivesPtr", &CadEngine::OverlayBufferMeta::primitivesPtr)
        .field("dataPtr", &CadEngine::OverlayBufferMeta::dataPtr);

    emscripten::value_object<CadEngine::EntityAabb>("EntityAabb")
        .field("minX", &CadEngine::EntityAabb::minX)
        .field("minY", &CadEngine::EntityAabb::minY)
        .field("maxX", &CadEngine::EntityAabb::maxX)
        .field("maxY", &CadEngine::EntityAabb::maxY)
        .field("valid", &CadEngine::EntityAabb::valid);

    emscripten::value_object<CadEngine::EntityTransform>("EntityTransform")
        .field("posX", &CadEngine::EntityTransform::posX)
        .field("posY", &CadEngine::EntityTransform::posY)
        .field("width", &CadEngine::EntityTransform::width)
        .field("height", &CadEngine::EntityTransform::height)
        .field("rotationDeg", &CadEngine::EntityTransform::rotationDeg)
        .field("hasRotation", &CadEngine::EntityTransform::hasRotation)
        .field("valid", &CadEngine::EntityTransform::valid);

    emscripten::value_object<DraftDimensions>("DraftDimensions")
        .field("minX", &DraftDimensions::minX)
        .field("minY", &DraftDimensions::minY)
        .field("maxX", &DraftDimensions::maxX)
        .field("maxY", &DraftDimensions::maxY)
        .field("width", &DraftDimensions::width)
        .field("height", &DraftDimensions::height)
        .field("centerX", &DraftDimensions::centerX)
        .field("centerY", &DraftDimensions::centerY)
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

    emscripten::value_object<CadEngine::TextureBufferMeta>("TextureBufferMeta")
        .field("generation", &CadEngine::TextureBufferMeta::generation)
        .field("width", &CadEngine::TextureBufferMeta::width)
        .field("height", &CadEngine::TextureBufferMeta::height)
        .field("byteCount", &CadEngine::TextureBufferMeta::byteCount)
        .field("ptr", &CadEngine::TextureBufferMeta::ptr);

    emscripten::value_object<CadEngine::TextContentMeta>("TextContentMeta")
        .field("byteCount", &CadEngine::TextContentMeta::byteCount)
        .field("ptr", &CadEngine::TextContentMeta::ptr)
        .field("exists", &CadEngine::TextContentMeta::exists);

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

    emscripten::register_vector<std::uint32_t>("VectorUInt32");
    emscripten::register_vector<CadEngine::TextSelectionRect>("VectorTextSelectionRect");
    emscripten::register_vector<CadEngine::TextEntityMeta>("VectorTextEntityMeta");
    emscripten::register_vector<LayerRecord>("VectorLayerRecord");
}
#endif
