#pragma once

#include <cstdint>
#include <cstring>
#include <cmath>
#include <algorithm>
#include <string_view>

namespace engine {

// =============================================================================
// UTF-8 Index Conversion
// =============================================================================

inline std::uint32_t decodeUtf8Codepoint(std::string_view content, std::size_t pos, std::uint32_t& byteLen) {
    const std::size_t n = content.size();
    if (pos >= n) {
        byteLen = 0;
        return 0;
    }

    const unsigned char c0 = static_cast<unsigned char>(content[pos]);
    if ((c0 & 0x80) == 0) {
        byteLen = 1;
        return c0;
    }

    if ((c0 & 0xE0) == 0xC0 && pos + 1 < n) {
        const unsigned char c1 = static_cast<unsigned char>(content[pos + 1]);
        if ((c1 & 0xC0) != 0x80) {
            byteLen = 1;
            return 0xFFFD;
        }
        byteLen = 2;
        return ((c0 & 0x1F) << 6) | (c1 & 0x3F);
    }

    if ((c0 & 0xF0) == 0xE0 && pos + 2 < n) {
        const unsigned char c1 = static_cast<unsigned char>(content[pos + 1]);
        const unsigned char c2 = static_cast<unsigned char>(content[pos + 2]);
        if ((c1 & 0xC0) != 0x80 || (c2 & 0xC0) != 0x80) {
            byteLen = 1;
            return 0xFFFD;
        }
        byteLen = 3;
        return ((c0 & 0x0F) << 12) | ((c1 & 0x3F) << 6) | (c2 & 0x3F);
    }

    if ((c0 & 0xF8) == 0xF0 && pos + 3 < n) {
        const unsigned char c1 = static_cast<unsigned char>(content[pos + 1]);
        const unsigned char c2 = static_cast<unsigned char>(content[pos + 2]);
        const unsigned char c3 = static_cast<unsigned char>(content[pos + 3]);
        if ((c1 & 0xC0) != 0x80 || (c2 & 0xC0) != 0x80 || (c3 & 0xC0) != 0x80) {
            byteLen = 1;
            return 0xFFFD;
        }
        byteLen = 4;
        return ((c0 & 0x07) << 18) | ((c1 & 0x3F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F);
    }

    byteLen = 1;
    return 0xFFFD;
}

/**
 * Map logical index (UTF-16 code unit count) to UTF-8 byte offset.
 */
inline std::uint32_t logicalToByteIndex(std::string_view content, std::uint32_t logicalIndex) {
    std::uint32_t bytePos = 0;
    std::uint32_t logicalCount = 0;
    const std::size_t n = content.size();
    while (bytePos < n && logicalCount < logicalIndex) {
        std::uint32_t byteLen = 0;
        const std::uint32_t cp = decodeUtf8Codepoint(content, bytePos, byteLen);
        if (byteLen == 0) break;
        const std::uint32_t units = cp > 0xFFFF ? 2u : 1u;
        if (logicalCount + units > logicalIndex) break;
        logicalCount += units;
        bytePos += byteLen;
    }
    return static_cast<std::uint32_t>(bytePos);
}

/**
 * Map UTF-8 byte index to logical index (UTF-16 code unit count).
 */
inline std::uint32_t byteToLogicalIndex(std::string_view content, std::uint32_t byteIndex) {
    std::uint32_t logicalCount = 0;
    const std::size_t n = content.size();
    const std::size_t limit = std::min<std::size_t>(n, byteIndex);
    std::size_t pos = 0;
    while (pos < limit) {
        std::uint32_t byteLen = 0;
        const std::uint32_t cp = decodeUtf8Codepoint(content, pos, byteLen);
        if (byteLen == 0 || pos + byteLen > limit) break;
        logicalCount += cp > 0xFFFF ? 2u : 1u;
        pos += byteLen;
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
