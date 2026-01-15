#include "engine/text/text_layout.h"

#include <hb.h>
#include <hb-ft.h>

namespace engine::text {

TextLayoutEngine::TextLayoutEngine() = default;

TextLayoutEngine::~TextLayoutEngine() {
    if (hbBuffer_) {
        hb_buffer_destroy(hbBuffer_);
        hbBuffer_ = nullptr;
    }
}

void TextLayoutEngine::initialize(FontManager* fontManager, TextStore* textStore) {
    fontManager_ = fontManager;
    textStore_ = textStore;
    
    // Create reusable HarfBuzz buffer
    if (!hbBuffer_) {
        hbBuffer_ = hb_buffer_create();
    }
}

const TextLayout* TextLayoutEngine::getLayout(std::uint32_t textId) const {
    auto it = layoutCache_.find(textId);
    return (it != layoutCache_.end()) ? &it->second : nullptr;
}

void TextLayoutEngine::invalidateLayout(std::uint32_t textId) {
    auto it = layoutCache_.find(textId);
    if (it != layoutCache_.end()) {
        it->second.dirty = true;
    }
    textStore_->markDirty(textId);
}

void TextLayoutEngine::clearLayout(std::uint32_t textId) {
    layoutCache_.erase(textId);
}

void TextLayoutEngine::clearAllLayouts() {
    layoutCache_.clear();
}

} // namespace engine::text

