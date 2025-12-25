#pragma once

#include "engine/text/text_store.h"
#include "engine/text/font_manager.h"
#include "engine/text/text_layout.h"
#include "engine/text/glyph_atlas.h"
#include "engine/text/text_style_contract.h"
#include <vector>

class TextSystem {
public:
    engine::text::TextStore store;
    engine::text::FontManager fontManager;
    engine::text::TextLayoutEngine layoutEngine;
    engine::text::GlyphAtlas glyphAtlas;

    bool initialized{false};
    mutable std::vector<float> quadBuffer;
    mutable bool quadsDirty{true};

    TextSystem();

    void initialize();
    bool loadFont(std::uint32_t fontId, const void* data, std::size_t size);
    
    // Core text operations (delegates to store/layout)
    bool upsertText(std::uint32_t id, const TextPayloadHeader& hdr, const TextRunPayload* runs, std::uint32_t runCount, const char* content, std::uint32_t contentLen);
    bool deleteText(std::uint32_t id);
    bool insertContent(std::uint32_t textId, std::uint32_t insertIndex, const char* content, std::uint32_t byteLen);
    bool deleteContent(std::uint32_t textId, std::uint32_t startIndex, std::uint32_t endIndex);
    
    // Styling
    bool applyTextStyle(const engine::text::ApplyTextStylePayload& payload, const std::uint8_t* params, std::uint32_t paramsLen);
    bool setTextAlign(std::uint32_t textId, TextAlign align);

    // Queries
    TextHitResult hitTest(std::uint32_t textId, float localX, float localY) const;
    TextCaretPosition getCaretPosition(std::uint32_t textId, std::uint32_t charIndex) const;
    bool getBounds(std::uint32_t textId, float& minX, float& minY, float& maxX, float& maxY);
    
    // Rendering
    void rebuildQuadBuffer();
    bool isAtlasDirty() const;
    void clearAtlasDirty();
    
    // Navigation
    std::uint32_t getVisualPrevCharIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getVisualNextCharIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getWordLeftIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getWordRightIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineStartIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineEndIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineUpIndex(std::uint32_t textId, std::uint32_t charIndex) const;
    std::uint32_t getLineDownIndex(std::uint32_t textId, std::uint32_t charIndex) const;

private:
   // Helper for UTF-8 logical/byte mapping if needed (or keep in cpp)
};
