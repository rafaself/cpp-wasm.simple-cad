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

    std::uint32_t symbolCount = 0;
    std::uint32_t nodeCount = 0;
    std::uint32_t conduitCount = 0;
    std::size_t headerBytes = snapshotHeaderBytesV2;
    if (version == 3) {
        if (byteCount < snapshotHeaderBytesV3) return EngineError::BufferTruncated;
        symbolCount = readU32(src, 24);
        nodeCount = readU32(src, 28);
        conduitCount = readU32(src, 32);
        headerBytes = snapshotHeaderBytesV3;
    }

    const std::size_t expected =
        headerBytes +
        static_cast<std::size_t>(rectCount) * rectRecordBytes +
        static_cast<std::size_t>(lineCount) * lineRecordBytes +
        static_cast<std::size_t>(polyCount) * polyRecordBytes +
        static_cast<std::size_t>(pointCount) * pointRecordBytes +
        static_cast<std::size_t>(symbolCount) * symbolRecordBytes +
        static_cast<std::size_t>(nodeCount) * nodeRecordBytes +
        static_cast<std::size_t>(conduitCount) * conduitRecordBytes;

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

    if (version == 3) {
        out.symbols.resize(symbolCount);
        for (std::uint32_t i = 0; i < symbolCount; ++i) {
            out.symbols[i].id = readU32(src, o); o += 4;
            out.symbols[i].symbolKey = readU32(src, o); o += 4;
            out.symbols[i].x = readF32(src, o); o += 4;
            out.symbols[i].y = readF32(src, o); o += 4;
            out.symbols[i].w = readF32(src, o); o += 4;
            out.symbols[i].h = readF32(src, o); o += 4;
            out.symbols[i].rotation = readF32(src, o); o += 4;
            out.symbols[i].scaleX = readF32(src, o); o += 4;
            out.symbols[i].scaleY = readF32(src, o); o += 4;
            out.symbols[i].connX = readF32(src, o); o += 4;
            out.symbols[i].connY = readF32(src, o); o += 4;
        }

        out.nodes.resize(nodeCount);
        for (std::uint32_t i = 0; i < nodeCount; ++i) {
            out.nodes[i].id = readU32(src, o); o += 4;
            const std::uint32_t kindU32 = readU32(src, o); o += 4;
            out.nodes[i].kind = kindU32 == 1 ? NodeKind::Anchored : NodeKind::Free;
            out.nodes[i].anchorSymbolId = readU32(src, o); o += 4;
            out.nodes[i].x = readF32(src, o); o += 4;
            out.nodes[i].y = readF32(src, o); o += 4;
        }

        out.conduits.resize(conduitCount);
        for (std::uint32_t i = 0; i < conduitCount; ++i) {
            out.conduits[i].id = readU32(src, o); o += 4;
            out.conduits[i].fromNodeId = readU32(src, o); o += 4;
            out.conduits[i].toNodeId = readU32(src, o); o += 4;
        }
    }

    return EngineError::Ok;
}

std::vector<std::uint8_t> buildSnapshotBytes(const SnapshotData& data) {
    const std::uint32_t version = 3; // always emit v3

    const std::size_t totalBytes =
        snapshotHeaderBytesV3 +
        data.rects.size() * rectRecordBytes +
        data.lines.size() * lineRecordBytes +
        data.polylines.size() * polyRecordBytes +
        data.points.size() * pointRecordBytes +
        data.symbols.size() * symbolRecordBytes +
        data.nodes.size() * nodeRecordBytes +
        data.conduits.size() * conduitRecordBytes;

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
    writeU32LE(dst, o, static_cast<std::uint32_t>(data.symbols.size())); o += 4;
    writeU32LE(dst, o, static_cast<std::uint32_t>(data.nodes.size())); o += 4;
    writeU32LE(dst, o, static_cast<std::uint32_t>(data.conduits.size())); o += 4;
    writeU32LE(dst, o, 0); o += 4;
    writeU32LE(dst, o, 0); o += 4;

    for (const auto& r : data.rects) {
        writeU32LE(dst, o, r.id); o += 4;
        writeF32LE(dst, o, r.x); o += 4;
        writeF32LE(dst, o, r.y); o += 4;
        writeF32LE(dst, o, r.w); o += 4;
        writeF32LE(dst, o, r.h); o += 4;
        writeF32LE(dst, o, r.r); o += 4;
        writeF32LE(dst, o, r.g); o += 4;
        writeF32LE(dst, o, r.b); o += 4;
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

    for (const auto& s : data.symbols) {
        writeU32LE(dst, o, s.id); o += 4;
        writeU32LE(dst, o, s.symbolKey); o += 4;
        writeF32LE(dst, o, s.x); o += 4;
        writeF32LE(dst, o, s.y); o += 4;
        writeF32LE(dst, o, s.w); o += 4;
        writeF32LE(dst, o, s.h); o += 4;
        writeF32LE(dst, o, s.rotation); o += 4;
        writeF32LE(dst, o, s.scaleX); o += 4;
        writeF32LE(dst, o, s.scaleY); o += 4;
        writeF32LE(dst, o, s.connX); o += 4;
        writeF32LE(dst, o, s.connY); o += 4;
    }

    for (const auto& n : data.nodes) {
        writeU32LE(dst, o, n.id); o += 4;
        writeU32LE(dst, o, n.kind == NodeKind::Anchored ? 1u : 0u); o += 4;
        writeU32LE(dst, o, n.anchorSymbolId); o += 4;
        writeF32LE(dst, o, n.x); o += 4;
        writeF32LE(dst, o, n.y); o += 4;
    }

    for (const auto& c : data.conduits) {
        writeU32LE(dst, o, c.id); o += 4;
        writeU32LE(dst, o, c.fromNodeId); o += 4;
        writeU32LE(dst, o, c.toNodeId); o += 4;
    }

    return out;
}

} // namespace engine