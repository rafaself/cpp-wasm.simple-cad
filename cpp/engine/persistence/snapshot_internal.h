#pragma once

#include <cstddef>
#include <cstdint>
#include <limits>

namespace engine::snapshot::detail {

constexpr std::uint32_t fourCC(char a, char b, char c, char d) {
    return static_cast<std::uint32_t>(a)
        | (static_cast<std::uint32_t>(b) << 8)
        | (static_cast<std::uint32_t>(c) << 16)
        | (static_cast<std::uint32_t>(d) << 24);
}

constexpr std::uint32_t TAG_ENTS = fourCC('E', 'N', 'T', 'S');
constexpr std::uint32_t TAG_LAYR = fourCC('L', 'A', 'Y', 'R');
constexpr std::uint32_t TAG_ORDR = fourCC('O', 'R', 'D', 'R');
constexpr std::uint32_t TAG_SELC = fourCC('S', 'E', 'L', 'C');
constexpr std::uint32_t TAG_TEXT = fourCC('T', 'E', 'X', 'T');
constexpr std::uint32_t TAG_NIDX = fourCC('N', 'I', 'D', 'X');
constexpr std::uint32_t TAG_HIST = fourCC('H', 'I', 'S', 'T');
constexpr std::uint32_t TAG_STYL = fourCC('S', 'T', 'Y', 'L');

constexpr std::size_t rectSnapshotBytes = 12 + 17 * 4; // Added rot, sx, sy
constexpr std::size_t lineSnapshotBytes = 12 + 10 * 4;
constexpr std::size_t polySnapshotBytes = 20 + 11 * 4;
constexpr std::size_t circleSnapshotBytes = 12 + 17 * 4;
constexpr std::size_t polygonSnapshotBytes = 12 + 17 * 4 + 4;
constexpr std::size_t arrowSnapshotBytes = 12 + 11 * 4;
constexpr std::size_t textSnapshotHeaderBytes = 64;
constexpr std::size_t layerStyleSnapshotBytes = 4 * 4 + 4;
constexpr std::size_t styleOverrideSnapshotBytes = 24;

inline std::uint32_t crc32(const std::uint8_t* bytes, std::size_t len) {
    static std::uint32_t table[256];
    static bool tableReady = false;
    if (!tableReady) {
        for (std::uint32_t i = 0; i < 256; ++i) {
            std::uint32_t c = i;
            for (int k = 0; k < 8; ++k) {
                c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
            }
            table[i] = c;
        }
        tableReady = true;
    }

    std::uint32_t crc = 0xFFFFFFFFu;
    for (std::size_t i = 0; i < len; ++i) {
        crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >> 8);
    }
    return (crc ^ 0xFFFFFFFFu);
}

inline bool tryAdd(std::size_t a, std::size_t b, std::size_t& out) {
    if (a > (std::numeric_limits<std::size_t>::max() - b)) return false;
    out = a + b;
    return true;
}

inline bool tryMul(std::size_t a, std::size_t b, std::size_t& out) {
    if (a == 0 || b == 0) {
        out = 0;
        return true;
    }
    if (a > (std::numeric_limits<std::size_t>::max() / b)) return false;
    out = a * b;
    return true;
}

inline bool requireBytes(std::size_t offset, std::size_t size, std::size_t total) {
    if (offset > total) return false;
    return size <= (total - offset);
}

} // namespace engine::snapshot::detail
