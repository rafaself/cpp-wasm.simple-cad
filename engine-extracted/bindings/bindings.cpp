#ifdef EMSCRIPTEN
#include <emscripten/bind.h>
#include <emscripten/emscripten.h>
#include <emscripten/val.h>
#endif

#include "engine/engine.h"
#include "engine/interaction/pick_system.h"

#ifndef ENGINE_FEATURE_POLYLINE
#define ENGINE_FEATURE_POLYLINE 1
#endif

#ifndef ENGINE_FEATURE_CIRCLE
#define ENGINE_FEATURE_CIRCLE 1
#endif

#ifndef ENGINE_FEATURE_POLYGON
#define ENGINE_FEATURE_POLYGON 1
#endif

#ifndef ENGINE_FEATURE_ROTATE
#define ENGINE_FEATURE_ROTATE 1
#endif

#ifndef ENGINE_FEATURE_VERTEX_EDIT
#define ENGINE_FEATURE_VERTEX_EDIT 1
#endif

#ifndef ENGINE_FEATURE_TEXT_EDITING
#define ENGINE_FEATURE_TEXT_EDITING 1
#endif

#ifdef EMSCRIPTEN
EMSCRIPTEN_BINDINGS(cad_engine_module) {
    emscripten::enum_<TextBoxMode>("TextBoxMode")
        .value("AutoWidth", TextBoxMode::AutoWidth)
        .value("FixedWidth", TextBoxMode::FixedWidth);

    emscripten::enum_<PickSubTarget>("PickSubTarget")
        .value("None", PickSubTarget::None)
        .value("Body", PickSubTarget::Body)
        .value("Edge", PickSubTarget::Edge)
        .value("Vertex", PickSubTarget::Vertex)
        .value("ResizeHandle", PickSubTarget::ResizeHandle)
#if ENGINE_FEATURE_ROTATE
        .value("RotateHandle", PickSubTarget::RotateHandle)
#endif
        .value("TextBody", PickSubTarget::TextBody)
#if ENGINE_FEATURE_TEXT_EDITING
        .value("TextCaret", PickSubTarget::TextCaret)
#endif
        ;

    emscripten::enum_<PickEntityKind>("PickEntityKind")
        .value("Unknown", PickEntityKind::Unknown)
        .value("Rect", PickEntityKind::Rect)
#if ENGINE_FEATURE_CIRCLE
        .value("Circle", PickEntityKind::Circle)
#endif
        .value("Line", PickEntityKind::Line)
#if ENGINE_FEATURE_POLYLINE
        .value("Polyline", PickEntityKind::Polyline)
#endif
#if ENGINE_FEATURE_POLYGON
        .value("Polygon", PickEntityKind::Polygon)
#endif
        .value("Arrow", PickEntityKind::Arrow)
        .value("Text", PickEntityKind::Text);

    emscripten::enum_<CadEngine::TransformMode>("TransformMode")
        .value("Move", CadEngine::TransformMode::Move)
#if ENGINE_FEATURE_VERTEX_EDIT
        .value("VertexDrag", CadEngine::TransformMode::VertexDrag)
        .value("EdgeDrag", CadEngine::TransformMode::EdgeDrag)
#endif
        .value("Resize", CadEngine::TransformMode::Resize)
#if ENGINE_FEATURE_ROTATE
        .value("Rotate", CadEngine::TransformMode::Rotate)
#endif
        .value("SideResize", CadEngine::TransformMode::SideResize);

    emscripten::enum_<CadEngine::TransformOpCode>("TransformOpCode")
        .value("MOVE", CadEngine::TransformOpCode::MOVE)
#if ENGINE_FEATURE_VERTEX_EDIT
        .value("VERTEX_SET", CadEngine::TransformOpCode::VERTEX_SET)
#endif
        .value("RESIZE", CadEngine::TransformOpCode::RESIZE)
#if ENGINE_FEATURE_ROTATE
        .value("ROTATE", CadEngine::TransformOpCode::ROTATE)
#endif
        .value("SIDE_RESIZE", CadEngine::TransformOpCode::SIDE_RESIZE);

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

    emscripten::enum_<engine::protocol::ReorderAction>("ReorderAction")
        .value("BringToFront", engine::protocol::ReorderAction::BringToFront)
        .value("SendToBack", engine::protocol::ReorderAction::SendToBack)
        .value("BringForward", engine::protocol::ReorderAction::BringForward)
        .value("SendBackward", engine::protocol::ReorderAction::SendBackward);

    emscripten::class_<CadEngine>("CadEngine")
        .constructor<>()
        .function("clear", &CadEngine::clear)
        .function("allocBytes", &CadEngine::allocBytes)
        .function("freeBytes", &CadEngine::freeBytes)
        .function("applyCommandBuffer", &CadEngine::applyCommandBuffer)
        .function("loadSnapshotFromPtr", &CadEngine::loadSnapshotFromPtr)
        .function("saveSnapshot", &CadEngine::saveSnapshot)
        .function("getSnapshotBufferMeta", &CadEngine::getSnapshotBufferMeta)
        .function("getFullSnapshotMeta", &CadEngine::getFullSnapshotMeta)
        .function("allocateEntityId", &CadEngine::allocateEntityId)
        .function("getProtocolInfo", &CadEngine::getProtocolInfo)
        .function("getCapabilities", &CadEngine::getCapabilities)
        .function("getVertexCount", &CadEngine::getVertexCount)
        .function("getVertexDataPtr", &CadEngine::getVertexDataPtr)
        .function("getPositionBufferMeta", &CadEngine::getPositionBufferMeta)
        .function("getLineBufferMeta", &CadEngine::getLineBufferMeta)
        .function("pick", &CadEngine::pick)
        .function("pickEx", &CadEngine::pickEx)
        .function("pickCandidates", &CadEngine::pickCandidates)
        .function("pickSelectionHandle", &CadEngine::pickSelectionHandle)
        .function("pickSideHandle", &CadEngine::pickSideHandle)
        .function("getSelectionIds", &CadEngine::getSelectionIds)
        .function("setSelection", emscripten::optional_override([](CadEngine& self, std::uintptr_t idsPtr, std::uint32_t idCount, int mode) {
            self.setSelection(reinterpret_cast<const std::uint32_t*>(idsPtr), idCount, static_cast<engine::protocol::SelectionMode>(mode));
        }))
        .function("clearSelection", &CadEngine::clearSelection)
        .function("getDrawOrderSnapshot", &CadEngine::getDrawOrderSnapshot)
        .function("reorderEntities", emscripten::optional_override([](CadEngine& self, std::uintptr_t idsPtr, std::uint32_t idCount, int action, std::uint32_t refId) {
            self.reorderEntities(reinterpret_cast<const std::uint32_t*>(idsPtr), idCount, static_cast<engine::protocol::ReorderAction>(action), refId);
        }))
        .function("setEntityPosition", &CadEngine::setEntityPosition)
        .function("setEntitySize", &CadEngine::setEntitySize)
        .function("tryGetEntityGeomZ", emscripten::optional_override([](const CadEngine& self, std::uint32_t entityId) {
            float z = 0.0f;
            const bool ok = self.tryGetEntityGeomZ(entityId, z);
            emscripten::val result = emscripten::val::object();
            result.set("ok", ok);
            result.set("z", z);
            return result;
        }))
        .function("setEntityGeomZ", &CadEngine::setEntityGeomZ)
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
        .function("canUndo", &CadEngine::canUndo)
        .function("canRedo", &CadEngine::canRedo)
        .function("undo", &CadEngine::undo)
        .function("redo", &CadEngine::redo)
        .function("getHistoryMeta", &CadEngine::getHistoryMeta)
        .function("initializeTextSystem", &CadEngine::initializeTextSystem)
        .function("loadFont", &CadEngine::loadFont)
        .function("loadFontEx", &CadEngine::loadFontEx)
        .function("rebuildTextQuadBuffer", &CadEngine::rebuildTextQuadBuffer)
        .function("getTextQuadBufferMeta", &CadEngine::getTextQuadBufferMeta)
        .function("getAtlasTextureMeta", &CadEngine::getAtlasTextureMeta)
        .function("isAtlasDirty", &CadEngine::isAtlasDirty)
        .function("clearAtlasDirty", &CadEngine::clearAtlasDirty)
        .function("isTextQuadsDirty", &CadEngine::isTextQuadsDirty)
        .function("getTextContentMeta", &CadEngine::getTextContentMeta);

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

    emscripten::value_object<engine::protocol::HistoryMeta>("HistoryMeta")
        .field("depth", &engine::protocol::HistoryMeta::depth)
        .field("cursor", &engine::protocol::HistoryMeta::cursor)
        .field("generation", &engine::protocol::HistoryMeta::generation);

    emscripten::register_vector<PickResult>("VectorPickResult");
    emscripten::register_vector<std::uint32_t>("VectorUInt32");
}
#endif
