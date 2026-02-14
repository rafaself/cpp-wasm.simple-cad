#ifndef ELETROCAD_ENGINE_TEXT_ATLAS_PACKER_H
#define ELETROCAD_ENGINE_TEXT_ATLAS_PACKER_H

#include <cstdint>
#include <vector>
#include <optional>

namespace engine::text {

/**
 * AtlasPacker: Efficient rectangle bin-packing for glyph atlas.
 * 
 * Implements a shelf-based algorithm with horizontal strips.
 * Good balance of simplicity and efficiency for dynamic glyph atlases.
 * 
 * Algorithm:
 * 1. Shelves are horizontal strips of fixed height
 * 2. New rectangles are placed left-to-right on the current shelf
 * 3. If no space, start a new shelf below (with height matching the rect)
 * 4. Shelves are never split vertically to keep implementation simple
 */
class AtlasPacker {
public:
    struct Rect {
        std::uint16_t x;
        std::uint16_t y;
        std::uint16_t width;
        std::uint16_t height;
    };
    
    /**
     * Create a packer for an atlas of given dimensions.
     * @param width Atlas width in pixels
     * @param height Atlas height in pixels
     * @param padding Padding between packed rectangles (default 1)
     */
    AtlasPacker(std::uint16_t width, std::uint16_t height, std::uint16_t padding = 1);
    ~AtlasPacker() = default;
    
    // Non-copyable, movable
    AtlasPacker(const AtlasPacker&) = delete;
    AtlasPacker& operator=(const AtlasPacker&) = delete;
    AtlasPacker(AtlasPacker&&) = default;
    AtlasPacker& operator=(AtlasPacker&&) = default;
    
    /**
     * Try to pack a rectangle into the atlas.
     * @param width Rectangle width
     * @param height Rectangle height
     * @return Rect with position if successful, std::nullopt if atlas is full
     */
    std::optional<Rect> pack(std::uint16_t width, std::uint16_t height);
    
    /**
     * Reset the packer, clearing all allocations.
     */
    void reset();
    
    /**
     * Check if the atlas can fit a rectangle of given size.
     * This is a quick check without actually allocating.
     */
    bool canFit(std::uint16_t width, std::uint16_t height) const;
    
    /**
     * Get atlas dimensions.
     */
    std::uint16_t getWidth() const { return width_; }
    std::uint16_t getHeight() const { return height_; }
    
    /**
     * Get current usage statistics.
     */
    float getUsageRatio() const;
    std::uint32_t getUsedPixels() const { return usedPixels_; }
    std::uint32_t getTotalPixels() const { return static_cast<std::uint32_t>(width_) * height_; }
    
    /**
     * Get number of shelves currently in use.
     */
    std::size_t getShelfCount() const { return shelves_.size(); }

private:
    struct Shelf {
        std::uint16_t y;        // Y position of this shelf
        std::uint16_t height;   // Height of this shelf
        std::uint16_t usedWidth; // Width used so far
    };
    
    std::uint16_t width_;
    std::uint16_t height_;
    std::uint16_t padding_;
    
    std::vector<Shelf> shelves_;
    std::uint32_t usedPixels_;
    std::uint16_t nextY_;  // Y position for next new shelf
    
    /**
     * Find best shelf for a rectangle or create new one.
     * Returns shelf index or -1 if no space.
     */
    int findOrCreateShelf(std::uint16_t width, std::uint16_t height);
};

} // namespace engine::text

#endif // ELETROCAD_ENGINE_TEXT_ATLAS_PACKER_H
