#ifdef EMSCRIPTEN
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#endif

// Include the engine public API header for bindings.
#include "engine/engine.h"
#include "engine/pick_system.h" // For PickResult definition

#ifdef EMSCRIPTEN
struct TextBoundsResult {
    float minX, minY, maxX, maxY;
    bool valid;
};

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
        .value("Resize", CadEngine::TransformMode::Resize);

    emscripten::enum_<CadEngine::TransformOpCode>("TransformOpCode")
        .value("MOVE", CadEngine::TransformOpCode::MOVE)
        .value("VERTEX_SET", CadEngine::TransformOpCode::VERTEX_SET)
        .value("RESIZE", CadEngine::TransformOpCode::RESIZE);

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
        .function("getSnapshotBufferMeta", &CadEngine::getSnapshotBufferMeta)
        .function("pick", &CadEngine::pick)
        .function("pickEx", &CadEngine::pickEx)
        .function("queryArea", &CadEngine::queryArea)
        .function("getStats", &CadEngine::getStats)
        // Text system methods
        .function("initializeTextSystem", &CadEngine::initializeTextSystem)
        .function("loadFont", &CadEngine::loadFont)
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
        .function("getTextStyleSnapshot", &CadEngine::getTextStyleSnapshot)
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
        .function("beginTransform", emscripten::optional_override([](CadEngine& self, std::uintptr_t idsPtr, std::uint32_t idCount, int mode, std::uint32_t specificId, int32_t vertexIndex, float startX, float startY) {
            self.beginTransform(reinterpret_cast<const std::uint32_t*>(idsPtr), idCount, static_cast<CadEngine::TransformMode>(mode), specificId, vertexIndex, startX, startY);
        }))
        .function("updateTransform", &CadEngine::updateTransform)
        .function("commitTransform", &CadEngine::commitTransform)
        .function("cancelTransform", &CadEngine::cancelTransform)
        .function("isInteractionActive", &CadEngine::isInteractionActive)
        .function("getCommitResultCount", &CadEngine::getCommitResultCount)
        .function("getCommitResultIdsPtr", &CadEngine::getCommitResultIdsPtr)
        .function("getCommitResultOpCodesPtr", &CadEngine::getCommitResultOpCodesPtr)
        .function("getCommitResultPayloadsPtr", &CadEngine::getCommitResultPayloadsPtr);
    
    // ... values ...

    emscripten::value_object<PickResult>("PickResult")
        .field("id", &PickResult::id)
        .field("kind", &PickResult::kind)
        .field("subTarget", &PickResult::subTarget)
        .field("subIndex", &PickResult::subIndex)
        .field("distance", &PickResult::distance)
        .field("hitX", &PickResult::hitX)
        .field("hitY", &PickResult::hitY);

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

    emscripten::value_object<CadEngine::EngineStats>("EngineStats")
        .field("generation", &CadEngine::EngineStats::generation)
        .field("rectCount", &CadEngine::EngineStats::rectCount)
        .field("lineCount", &CadEngine::EngineStats::lineCount)
        .field("polylineCount", &CadEngine::EngineStats::polylineCount)
        .field("pointCount", &CadEngine::EngineStats::pointCount)
        .field("triangleVertexCount", &CadEngine::EngineStats::triangleVertexCount)
        .field("lineVertexCount", &CadEngine::EngineStats::lineVertexCount)
        .field("lastLoadMs", &CadEngine::EngineStats::lastLoadMs)
        .field("lastRebuildMs", &CadEngine::EngineStats::lastRebuildMs)
        .field("lastApplyMs", &CadEngine::EngineStats::lastApplyMs);

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

    emscripten::register_vector<std::uint32_t>("VectorUInt32");
    emscripten::register_vector<CadEngine::TextSelectionRect>("VectorTextSelectionRect");
}
#endif
