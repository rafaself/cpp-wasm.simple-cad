#include "engine/text/atlas_packer.h"
#include <algorithm>
#include <limits>

namespace engine::text {

AtlasPacker::AtlasPacker(std::uint16_t width, std::uint16_t height, std::uint16_t padding)
    : width_(width)
    , height_(height)
    , padding_(padding)
    , usedPixels_(0)
    , nextY_(padding)
{
}

std::optional<AtlasPacker::Rect> AtlasPacker::pack(std::uint16_t width, std::uint16_t height) {
    if (width == 0 || height == 0) {
        return Rect{0, 0, 0, 0};
    }
    
    // Add padding to dimensions
    std::uint16_t paddedWidth = width + padding_;
    std::uint16_t paddedHeight = height + padding_;
    
    // Check if it can fit at all
    if (paddedWidth > width_ || paddedHeight > height_) {
        return std::nullopt;
    }
    
    int shelfIdx = findOrCreateShelf(paddedWidth, paddedHeight);
    if (shelfIdx < 0) {
        return std::nullopt;
    }
    
    Shelf& shelf = shelves_[static_cast<std::size_t>(shelfIdx)];
    
    // Allocate from this shelf
    Rect result;
    result.x = shelf.usedWidth;
    result.y = shelf.y;
    result.width = width;
    result.height = height;
    
    shelf.usedWidth += paddedWidth;
    usedPixels_ += static_cast<std::uint32_t>(width) * height;
    
    return result;
}

void AtlasPacker::reset() {
    shelves_.clear();
    usedPixels_ = 0;
    nextY_ = padding_;
}

bool AtlasPacker::canFit(std::uint16_t width, std::uint16_t height) const {
    if (width == 0 || height == 0) {
        return true;
    }
    
    std::uint16_t paddedWidth = width + padding_;
    std::uint16_t paddedHeight = height + padding_;
    
    if (paddedWidth > width_ || paddedHeight > height_) {
        return false;
    }
    
    // Check existing shelves
    for (const Shelf& shelf : shelves_) {
        if (shelf.height >= paddedHeight && 
            shelf.usedWidth + paddedWidth <= width_) {
            return true;
        }
    }
    
    // Check if we can create a new shelf
    return nextY_ + paddedHeight <= height_;
}

float AtlasPacker::getUsageRatio() const {
    std::uint32_t total = getTotalPixels();
    return total > 0 ? static_cast<float>(usedPixels_) / static_cast<float>(total) : 0.0f;
}

int AtlasPacker::findOrCreateShelf(std::uint16_t paddedWidth, std::uint16_t paddedHeight) {
    // Strategy: Find the shelf with the smallest height that can fit the rect
    // This minimizes wasted vertical space (best-fit height)
    
    int bestShelf = -1;
    std::uint16_t bestHeightWaste = std::numeric_limits<std::uint16_t>::max();
    
    for (std::size_t i = 0; i < shelves_.size(); ++i) {
        Shelf& shelf = shelves_[i];
        
        // Must fit horizontally
        if (shelf.usedWidth + paddedWidth > width_) {
            continue;
        }
        
        // Must fit vertically (shelf height must be >= rect height)
        if (shelf.height < paddedHeight) {
            continue;
        }
        
        // Calculate wasted height
        std::uint16_t waste = shelf.height - paddedHeight;
        if (waste < bestHeightWaste) {
            bestHeightWaste = waste;
            bestShelf = static_cast<int>(i);
            
            // Perfect fit, stop searching
            if (waste == 0) {
                break;
            }
        }
    }
    
    if (bestShelf >= 0) {
        return bestShelf;
    }
    
    // No existing shelf works, create a new one
    if (nextY_ + paddedHeight > height_) {
        // No vertical space left
        return -1;
    }
    
    Shelf newShelf;
    newShelf.y = nextY_;
    newShelf.height = paddedHeight;
    newShelf.usedWidth = padding_;  // Start with padding offset
    
    nextY_ += paddedHeight;
    shelves_.push_back(newShelf);
    
    return static_cast<int>(shelves_.size() - 1);
}

} // namespace engine::text
