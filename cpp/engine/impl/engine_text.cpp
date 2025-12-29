// CadEngine text system wrapper methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"
#include "engine/text/text_types.h"

bool CadEngine::initializeTextSystem() {
    textSystem_.initialize();
    markTextQuadsDirty();
    return true;
}

bool CadEngine::loadFont(std::uint32_t fontId, std::uintptr_t fontDataPtr, std::size_t dataSize) {
    const std::uint8_t* fontData = reinterpret_cast<const std::uint8_t*>(fontDataPtr);
    if (!textSystem_.initialized) {
        if (!initializeTextSystem()) {
            return false;
        }
    }
    // Use registerFont to associate with specific fontId
    bool ok = textSystem_.fontManager.registerFont(fontId, fontData, dataSize, "", false, false);
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
    if (!textSystem_.initialized) {
        if (!initializeTextSystem()) {
            if (historyStarted) discardHistoryEntry();
            return false;
        }
    }
    
    // Register in entity map if new or replacing non-text
    auto it = entityManager_.entities.find(id);
    bool isNew = (it == entityManager_.entities.end());
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
    if (!textSystem_.upsertText(id, header, runs, runCount, content, contentLength)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    if (isNew) {
        entityManager_.registerTextEntity(id);
    } else {
        entityManager_.ensureEntityMetadata(id);
    }
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(id, minX, minY, maxX, maxY)) {
        pickSystem_.update(id, {minX, minY, maxX, maxY});
    }
    if (isNew) pickSystem_.setZ(id, pickSystem_.getMaxZ());
    if (isNew) {
        recordEntityCreated(id, static_cast<std::uint32_t>(EntityKind::Text));
    } else {
        recordEntityChanged(id,
            static_cast<std::uint32_t>(ChangeMask::Text)
            | static_cast<std::uint32_t>(ChangeMask::Bounds)
            | static_cast<std::uint32_t>(ChangeMask::Style));
    }
    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::deleteText(std::uint32_t id) {
    const bool historyStarted = beginHistoryEntry();
    auto it = entityManager_.entities.find(id);
    if (it == entityManager_.entities.end() || it->second.kind != EntityKind::Text) {
        if (historyStarted) commitHistoryEntry();
        return false;
    }

    markEntityChange(id);
    markDrawOrderChange();
    
    // Use TextSystem to delete
    textSystem_.deleteText(id);
    
    entityManager_.deleteEntity(id);
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    pickSystem_.remove(id);
    selectionManager_.prune(*this);
    recordEntityDeleted(id);

    if (historyStarted) commitHistoryEntry();
    return true;
}

void CadEngine::setTextCaret(std::uint32_t textId, std::uint32_t caretIndex) {
    textSystem_.store.setCaret(textId, caretIndex);
}

void CadEngine::setTextSelection(std::uint32_t textId, std::uint32_t selectionStart, std::uint32_t selectionEnd) {
    textSystem_.store.setSelection(textId, selectionStart, selectionEnd);
}

bool CadEngine::insertTextContent(
    std::uint32_t textId,
    std::uint32_t insertIndex,
    const char* content,
    std::uint32_t byteLength
) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    if (!textSystem_.insertContent(textId, insertIndex, content, byteLength)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;
    
    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));

    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::deleteTextContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    if (!textSystem_.deleteContent(textId, startIndex, endIndex)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));
    
    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::setTextAlign(std::uint32_t textId, TextAlign align) {
    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    if (!textSystem_.setTextAlign(textId, align)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }
    
    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));
    
    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::setTextConstraintWidth(std::uint32_t textId, float width) {
    if (!textSystem_.initialized) return false;

    const bool historyStarted = beginHistoryEntry();
    markEntityChange(textId);
    if (!textSystem_.store.setConstraintWidth(textId, width)) {
        if (historyStarted) discardHistoryEntry();
        return false;
    }

    // Re-layout immediately to ensure up-to-date bounds
    textSystem_.layoutEngine.layoutText(textId);

    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));

    if (historyStarted) commitHistoryEntry();
    return true;
}

bool CadEngine::setTextPosition(std::uint32_t textId, float x, float y, TextBoxMode boxMode, float constraintWidth) {
    if (!textSystem_.initialized) return false;

    TextRec* rec = textSystem_.store.getTextMutable(textId);
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
    textSystem_.store.markDirty(textId);

    renderDirty = true;
    snapshotDirty = true;
    markTextQuadsDirty();
    generation++;

    float minX, minY, maxX, maxY;
    if (textSystem_.getBounds(textId, minX, minY, maxX, maxY)) {
        pickSystem_.update(textId, {minX, minY, maxX, maxY});
    }
    recordEntityChanged(textId,
        static_cast<std::uint32_t>(ChangeMask::Text)
        | static_cast<std::uint32_t>(ChangeMask::Bounds));

    if (historyStarted) commitHistoryEntry();
    return true;
}

TextCaretPosition CadEngine::getTextCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const {
    if (!textSystem_.initialized) {
        return TextCaretPosition{0.0f, 0.0f, 0.0f, 0};
    }
    return textSystem_.layoutEngine.getCaretPosition(textId, charIndex);
}

bool CadEngine::getTextBounds(std::uint32_t textId, float& outMinX, float& outMinY, float& outMaxX, float& outMaxY) const {
    // Ensure layout is up-to-date before returning bounds
    // Note: This is safe even if text wasn't dirty (no-op in that case)
    const_cast<CadEngine*>(this)->textSystem_.layoutEngine.layoutDirtyTexts();
    
    const TextRec* text = textSystem_.store.getText(textId);
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
    textSystem_.rebuildQuadBuffer([this](std::uint32_t textId) {
        return entityManager_.isEntityVisible(textId);
    }, entityManager_.drawOrderIds);
}

CadEngine::BufferMeta CadEngine::getTextQuadBufferMeta() const noexcept {
    constexpr std::size_t floatsPerVertex = 9; // x, y, z, u, v, r, g, b, a
    return buildMeta(textSystem_.quadBuffer, floatsPerVertex);
}

CadEngine::TextureBufferMeta CadEngine::getAtlasTextureMeta() const noexcept {
    if (!textSystem_.initialized) {
        return TextureBufferMeta{0, 0, 0, 0, 0};
    }
    return TextureBufferMeta{
        textSystem_.glyphAtlas.getVersion(),
        textSystem_.glyphAtlas.getWidth(),
        textSystem_.glyphAtlas.getHeight(),
        static_cast<std::uint32_t>(textSystem_.glyphAtlas.getTextureDataSize()),
        reinterpret_cast<std::uintptr_t>(textSystem_.glyphAtlas.getTextureData())
    };
}

bool CadEngine::isAtlasDirty() const noexcept {
    if (!textSystem_.initialized) return false;
    return textSystem_.glyphAtlas.isDirty();
}

void CadEngine::clearAtlasDirty() {
    textSystem_.clearAtlasDirty();
}

CadEngine::TextContentMeta CadEngine::getTextContentMeta(std::uint32_t textId) const noexcept {
    if (!textSystem_.initialized) {
        return TextContentMeta{0, 0, false};
    }
    
    std::string_view content = textSystem_.store.getContent(textId);
    if (content.data() == nullptr) {
        return TextContentMeta{0, 0, false};
    }
    
    return TextContentMeta{
        static_cast<std::uint32_t>(content.size()),
        reinterpret_cast<std::uintptr_t>(content.data()),
        true
    };
}

std::vector<CadEngine::TextEntityMeta> CadEngine::getAllTextMetas() const {
    if (!textSystem_.initialized) {
        return {};
    }
    
    // We iterate the entity manager to find all Text entities
    std::vector<TextEntityMeta> result;
    // Estimate size to avoid reallocs (heuristic: 10% of entities are text? or just reserve 64)
    result.reserve(64); 

    for (const auto& kv : entityManager_.entities) {
        if (kv.second.kind == EntityKind::Text) {
            const std::uint32_t id = kv.first;
            const auto* r = textSystem_.store.getText(id);
            if (r) {
                result.push_back(TextEntityMeta{
                    id,
                    r->boxMode,
                    r->constraintWidth
                });
            }
        }
    }
    return result;
}

std::vector<CadEngine::TextSelectionRect> CadEngine::getTextSelectionRects(std::uint32_t textId, std::uint32_t start, std::uint32_t end) const {
    if (!textSystem_.initialized) {
        return {};
    }
    // Ensure layout is up to date since this might be called right after input/styling
    const_cast<CadEngine*>(this)->textSystem_.layoutEngine.layoutDirtyTexts();
    return textSystem_.layoutEngine.getSelectionRects(textId, start, end);
}

std::uint32_t CadEngine::getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getVisualPrevCharIndex(textId, charIndex);
}

std::uint32_t CadEngine::getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getVisualNextCharIndex(textId, charIndex);
}

std::uint32_t CadEngine::getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getWordLeftIndex(textId, charIndex);
}

std::uint32_t CadEngine::getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getWordRightIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineStartIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineEndIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineUpIndex(textId, charIndex);
}

std::uint32_t CadEngine::getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const {
    return textSystem_.getLineDownIndex(textId, charIndex);
}

TextHitResult CadEngine::hitTestText(std::uint32_t textId, float localX, float localY) const {
    return textSystem_.hitTest(textId, localX, localY);
}

#include "engine/internal/engine_state_aliases_undef.h"
