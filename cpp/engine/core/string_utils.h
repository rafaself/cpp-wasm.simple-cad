#pragma once

#include <cstdint>
#include <cstring>
#include <cmath>
#include <string_view>

namespace engine {

// =============================================================================
// UTF-8 Index Conversion
// =============================================================================

/**
 * Map logical index (grapheme/codepoint approximation) to UTF-8 byte offset.
 */
inline std::uint32_t logicalToByteIndex(std::string_view content, std::uint32_t logicalIndex) {
    std::uint32_t bytePos = 0;
    std::uint32_t logicalCount = 0;
    const std::size_t n = content.size();
    while (bytePos < n && logicalCount < logicalIndex) {
        const unsigned char c = static_cast<unsigned char>(content[bytePos]);
        // Continuation bytes have top bits 10xxxxxx
        if ((c & 0xC0) != 0x80) {
            logicalCount++;
        }
        bytePos++;
    }
    return static_cast<std::uint32_t>(bytePos);
}

/**
 * Map UTF-8 byte index to logical index (grapheme/codepoint approximation).
 */
inline std::uint32_t byteToLogicalIndex(std::string_view content, std::uint32_t byteIndex) {
    std::uint32_t logicalCount = 0;
    const std::size_t n = content.size();
    const std::size_t limit = std::min<std::size_t>(n, byteIndex);
    for (std::size_t i = 0; i < limit; ++i) {
        const unsigned char c = static_cast<unsigned char>(content[i]);
        if ((c & 0xC0) != 0x80) {
            logicalCount++;
        }
    }
    return logicalCount;
}

// =============================================================================
// Geometry Helpers
// =============================================================================

/**
 * Squared distance from point (px, py) to line segment (ax, ay) -> (bx, by).
 */
inline float pointToSegmentDistanceSq(float px, float py, float ax, float ay, float bx, float by) {
    const float l2 = (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
    if (l2 == 0.0f) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
    float t = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / l2;
    t = std::max(0.0f, std::min(1.0f, t));
    const float ex = ax + t * (bx - ax);
    const float ey = ay + t * (by - ay);
    return (px - ex) * (px - ex) + (py - ey) * (py - ey);
}

// =============================================================================
// Hash/Digest (FNV-1a)
// =============================================================================

constexpr std::uint64_t kDigestOffset = 14695981039346656037ull;
constexpr std::uint64_t kDigestPrime = 1099511628211ull;

inline std::uint64_t hashU32(std::uint64_t h, std::uint32_t v) {
    h ^= v;
    return h * kDigestPrime;
}

inline std::uint64_t hashBytes(std::uint64_t h, const std::uint8_t* data, std::size_t len) {
    for (std::size_t i = 0; i < len; ++i) {
        h ^= data[i];
        h *= kDigestPrime;
    }
    return h;
}

inline std::uint32_t canonicalizeF32(float v) {
    if (std::isnan(v)) return 0x7fc00000u;
    if (v == 0.0f) return 0u;
    std::uint32_t bits = 0;
    std::memcpy(&bits, &v, sizeof(bits));
    return bits;
}

inline std::uint64_t hashF32(std::uint64_t h, float v) {
    return hashU32(h, canonicalizeF32(v));
}

} // namespace engine
