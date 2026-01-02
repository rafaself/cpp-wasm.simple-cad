#include "engine/text/text_store.h"
#include <algorithm>
#include <cstring>

namespace engine::text {

// Static empty runs vector
const std::vector<TextRun> TextStore::emptyRuns_;

TextStore::TextStore() = default;
TextStore::~TextStore() = default;

// =============================================================================
// Entity Operations
// =============================================================================

bool TextStore::upsertText(
    std::uint32_t id,
    const TextPayloadHeader& header,
    const TextRunPayload* runs,
    std::uint32_t runCount,
    const char* content,
    std::uint32_t contentLength
) {
    // Create or update TextRec
    TextRec& rec = texts_[id];
    rec.id = id;
    rec.x = header.x;
    rec.y = header.y;
    rec.rotation = header.rotation;
    rec.boxMode = static_cast<TextBoxMode>(header.boxMode);
    rec.align = static_cast<TextAlign>(header.align);
    rec.constraintWidth = header.constraintWidth;
    
    // Initialize layout results to zero (will be computed by TextLayoutEngine)
    rec.layoutWidth = 0.0f;
    rec.layoutHeight = 0.0f;
    rec.minX = rec.x;
    rec.minY = rec.y;
    rec.maxX = rec.x;
    rec.maxY = rec.y;
    
    // Store content
    if (content && contentLength > 0) {
        contents_[id] = std::string(content, contentLength);
    } else {
        contents_[id].clear();
    }
    rec.contentOffset = 0;  // Offset is always 0 since each text has its own buffer
    rec.contentLength = contentLength;
    
    // Store runs
    std::vector<TextRun>& runsVec = runs_[id];
    runsVec.clear();
    runsVec.reserve(runCount);
    
    for (std::uint32_t i = 0; i < runCount; ++i) {
        const TextRunPayload& rp = runs[i];
        TextRun run;
        run.startIndex = rp.startIndex;
        run.length = rp.length;
        run.fontId = rp.fontId;
        run.fontSize = rp.fontSize;
        run.colorRGBA = rp.colorRGBA;
        run.flags = static_cast<TextStyleFlags>(rp.flags);
        runsVec.push_back(run);
    }
    
    // If no runs provided, create a default run covering all content
    if (runsVec.empty() && contentLength > 0) {
        TextRun defaultRun;
        defaultRun.startIndex = 0;
        defaultRun.length = contentLength;
        defaultRun.fontId = 4;  // Use fontId=4 (Inter) as default
        defaultRun.fontSize = 16.0f;
        defaultRun.colorRGBA = 0xFFFFFFFF;  // White
        defaultRun.flags = TextStyleFlags::None;
        runsVec.push_back(defaultRun);
    }
    
    rec.runsOffset = 0;  // Offset is always 0 since each text has its own buffer
    rec.runsCount = static_cast<std::uint32_t>(runsVec.size());
    
    // Mark as dirty for layout computation
    markDirty(id);
    
    return true;
}

bool TextStore::deleteText(std::uint32_t id) {
    auto it = texts_.find(id);
    if (it == texts_.end()) {
        return false;
    }
    
    texts_.erase(it);
    contents_.erase(id);
    runs_.erase(id);
    dirtyIds_.erase(id);
    
    // Clear caret if it was on this text
    if (caretState_ && caretState_->textId == id) {
        caretState_.reset();
    }
    
    return true;
}

const TextRec* TextStore::getText(std::uint32_t id) const {
    auto it = texts_.find(id);
    return it != texts_.end() ? &it->second : nullptr;
}

TextRec* TextStore::getTextMutable(std::uint32_t id) {
    auto it = texts_.find(id);
    return it != texts_.end() ? &it->second : nullptr;
}

bool TextStore::hasText(std::uint32_t id) const {
    return texts_.find(id) != texts_.end();
}

std::vector<std::uint32_t> TextStore::getAllTextIds() const {
    std::vector<std::uint32_t> ids;
    ids.reserve(texts_.size());
    for (const auto& [id, _] : texts_) {
        ids.push_back(id);
    }
    return ids;
}

std::size_t TextStore::getTextCount() const {
    return texts_.size();
}

// =============================================================================
// Content Operations
// =============================================================================

std::string_view TextStore::getContent(std::uint32_t id) const {
    auto it = contents_.find(id);
    if (it != contents_.end()) {
        return std::string_view(it->second);
    }
    return std::string_view();
}

bool TextStore::insertContent(
    std::uint32_t id,
    std::uint32_t byteIndex,
    const char* text,
    std::uint32_t byteLength
) {
    auto textIt = texts_.find(id);
    auto contentIt = contents_.find(id);
    if (textIt == texts_.end() || contentIt == contents_.end()) {
        return false;
    }
    
    std::string& content = contentIt->second;
    
    // Clamp index to valid range
    byteIndex = std::min(byteIndex, static_cast<std::uint32_t>(content.size()));
    
    // Insert content
    content.insert(byteIndex, text, byteLength);
    
    // Update TextRec content length
    textIt->second.contentLength = static_cast<std::uint32_t>(content.size());
    
    // Ensure at least one run exists for the content
    auto& runsVec = runs_[id];
    if (runsVec.empty() && !content.empty()) {
        // Create a default run covering all content
        // Use fontId=4 (Inter) as default since fontId=0 has no font loaded
        TextRun defaultRun;
        defaultRun.startIndex = 0;
        defaultRun.length = static_cast<std::uint32_t>(content.size());
        defaultRun.fontId = 4;  // Default to Inter (fontId=4)
        defaultRun.fontSize = 16.0f;
        defaultRun.colorRGBA = 0xFFFFFFFF;  // White
        defaultRun.flags = TextStyleFlags::None;
        runsVec.push_back(defaultRun);
        
        // Update TextRec runs count
        textIt->second.runsCount = 1;
    } else {
        // Adjust existing runs
        adjustRunsAfterInsert(id, byteIndex, byteLength);
    }
    
    // Mark dirty
    markDirty(id);
    
    return true;
}

bool TextStore::deleteContent(
    std::uint32_t id,
    std::uint32_t startByte,
    std::uint32_t endByte
) {
    auto textIt = texts_.find(id);
    auto contentIt = contents_.find(id);
    if (textIt == texts_.end() || contentIt == contents_.end()) {
        return false;
    }
    
    std::string& content = contentIt->second;
    
    // Clamp range to valid bounds
    startByte = std::min(startByte, static_cast<std::uint32_t>(content.size()));
    endByte = std::min(endByte, static_cast<std::uint32_t>(content.size()));
    
    if (startByte >= endByte) {
        return true;  // Nothing to delete
    }
    
    std::uint32_t deleteLength = endByte - startByte;
    
    // Delete content
    content.erase(startByte, deleteLength);
    
    // Update TextRec content length
    textIt->second.contentLength = static_cast<std::uint32_t>(content.size());
    
    // Adjust runs
    adjustRunsAfterDelete(id, startByte, deleteLength);
    
    // Mark dirty
    markDirty(id);
    
    return true;
}

// =============================================================================
// Run Operations
// =============================================================================

const std::vector<TextRun>& TextStore::getRuns(std::uint32_t id) const {
    auto it = runs_.find(id);
    if (it != runs_.end()) {
        return it->second;
    }
    return emptyRuns_;
}

bool TextStore::updateRun(std::uint32_t textId, std::uint32_t runIndex, const TextRun& run) {
    auto it = runs_.find(textId);
    if (it == runs_.end() || runIndex >= it->second.size()) {
        return false;
    }
    
    it->second[runIndex] = run;
    markDirty(textId);
    return true;
}

bool TextStore::setRuns(std::uint32_t textId, std::vector<TextRun>&& newRuns) {
    auto it = runs_.find(textId);
    if (it == runs_.end()) {
        return false;
    }
    it->second = std::move(newRuns);
    auto textIt = texts_.find(textId);
    if (textIt != texts_.end()) {
        textIt->second.runsCount = static_cast<std::uint32_t>(it->second.size());
    }
    markDirty(textId);
    return true;
}

bool TextStore::setConstraintWidth(std::uint32_t textId, float width) {
    TextRec* rec = getTextMutable(textId);
    if (!rec) return false;

    rec->boxMode = TextBoxMode::FixedWidth;
    rec->constraintWidth = width;
    markDirty(textId);
    return true;
}

// =============================================================================
// Caret & Selection
// =============================================================================

void TextStore::setCaret(std::uint32_t textId, std::uint32_t byteIndex) {
    if (!hasText(textId)) {
        return;
    }
    
    // Clamp to content length
    const std::string_view content = getContent(textId);
    byteIndex = std::min(byteIndex, static_cast<std::uint32_t>(content.size()));
    
    caretState_ = TextCaretState{textId, byteIndex, byteIndex, byteIndex};
}

void TextStore::setSelection(std::uint32_t textId, std::uint32_t startByte, std::uint32_t endByte) {
    if (!hasText(textId)) {
        return;
    }
    
    const std::string_view content = getContent(textId);
    std::uint32_t maxIndex = static_cast<std::uint32_t>(content.size());
    
    startByte = std::min(startByte, maxIndex);
    endByte = std::min(endByte, maxIndex);
    
    // Ensure start <= end
    if (startByte > endByte) {
        std::swap(startByte, endByte);
    }
    
    caretState_ = TextCaretState{textId, endByte, startByte, endByte};
}

std::optional<TextCaretState> TextStore::getCaretState(std::uint32_t textId) const {
    if (caretState_ && caretState_->textId == textId) {
        return caretState_;
    }
    return std::nullopt;
}

void TextStore::clearCaretState() {
    caretState_.reset();
}

// =============================================================================
// Dirty Tracking
// =============================================================================

void TextStore::markDirty(std::uint32_t id) {
    if (hasText(id)) {
        dirtyIds_.insert(id);
    }
}

std::vector<std::uint32_t> TextStore::consumeDirtyIds() {
    std::vector<std::uint32_t> result(dirtyIds_.begin(), dirtyIds_.end());
    dirtyIds_.clear();
    return result;
}

bool TextStore::hasDirtyEntities() const {
    return !dirtyIds_.empty();
}

// =============================================================================
// Layout Results
// =============================================================================

void TextStore::setLayoutResult(
    std::uint32_t id,
    float layoutWidth,
    float layoutHeight,
    float minX, float minY,
    float maxX, float maxY
) {
    TextRec* rec = getTextMutable(id);
    if (!rec) {
        return;
    }
    
    rec->layoutWidth = layoutWidth;
    rec->layoutHeight = layoutHeight;
    rec->minX = minX;
    rec->minY = minY;
    rec->maxX = maxX;
    rec->maxY = maxY;
}

// =============================================================================
// Bulk Operations
// =============================================================================

void TextStore::clear() {
    texts_.clear();
    contents_.clear();
    runs_.clear();
    dirtyIds_.clear();
    caretState_.reset();
}

void TextStore::reserve(std::size_t count) {
    texts_.reserve(count);
    contents_.reserve(count);
    runs_.reserve(count);
}

// =============================================================================
// Private Helpers
// =============================================================================

void TextStore::adjustRunsAfterInsert(std::uint32_t id, std::uint32_t byteIndex, std::uint32_t insertLength) {
    auto it = runs_.find(id);
    if (it == runs_.end()) {
        return;
    }

    bool zeroLengthExpanded = false;
    
    // Check if there is a zero-length run at the insertion point (typing attribute)
    bool hasZeroLengthRun = false;
    // Also check if there's any run starting at the insertion point
    bool hasRunStartingAtIndex = false;
    for (const auto& r : it->second) {
        if (r.startIndex == byteIndex && r.length == 0) {
            hasZeroLengthRun = true;
        }
        if (r.startIndex == byteIndex) {
            hasRunStartingAtIndex = true;
        }
    }

    for (TextRun& run : it->second) {
        // Special case: run with length=0 at insertion point should be expanded
        // This handles the case where text is created with an empty run and content is inserted
        // IMPORTANT: Only expand the FIRST zero-length run to avoid duplication
        if (run.startIndex == byteIndex && run.length == 0) {
            if (!zeroLengthExpanded) {
                run.length = insertLength;
                zeroLengthExpanded = true;
            }
            // Skip further processing for this run (will be cleaned up if not expanded)
            continue;
        } else if (run.startIndex == byteIndex && run.length > 0) {
            // Run starts exactly at insertion point (non-zero length)
            // If a zero-length run was expanded, we shift this.
            // If there are multiple runs, and another run ends here, we also shift.
            // This handles "Hello|World" insertion where " World" should shift.
            if (zeroLengthExpanded || hasRunStartingAtIndex) {
                run.startIndex += insertLength;
            } else {
                // Single run starting at byteIndex - extend it
                run.length += insertLength;
            }
        } else if (run.startIndex > byteIndex) {
            // Run starts strictly after insertion point: shift start
            run.startIndex += insertLength;
        } else if (run.startIndex + run.length > byteIndex) {
            // Run spans insertion point: extend length
            run.length += insertLength;
        } else if (run.startIndex + run.length == byteIndex) {
            // Run ends exactly at insertion point: extend length (for contiguous insertion)
            // BUT: do NOT extend if there's another run at this position (zero-length or otherwise)
            // This prevents extending "Hello" when " World" starts at the same boundary.
            if (!hasRunStartingAtIndex) {
                run.length += insertLength;
            }
        }
        // Runs ending before insertion point are unchanged
    }



    // Clean up any remaining zero-length runs at the insertion point
    // These are duplicate typing attribute runs that should not exist
    if (zeroLengthExpanded) {
        auto& runsVec = it->second;
        runsVec.erase(
            std::remove_if(runsVec.begin(), runsVec.end(), [byteIndex](const TextRun& r) {
                return r.startIndex == byteIndex && r.length == 0;
            }),
            runsVec.end()
        );
    }
}

void TextStore::adjustRunsAfterDelete(std::uint32_t id, std::uint32_t startByte, std::uint32_t deleteLength) {
    auto it = runs_.find(id);
    if (it == runs_.end()) {
        return;
    }
    
    std::uint32_t endByte = startByte + deleteLength;
    
    // Use stable iteration since we might remove runs
    std::vector<TextRun>& runsVec = it->second;
    
    for (auto runIt = runsVec.begin(); runIt != runsVec.end(); ) {
        TextRun& run = *runIt;
        std::uint32_t runStart = run.startIndex;
        std::uint32_t runEnd = run.startIndex + run.length;
        
        if (runEnd <= startByte) {
            // Run is entirely before deleted region: unchanged
            ++runIt;
        } else if (runStart >= endByte) {
            // Run is entirely after deleted region: shift start
            run.startIndex -= deleteLength;
            ++runIt;
        } else if (runStart >= startByte && runEnd <= endByte) {
            // Run is entirely within deleted region: remove it
            runIt = runsVec.erase(runIt);
        } else if (runStart < startByte && runEnd > endByte) {
            // Deleted region is entirely within run: shrink length
            run.length -= deleteLength;
            ++runIt;
        } else if (runStart < startByte && runEnd > startByte && runEnd <= endByte) {
            // Run overlaps start of deleted region: truncate end
            run.length = startByte - runStart;
            ++runIt;
        } else if (runStart >= startByte && runStart < endByte && runEnd > endByte) {
            // Run overlaps end of deleted region: adjust start and length
            std::uint32_t overlap = endByte - runStart;
            run.startIndex = startByte;  // Move to deletion point
            run.length -= overlap;
            ++runIt;
        } else {
            ++runIt;
        }
    }
    
    // Update TextRec runs count
    auto textIt = texts_.find(id);
    if (textIt != texts_.end()) {
        textIt->second.runsCount = static_cast<std::uint32_t>(runsVec.size());
    }
}

} // namespace engine::text
