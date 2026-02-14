// CadEngine text system wrapper methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/text/text_types.h"

bool CadEngine::initializeTextSystem() {
    state().textSystem_.initialize();
    markTextQuadsDirty();
    return state().textSystem_.initialized;
}

bool CadEngine::loadFont(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize) {
    return loadFontEx(fontId, fontDataPtr, dataSize, false, false);
}

bool CadEngine::loadFontEx(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize, bool bold, bool italic) {
    const std::uint8_t* fontData = reinterpret_cast<const std::uint8_t*>(fontDataPtr);
    if (!state().textSystem_.initialized) {
        if (!initializeTextSystem()) {
            return false;
        }
    }
    // Use registerFont to associate with specific fontId and style flags
    bool ok = state().textSystem_.fontManager.registerFont(fontId, fontData, dataSize, "", bold, italic);
    if (ok) markTextQuadsDirty();
    return ok;
}

bool CadEngine::upsertText(
    std::uint32_t id,
    const TextPayloadHeader& header,
    const TextRunPayload* runs,
    std::uint32_t runCount,
    const char* content,
    std::uint32_t contentLength
) {
    const bool historyStarted = beginHistoryEntry();
    trackNextEntityId(id);
    if (!state().textSystem_.initialized) {
        if (!initializeTextSystem()) {
            if (historyStarted) discardHistoryEntry();
            return false;
        }
    }
    
    // Register in entity map if new or replacing non-text
    auto it = state().entityManager_.entities.find(id);
    bool isNew = (it == state().entityManager_.entities.end());
    const bool willChangeOrder = isNew || (it->second.kind != EntityKind::Text);
    if (willChangeOrder) {
        markDrawOrderChange();
    }
    markEntityChange(id);
    if (!isNew && it->second.kind != EntityKind::Text) {
        deleteEntity(id);
        isNew = true;
    }
    
    // Use TextSystem to upsert
    if (!state().textSystem_.upsertText(id, header, runs, runCount, content, contentLength)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    if (isNew) {
        state().entityManager_.registerTextEntity(id);
        EntityStyleOverrides& overrides = state().entityManager_.ensureEntityStyleOverrides(id);
        const LayerStyle layerStyle = state().entityManager_.layerStore.getLayerStyle(state().entityManager_.getEntityLayer(id));
        overrides.colorMask = 0;
        overrides.enabledMask = 0;
        if (runCount > 0 && runs) {
            unpackColorRGBA(runs[0].colorRGBA, overrides.textColor.r, overrides.textColor.g, overrides.textColor.b, overrides.textColor.a);
        } else {
            overrides.textColor = layerStyle.textColor.color;
        }
        overrides.textBackground = layerStyle.textBackground.color;
    } else {
        state().entityManager_.ensureEntityMetadata(id);
    }
    
    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(id, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(id, {minX, minY, maxX, maxY});
    }
    if (isNew) state().pickSystem_.setZ(id, state().pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Text));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds)
            | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style));
    }
    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::deleteText(std::uint32_t id) {
    const bool historyStarted = beginHistoryEntry();
    auto it = state().entityManager_.entities.find(id);
    if (it == state().entityManager_.entities.end() || it->second.kind != EntityKind::Text) {
        if (historyStarted) commitHistoryEntry();
        return false;
    }

    markEntityChange(id);
    markDrawOrderChange();
    
    // Use TextSystem to delete
    state().textSystem_.deleteText(id);
    
    state().entityManager_.deleteEntity(id);
    
    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    state().pickSystem_.remove(id);
    state().selectionManager_.prune(*this);
    recordEntityDeleted(id);

    if (historyStarted) commitHistoryEntry();
    return true;
}

void CadEngine::setTextCaret(std::uint32_t textId, std::uint32_t caretIndex) {
    state().textSystem_.store.setCaret(textId, caretIndex);
}

void CadEngine::setTextSelection(std::uint32_t textId, std::uint32_t selectionStart, std::uint32_t selectionEnd) {
    state().textSystem_.store.setSelection(textId, selectionStart, selectionEnd);
}

bool CadEngine::insertTextContent(
    std::uint32_t textId,
    std::uint32_t insertIndex,
    const char* content,
    std::uint32_t byteLength
) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    state().historyManager_.markTextEdit(textId);
    if (!state().textSystem_.insertContent(textId, insertIndex, content, byteLength)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;
    
    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));

    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::deleteTextContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    state().historyManager_.markTextEdit(textId);
    if (!state().textSystem_.deleteContent(textId, startIndex, endIndex)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    
    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::replaceTextContent(
    std::uint32_t textId,
    std::uint32_t startIndex,
    std::uint32_t endIndex,
    const char* content,
    std::uint32_t byteLength
) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    state().historyManager_.markTextEdit(textId);
    if (!state().textSystem_.replaceContent(textId, startIndex, endIndex, content, byteLength)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }

    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));

    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::setTextAlign(std::uint32_t textId, TextAlign align) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    if (!state().textSystem_.setTextAlign(textId, align)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));
    
    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::setTextConstraintWidth(std::uint32_t textId, float width) {
    if (!state().textSystem_.initialized) return false;

    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    if (!state().textSystem_.store.setConstraintWidth(textId, width)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }

    // Re-layout immediately to ensure up-to-date bounds
    state().textSystem_.layoutEngine.layoutText(textId);

    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));

    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::setTextPosition(std::uint32_t textId, float x, float y, TextBoxMode boxMode, float constraintWidth) {
    if (!state().textSystem_.initialized) return false;

    TextRec* rec = state().textSystem_.store.getTextMutable(textId);
    if (!rec) {
        return false;
    }

    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);

    rec->x = x;
    rec->y = y;
    rec->boxMode = boxMode;
    if (boxMode == TextBoxMode::FixedWidth) {
        rec->constraintWidth = constraintWidth;
    }

    // Mark dirty so layout refreshes bounds (min/max) and quads rebuild at new origin.
    state().textSystem_.store.markDirty(textId);

    state().renderDirty = true;
    state().snapshotDirty = true;
    markTextQuadsDirty();
    state().generation++;

    float minX, minY, maxX, maxY;
    if (state().textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        state().pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(engine::protocol::ChangeMask::Text)
        | static_cast<std::uint32_t>(engine::protocol::ChangeMask::Bounds));

    if (historyStarted) commitHistoryEntry();
    return true;
}

TextCaretPosition CadEngine::getTextCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!state().textSystem_.initialized) {
        return TextCaretPosition{0.0f, 0.0f, 0.0f, 0};
    }
    return state().textSystem_.layoutEngine.getCaretPosition(textId, charIndex);
}

bool CadEngine::getTextBounds(std::uint32_t textId, float& outMinX, float& outMinY, float& outMaxX, float& outMaxY) const {
    // Ensure layout is up-to-date before returning bounds
    // Note: This is safe even if text wasn't dirty (no-op in that case)
    const_cast<CadEngine*>(this)->state().textSystem_.layoutEngine.layoutDirtyTexts();
    
    const TextRec* text = state().textSystem_.store.getText(textId);
    if (!text) {
        return false;
    }
    outMinX = text->minX;
    outMinY = text->minY;
    outMaxX = text->maxX;
    outMaxY = text->maxY;
    return true;
}

void CadEngine::rebuildTextQuadBuffer() {
    state().textSystem_.rebuildQuadBuffer(
        [this](std::uint32_t textId) {
            return state().entityManager_.isEntityVisible(textId);
        },
        state().entityManager_.drawOrderIds,
        [this](std::uint32_t textId, TextSystem::ResolvedTextStyle& out) {
            const ResolvedStyle style = state().entityManager_.resolveStyle(textId, EntityKind::Text);
            out.textR = style.textColor.color.r;
            out.textG = style.textColor.color.g;
            out.textB = style.textColor.color.b;
            out.textA = style.textColor.color.a;
            out.backgroundR = style.textBackground.color.r;
            out.backgroundG = style.textBackground.color.g;
            out.backgroundB = style.textBackground.color.b;
            out.backgroundA = style.textBackground.color.a;
            out.backgroundEnabled = style.textBackground.enabled;
            return true;
        }
    );
}

engine::protocol::BufferMeta CadEngine::getTextQuadBufferMeta() const noexcept {
    constexpr std::size_t floatsPerVertex = 9; // x, y, z, u, v, r, g, b, a
    return buildMeta(state().textSystem_.quadBuffer, floatsPerVertex);
}

engine::protocol::TextureBufferMeta CadEngine::getAtlasTextureMeta() const noexcept {
    if (!state().textSystem_.initialized) {
        return engine::protocol::TextureBufferMeta{0, 0, 0, 0, 0};
    }
    return engine::protocol::TextureBufferMeta{
        state().textSystem_.glyphAtlas.getVersion(),
        state().textSystem_.glyphAtlas.getWidth(),
        state().textSystem_.glyphAtlas.getHeight(),
        static_cast<std::uint32_t>(state().textSystem_.glyphAtlas.getTextureDataSize()),
        reinterpret_cast<std::uintptr_t>(state().textSystem_.glyphAtlas.getTextureData())
    };
}

bool CadEngine::isAtlasDirty() const noexcept {
    if (!state().textSystem_.initialized) return false;
    return state().textSystem_.glyphAtlas.isDirty();
}

void CadEngine::clearAtlasDirty() {
    state().textSystem_.clearAtlasDirty();
}

engine::protocol::TextContentMeta CadEngine::getTextContentMeta(std::uint32_t textId) const noexcept {
    if (!state().textSystem_.initialized) {
        return engine::protocol::TextContentMeta{0, 0, false};
    }
    
    std::string_view content = state().textSystem_.store.getContent(textId);
    if (content.data() == nullptr) {
        return engine::protocol::TextContentMeta{0, 0, false};
    }
    
    return engine::protocol::TextContentMeta{
        static_cast<std::uint32_t>(content.size()),
        reinterpret_cast<std::uintptr_t>(content.data()),
        true
    };
}

std::vector<CadEngine::TextEntityMeta> CadEngine::getAllTextMetas() const {
    if (!state().textSystem_.initialized) {
        return {};
    }
    
    // We iterate the entity manager to find all Text entities
    std::vector<TextEntityMeta> result;
    // Estimate size to avoid reallocs (heuristic: 10% of entities are text? or just reserve 64)
    result.reserve(64); 

    for (const auto& kv : state().entityManager_.entities) {
        if (kv.second.kind == EntityKind::Text) {
            const std::uint32_t id = kv.first;
            const auto* r = state().textSystem_.store.getText(id);
            if (r) {
                result.push_back(TextEntityMeta{
                    id,
                    r->boxMode,
                    r->constraintWidth,
                    r->rotation
                });
            }
        }
    }
    return result;
}

std::vector<CadEngine::TextSelectionRect> CadEngine::getTextSelectionRects(std::uint32_t textId, std::uint32_t start, std::uint32_t end) const {
    if (!state().textSystem_.initialized) {
        return {};
    }
    // Ensure layout is up to date since this might be called right after input/styling
    const_cast<CadEngine*>(this)->state().textSystem_.layoutEngine.layoutDirtyTexts();
    return state().textSystem_.layoutEngine.getSelectionRects(textId, start, end);
}

std::uint32_t CadEngine::getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getVisualPrevCharIndex(textId, charIndex);
}

std::uint32_t CadEngine::getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getVisualNextCharIndex(textId, charIndex);
}

std::uint32_t CadEngine::getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getWordLeftIndex(textId, charIndex);
}

std::uint32_t CadEngine::getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getWordRightIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getLineStartIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getLineEndIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getLineUpIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return state().textSystem_.getLineDownIndex(textId, charIndex);
}

TextHitResult CadEngine::hitTestText(std::uint32_t textId, float localX, float localY) const {
    return state().textSystem_.hitTest(textId, localX, localY);
}

