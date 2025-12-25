#include "engine/snapshot.h"
#include "engine/util.h"
#include "engine/types.h"
#include <cstring>
#include <vector>

namespace engine {

EngineError parseSnapshot(const std::uint8_t* src, std::uint32_t byteCount, SnapshotData& out) {
    if (!src || byteCount < snapshotHeaderBytesV2) {
        return EngineError::BufferTruncated;
    }

    const std::uint32_t magic = readU32(src, 0);
    if (magic != snapshotMagicEwc1) return EngineError::InvalidMagic;
    const std::uint32_t version = readU32(src, 4);
    if (version != 2 && version != 3) return EngineError::UnsupportedVersion;
    out.version = version;

    const std::uint32_t rectCount = readU32(src, 8);
    const std::uint32_t lineCount = readU32(src, 12);
    const std::uint32_t polyCount = readU32(src, 16);
    const std::uint32_t pointCount = readU32(src, 20);

    // V3 supports backward compatibility reading, but we ignore electrical fields if present
    std::size_t headerBytes = snapshotHeaderBytesV2;
    if (version == 3) {
        if (byteCount < snapshotHeaderBytesV3) return EngineError::BufferTruncated;
        headerBytes = snapshotHeaderBytesV3;
        // We read but discard symbolCount, nodeCount, conduitCount
    }

    // Since we ignore electrical, we calculate expected size for geometry only first?
    // No, we need to skip bytes if they exist.
    // But since we removed the structs, we can't calculate exact expected bytes for V3 easily without reading counts.
    // Let's assume for this cleanup we only support loading V2/V3 geometry.
    // If V3 file has electrical data, we need to skip it.

    // Actually, to correctly parse the buffer we need to know where things are.
    // If we receive a V3 buffer with electrical data, we must skip it.
    // Let's read the counts to skip correctly.

    std::uint32_t symbolCount = 0;
    std::uint32_t nodeCount = 0;
    std::uint32_t conduitCount = 0;

    if (version == 3) {
        symbolCount = readU32(src, 24);
        nodeCount = readU32(src, 28);
        conduitCount = readU32(src, 32);
    }

    // We can't use sizeof(SymbolRec) etc because we deleted them from types.h
    // We need to use the magic constants for sizes if we want to skip.
    // Let's define local constants for skipping.
    constexpr std::size_t legacySymbolRecordBytes = 44;
    constexpr std::size_t legacyNodeRecordBytes = 20;
    constexpr std::size_t legacyConduitRecordBytes = 12;

    const std::size_t expected =
        headerBytes +
        static_cast<std::size_t>(rectCount) * rectRecordBytes +
        static_cast<std::size_t>(lineCount) * lineRecordBytes +
        static_cast<std::size_t>(polyCount) * polyRecordBytes +
        static_cast<std::size_t>(pointCount) * pointRecordBytes +
        static_cast<std::size_t>(symbolCount) * legacySymbolRecordBytes +
        static_cast<std::size_t>(nodeCount) * legacyNodeRecordBytes +
        static_cast<std::size_t>(conduitCount) * legacyConduitRecordBytes;

    if (expected > byteCount) return EngineError::BufferTruncated;

    out.rawBytes.assign(src, src + expected);

    std::size_t o = headerBytes;

    out.rects.resize(rectCount);
    for (std::uint32_t i = 0; i < rectCount; ++i) {
        out.rects[i].id = readU32(src, o); o += 4;
        out.rects[i].x = readF32(src, o); o += 4;
        out.rects[i].y = readF32(src, o); o += 4;
        out.rects[i].w = readF32(src, o); o += 4;
        out.rects[i].h = readF32(src, o); o += 4;
        out.rects[i].r = readF32(src, o); o += 4;
        out.rects[i].g = readF32(src, o); o += 4;
        out.rects[i].b = readF32(src, o); o += 4;
        out.rects[i].a = readF32(src, o); o += 4;
    }

    out.lines.resize(lineCount);
    for (std::uint32_t i = 0; i < lineCount; ++i) {
        out.lines[i].id = readU32(src, o); o += 4;
        out.lines[i].x0 = readF32(src, o); o += 4;
        out.lines[i].y0 = readF32(src, o); o += 4;
        out.lines[i].x1 = readF32(src, o); o += 4;
        out.lines[i].y1 = readF32(src, o); o += 4;
    }

    out.polylines.resize(polyCount);
    for (std::uint32_t i = 0; i < polyCount; ++i) {
        out.polylines[i].id = readU32(src, o); o += 4;
        out.polylines[i].offset = readU32(src, o); o += 4;
        out.polylines[i].count = readU32(src, o); o += 4;
    }

    out.points.resize(pointCount);
    for (std::uint32_t i = 0; i < pointCount; ++i) {
        out.points[i].x = readF32(src, o); o += 4;
        out.points[i].y = readF32(src, o); o += 4;
    }

    // Skip electrical entities
    if (version == 3) {
        o += symbolCount * legacySymbolRecordBytes;
        o += nodeCount * legacyNodeRecordBytes;
        o += conduitCount * legacyConduitRecordBytes;
    }

    return EngineError::Ok;
}

std::vector<std::uint8_t> buildSnapshotBytes(const SnapshotData& data) {
    // Revert to V2 or keep V3 but with 0 electrical counts?
    // Let's keep V3 format structure but always 0 electrical.
    const std::uint32_t version = 3;

    const std::size_t totalBytes =
        snapshotHeaderBytesV3 +
        data.rects.size() * rectRecordBytes +
        data.lines.size() * lineRecordBytes +
        data.polylines.size() * polyRecordBytes +
        data.points.size() * pointRecordBytes;
        // + 0 electrical

    std::vector<std::uint8_t> out;
    out.resize(totalBytes);
    std::uint8_t* dst = out.data();
    std::size_t o = 0;

    writeU32LE(dst, o, snapshotMagicEwc1); o += 4;
    writeU32LE(dst, o, version); o += 4;
    writeU32LE(dst, o, static_cast<std::uint32_t>(data.rects.size())); o += 4;
    writeU32LE(dst, o, static_cast<std::uint32_t>(data.lines.size())); o += 4;
    writeU32LE(dst, o, static_cast<std::uint32_t>(data.polylines.size())); o += 4;
    writeU32LE(dst, o, static_cast<std::uint32_t>(data.points.size())); o += 4;
    writeU32LE(dst, o, 0); o += 4; // symbolCount
    writeU32LE(dst, o, 0); o += 4; // nodeCount
    writeU32LE(dst, o, 0); o += 4; // conduitCount
    writeU32LE(dst, o, 0); o += 4; // reserved
    writeU32LE(dst, o, 0); o += 4; // reserved

    for (const auto& r : data.rects) {
        writeU32LE(dst, o, r.id); o += 4;
        writeF32LE(dst, o, r.x); o += 4;
        writeF32LE(dst, o, r.y); o += 4;
        writeF32LE(dst, o, r.w); o += 4;
        writeF32LE(dst, o, r.h); o += 4;
        writeF32LE(dst, o, r.r); o += 4;
        writeF32LE(dst, o, r.g); o += 4;
        writeF32LE(dst, o, r.b); o += 4;
        writeF32LE(dst, o, r.a); o += 4;
    }

    for (const auto& l : data.lines) {
        writeU32LE(dst, o, l.id); o += 4;
        writeF32LE(dst, o, l.x0); o += 4;
        writeF32LE(dst, o, l.y0); o += 4;
        writeF32LE(dst, o, l.x1); o += 4;
        writeF32LE(dst, o, l.y1); o += 4;
    }

    for (const auto& pl : data.polylines) {
        writeU32LE(dst, o, pl.id); o += 4;
        writeU32LE(dst, o, pl.offset); o += 4;
        writeU32LE(dst, o, pl.count); o += 4;
    }

    for (const auto& p : data.points) {
        writeF32LE(dst, o, p.x); o += 4;
        writeF32LE(dst, o, p.y); o += 4;
    }

    return out;
}

} // namespace engine
