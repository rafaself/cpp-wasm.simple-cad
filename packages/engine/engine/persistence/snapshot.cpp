#include "engine/persistence/snapshot.h"
#include "engine/core/util.h"
#include "engine/core/types.h"
#include "engine/persistence/snapshot_internal.h"
#include <cstring>
#include <unordered_map>

namespace {
struct SectionView {
    const std::uint8_t* data{nullptr};
    std::uint32_t size{0};
};
} // namespace
namespace engine {
using namespace snapshot::detail;

EngineError parseSnapshot(const std::uint8_t* src, std::uint32_t byteCount, SnapshotData& out) {
    if (!src || byteCount < snapshotHeaderBytesEsnp) {
        return EngineError::BufferTruncated;
    }

    const std::uint32_t magic = readU32(src, 0);
    if (magic != snapshotMagicEsnp) return EngineError::InvalidMagic;

    const std::uint32_t version = readU32(src, 4);
    if (version != snapshotVersionEsnp) return EngineError::UnsupportedVersion;
    out.version = version;

    const std::uint32_t sectionCount = readU32(src, 8);
    const std::size_t headerBytes = snapshotHeaderBytesEsnp;
    std::size_t tableBytes = 0;
    if (!tryMul(static_cast<std::size_t>(sectionCount), snapshotSectionEntryBytes, tableBytes)) {
        return EngineError::InvalidPayloadSize;
    }
    std::size_t headerPlusTable = 0;
    if (!tryAdd(headerBytes, tableBytes, headerPlusTable)) {
        return EngineError::InvalidPayloadSize;
    }
    if (byteCount < headerPlusTable) {
        return EngineError::BufferTruncated;
    }

    std::unordered_map<std::uint32_t, SectionView> sections;
    sections.reserve(sectionCount);

    for (std::uint32_t i = 0; i < sectionCount; ++i) {
        const std::size_t base = headerBytes + i * snapshotSectionEntryBytes;
        const std::uint32_t tag = readU32(src, base + 0);
        const std::uint32_t offset = readU32(src, base + 4);
        const std::uint32_t size = readU32(src, base + 8);
        const std::uint32_t expectedCrc = readU32(src, base + 12);

        std::size_t end = 0;
        if (!tryAdd(static_cast<std::size_t>(offset), static_cast<std::size_t>(size), end)) {
            return EngineError::InvalidPayloadSize;
        }
        if (offset < headerPlusTable) return EngineError::InvalidPayloadSize;
        if (end > byteCount) return EngineError::BufferTruncated;

        const std::uint8_t* payload = src + offset;
        const std::uint32_t actualCrc = crc32(payload, size);
        if (actualCrc != expectedCrc) return EngineError::InvalidPayloadSize;

        if (sections.find(tag) == sections.end()) {
            sections.emplace(tag, SectionView{payload, size});
        }
    }

    const auto findSection = [&](std::uint32_t tag) -> const SectionView* {
        auto it = sections.find(tag);
        if (it == sections.end()) return nullptr;
        return &it->second;
    };

    const SectionView* ents = findSection(TAG_ENTS);
    const SectionView* layr = findSection(TAG_LAYR);
    const SectionView* ordr = findSection(TAG_ORDR);
    const SectionView* selc = findSection(TAG_SELC);
    const SectionView* text = findSection(TAG_TEXT);
    const SectionView* nidx = findSection(TAG_NIDX);
    const SectionView* hist = findSection(TAG_HIST);
    const SectionView* styl = findSection(TAG_STYL);
    if (!ents || !layr || !ordr || !selc || !text || !nidx || !styl) {
        return EngineError::InvalidPayloadSize;
    }
    out.historyBytes.clear();
    if (hist && hist->data && hist->size > 0) {
        out.historyBytes.assign(hist->data, hist->data + hist->size);
    }
    // ENTS
    {
        std::size_t o = 0;
        if (!requireBytes(o, 7 * 4, ents->size)) return EngineError::BufferTruncated;

        const std::uint32_t rectCount = readU32(ents->data, o); o += 4;
        const std::uint32_t lineCount = readU32(ents->data, o); o += 4;
        const std::uint32_t polyCount = readU32(ents->data, o); o += 4;
        const std::uint32_t pointCount = readU32(ents->data, o); o += 4;
        const std::uint32_t circleCount = readU32(ents->data, o); o += 4;
        const std::uint32_t polygonCount = readU32(ents->data, o); o += 4;
        const std::uint32_t arrowCount = readU32(ents->data, o); o += 4;

        out.rects.clear();
        out.rects.reserve(rectCount);
        for (std::uint32_t i = 0; i < rectCount; ++i) {
            if (!requireBytes(o, rectSnapshotBytes, ents->size)) return EngineError::BufferTruncated;
            RectSnapshot rec{};
            rec.rec.id = readU32(ents->data, o); o += 4;
            rec.layerId = readU32(ents->data, o); o += 4;
            rec.flags = readU32(ents->data, o); o += 4;
            rec.rec.x = readF32(ents->data, o); o += 4;
            rec.rec.y = readF32(ents->data, o); o += 4;
            rec.rec.w = readF32(ents->data, o); o += 4;
            rec.rec.h = readF32(ents->data, o); o += 4;
            rec.rec.rot = readF32(ents->data, o); o += 4;
            rec.rec.sx = readF32(ents->data, o); o += 4;
            rec.rec.sy = readF32(ents->data, o); o += 4;
            rec.rec.r = readF32(ents->data, o); o += 4;
            rec.rec.g = readF32(ents->data, o); o += 4;
            rec.rec.b = readF32(ents->data, o); o += 4;
            rec.rec.a = readF32(ents->data, o); o += 4;
            rec.rec.sr = readF32(ents->data, o); o += 4;
            rec.rec.sg = readF32(ents->data, o); o += 4;
            rec.rec.sb = readF32(ents->data, o); o += 4;
            rec.rec.sa = readF32(ents->data, o); o += 4;
            rec.rec.strokeEnabled = readF32(ents->data, o); o += 4;
            rec.rec.strokeWidthPx = readF32(ents->data, o); o += 4;
            out.rects.push_back(rec);
        }
        out.lines.clear();
        out.lines.reserve(lineCount);
        for (std::uint32_t i = 0; i < lineCount; ++i) {
            if (!requireBytes(o, lineSnapshotBytes, ents->size)) return EngineError::BufferTruncated;
            LineSnapshot rec{};
            rec.rec.id = readU32(ents->data, o); o += 4;
            rec.layerId = readU32(ents->data, o); o += 4;
            rec.flags = readU32(ents->data, o); o += 4;
            rec.rec.x0 = readF32(ents->data, o); o += 4;
            rec.rec.y0 = readF32(ents->data, o); o += 4;
            rec.rec.x1 = readF32(ents->data, o); o += 4;
            rec.rec.y1 = readF32(ents->data, o); o += 4;
            rec.rec.r = readF32(ents->data, o); o += 4;
            rec.rec.g = readF32(ents->data, o); o += 4;
            rec.rec.b = readF32(ents->data, o); o += 4;
            rec.rec.a = readF32(ents->data, o); o += 4;
            rec.rec.enabled = readF32(ents->data, o); o += 4;
            rec.rec.strokeWidthPx = readF32(ents->data, o); o += 4;
            out.lines.push_back(rec);
        }
        out.polylines.clear();
        out.polylines.reserve(polyCount);
        for (std::uint32_t i = 0; i < polyCount; ++i) {
            if (!requireBytes(o, polySnapshotBytes, ents->size)) return EngineError::BufferTruncated;
            PolySnapshot rec{};
            rec.rec.id = readU32(ents->data, o); o += 4;
            rec.layerId = readU32(ents->data, o); o += 4;
            rec.flags = readU32(ents->data, o); o += 4;
            rec.rec.offset = readU32(ents->data, o); o += 4;
            rec.rec.count = readU32(ents->data, o); o += 4;
            rec.rec.r = readF32(ents->data, o); o += 4;
            rec.rec.g = readF32(ents->data, o); o += 4;
            rec.rec.b = readF32(ents->data, o); o += 4;
            rec.rec.a = readF32(ents->data, o); o += 4;
            rec.rec.sr = readF32(ents->data, o); o += 4;
            rec.rec.sg = readF32(ents->data, o); o += 4;
            rec.rec.sb = readF32(ents->data, o); o += 4;
            rec.rec.sa = readF32(ents->data, o); o += 4;
            rec.rec.enabled = readF32(ents->data, o); o += 4;
            rec.rec.strokeEnabled = readF32(ents->data, o); o += 4;
            rec.rec.strokeWidthPx = readF32(ents->data, o); o += 4;
            out.polylines.push_back(rec);
        }
        out.points.clear();
        out.points.reserve(pointCount);
        for (std::uint32_t i = 0; i < pointCount; ++i) {
            if (!requireBytes(o, pointRecordBytes, ents->size)) return EngineError::BufferTruncated;
            Point2 p{};
            p.x = readF32(ents->data, o); o += 4;
            p.y = readF32(ents->data, o); o += 4;
            out.points.push_back(p);
        }
        out.circles.clear();
        out.circles.reserve(circleCount);
        for (std::uint32_t i = 0; i < circleCount; ++i) {
            if (!requireBytes(o, circleSnapshotBytes, ents->size)) return EngineError::BufferTruncated;
            CircleSnapshot rec{};
            rec.rec.id = readU32(ents->data, o); o += 4;
            rec.layerId = readU32(ents->data, o); o += 4;
            rec.flags = readU32(ents->data, o); o += 4;
            rec.rec.cx = readF32(ents->data, o); o += 4;
            rec.rec.cy = readF32(ents->data, o); o += 4;
            rec.rec.rx = readF32(ents->data, o); o += 4;
            rec.rec.ry = readF32(ents->data, o); o += 4;
            rec.rec.rot = readF32(ents->data, o); o += 4;
            rec.rec.sx = readF32(ents->data, o); o += 4;
            rec.rec.sy = readF32(ents->data, o); o += 4;
            rec.rec.r = readF32(ents->data, o); o += 4;
            rec.rec.g = readF32(ents->data, o); o += 4;
            rec.rec.b = readF32(ents->data, o); o += 4;
            rec.rec.a = readF32(ents->data, o); o += 4;
            rec.rec.sr = readF32(ents->data, o); o += 4;
            rec.rec.sg = readF32(ents->data, o); o += 4;
            rec.rec.sb = readF32(ents->data, o); o += 4;
            rec.rec.sa = readF32(ents->data, o); o += 4;
            rec.rec.strokeEnabled = readF32(ents->data, o); o += 4;
            rec.rec.strokeWidthPx = readF32(ents->data, o); o += 4;
            out.circles.push_back(rec);
        }
        out.polygons.clear();
        out.polygons.reserve(polygonCount);
        for (std::uint32_t i = 0; i < polygonCount; ++i) {
            if (!requireBytes(o, polygonSnapshotBytes, ents->size)) return EngineError::BufferTruncated;
            PolygonSnapshot rec{};
            rec.rec.id = readU32(ents->data, o); o += 4;
            rec.layerId = readU32(ents->data, o); o += 4;
            rec.flags = readU32(ents->data, o); o += 4;
            rec.rec.cx = readF32(ents->data, o); o += 4;
            rec.rec.cy = readF32(ents->data, o); o += 4;
            rec.rec.rx = readF32(ents->data, o); o += 4;
            rec.rec.ry = readF32(ents->data, o); o += 4;
            rec.rec.rot = readF32(ents->data, o); o += 4;
            rec.rec.sx = readF32(ents->data, o); o += 4;
            rec.rec.sy = readF32(ents->data, o); o += 4;
            rec.rec.sides = readU32(ents->data, o); o += 4;
            rec.rec.r = readF32(ents->data, o); o += 4;
            rec.rec.g = readF32(ents->data, o); o += 4;
            rec.rec.b = readF32(ents->data, o); o += 4;
            rec.rec.a = readF32(ents->data, o); o += 4;
            rec.rec.sr = readF32(ents->data, o); o += 4;
            rec.rec.sg = readF32(ents->data, o); o += 4;
            rec.rec.sb = readF32(ents->data, o); o += 4;
            rec.rec.sa = readF32(ents->data, o); o += 4;
            rec.rec.strokeEnabled = readF32(ents->data, o); o += 4;
            rec.rec.strokeWidthPx = readF32(ents->data, o); o += 4;
            out.polygons.push_back(rec);
        }
        out.arrows.clear();
        out.arrows.reserve(arrowCount);
        for (std::uint32_t i = 0; i < arrowCount; ++i) {
            if (!requireBytes(o, arrowSnapshotBytes, ents->size)) return EngineError::BufferTruncated;
            ArrowSnapshot rec{};
            rec.rec.id = readU32(ents->data, o); o += 4;
            rec.layerId = readU32(ents->data, o); o += 4;
            rec.flags = readU32(ents->data, o); o += 4;
            rec.rec.ax = readF32(ents->data, o); o += 4;
            rec.rec.ay = readF32(ents->data, o); o += 4;
            rec.rec.bx = readF32(ents->data, o); o += 4;
            rec.rec.by = readF32(ents->data, o); o += 4;
            rec.rec.head = readF32(ents->data, o); o += 4;
            rec.rec.sr = readF32(ents->data, o); o += 4;
            rec.rec.sg = readF32(ents->data, o); o += 4;
            rec.rec.sb = readF32(ents->data, o); o += 4;
            rec.rec.sa = readF32(ents->data, o); o += 4;
            rec.rec.strokeEnabled = readF32(ents->data, o); o += 4;
            rec.rec.strokeWidthPx = readF32(ents->data, o); o += 4;
            out.arrows.push_back(rec);
        }
        if (o > ents->size) return EngineError::BufferTruncated;
    }

    // LAYR
    {
        std::size_t o = 0;
        if (!requireBytes(o, 4, layr->size)) return EngineError::BufferTruncated;
        const std::uint32_t layerCount = readU32(layr->data, o); o += 4;

        out.layers.clear();
        out.layers.reserve(layerCount);
        for (std::uint32_t i = 0; i < layerCount; ++i) {
            if (!requireBytes(o, 16, layr->size)) return EngineError::BufferTruncated;
            LayerSnapshot rec{};
            rec.id = readU32(layr->data, o); o += 4;
            rec.order = readU32(layr->data, o); o += 4;
            rec.flags = readU32(layr->data, o); o += 4;
            const std::uint32_t nameLen = readU32(layr->data, o); o += 4;
            std::size_t namePlusStyle = 0;
            if (!tryAdd(static_cast<std::size_t>(nameLen), layerStyleSnapshotBytes, namePlusStyle)) {
                return EngineError::InvalidPayloadSize;
            }
            if (!requireBytes(o, namePlusStyle, layr->size)) return EngineError::BufferTruncated;
            rec.name.assign(reinterpret_cast<const char*>(layr->data + o), nameLen);
            o += nameLen;
            rec.style.strokeRGBA = readU32(layr->data, o); o += 4;
            rec.style.fillRGBA = readU32(layr->data, o); o += 4;
            rec.style.textColorRGBA = readU32(layr->data, o); o += 4;
            rec.style.textBackgroundRGBA = readU32(layr->data, o); o += 4;
            rec.style.strokeEnabled = layr->data[o++];
            rec.style.fillEnabled = layr->data[o++];
            rec.style.textBackgroundEnabled = layr->data[o++];
            rec.style.reserved = layr->data[o++];
            out.layers.push_back(rec);
        }
    }

    // ORDR
    {
        std::size_t o = 0;
        if (!requireBytes(o, 4, ordr->size)) return EngineError::BufferTruncated;
        const std::uint32_t count = readU32(ordr->data, o); o += 4;
        std::size_t orderBytes = 0;
        if (!tryMul(static_cast<std::size_t>(count), static_cast<std::size_t>(4), orderBytes)) {
            return EngineError::InvalidPayloadSize;
        }
        if (!requireBytes(o, orderBytes, ordr->size)) return EngineError::BufferTruncated;
        out.drawOrder.clear();
        out.drawOrder.reserve(count);
        for (std::uint32_t i = 0; i < count; ++i) {
            out.drawOrder.push_back(readU32(ordr->data, o));
            o += 4;
        }
    }

    // SELC
    {
        std::size_t o = 0;
        if (!requireBytes(o, 4, selc->size)) return EngineError::BufferTruncated;
        const std::uint32_t count = readU32(selc->data, o); o += 4;
        std::size_t selectionBytes = 0;
        if (!tryMul(static_cast<std::size_t>(count), static_cast<std::size_t>(4), selectionBytes)) {
            return EngineError::InvalidPayloadSize;
        }
        if (!requireBytes(o, selectionBytes, selc->size)) return EngineError::BufferTruncated;
        out.selection.clear();
        out.selection.reserve(count);
        for (std::uint32_t i = 0; i < count; ++i) {
            out.selection.push_back(readU32(selc->data, o));
            o += 4;
        }
    }

    // NIDX
    {
        if (nidx->size < 4) return EngineError::BufferTruncated;
        out.nextId = readU32(nidx->data, 0);
    }

    // TEXT
    {
        std::size_t o = 0;
        if (!requireBytes(o, 4, text->size)) return EngineError::BufferTruncated;
        const std::uint32_t count = readU32(text->data, o); o += 4;
        out.texts.clear();
        out.texts.reserve(count);
        for (std::uint32_t i = 0; i < count; ++i) {
            if (!requireBytes(o, textSnapshotHeaderBytes, text->size)) return EngineError::BufferTruncated;
            TextSnapshot rec{};
            rec.id = readU32(text->data, o); o += 4;
            rec.layerId = readU32(text->data, o); o += 4;
            rec.flags = readU32(text->data, o); o += 4;

            rec.header.x = readF32(text->data, o); o += 4;
            rec.header.y = readF32(text->data, o); o += 4;
            rec.header.rotation = readF32(text->data, o); o += 4;
            rec.header.boxMode = text->data[o];
            rec.header.align = text->data[o + 1];
            rec.header.reserved[0] = 0;
            rec.header.reserved[1] = 0;
            o += 4;
            rec.header.constraintWidth = readF32(text->data, o); o += 4;
            rec.header.runCount = readU32(text->data, o); o += 4;
            rec.header.contentLength = readU32(text->data, o); o += 4;

            rec.layoutWidth = readF32(text->data, o); o += 4;
            rec.layoutHeight = readF32(text->data, o); o += 4;
            rec.minX = readF32(text->data, o); o += 4;
            rec.minY = readF32(text->data, o); o += 4;
            rec.maxX = readF32(text->data, o); o += 4;
            rec.maxY = readF32(text->data, o); o += 4;

            std::size_t runBytes = 0;
            if (!tryMul(static_cast<std::size_t>(rec.header.runCount), textRunRecordBytes, runBytes)) {
                return EngineError::InvalidPayloadSize;
            }
            if (!requireBytes(o, runBytes, text->size)) {
                return EngineError::BufferTruncated;
            }
            rec.runs.clear();
            rec.runs.reserve(rec.header.runCount);
            for (std::uint32_t r = 0; r < rec.header.runCount; ++r) {
                TextRunPayload run{};
                run.startIndex = readU32(text->data, o); o += 4;
                run.length = readU32(text->data, o); o += 4;
                run.fontId = readU32(text->data, o); o += 4;
                run.fontSize = readF32(text->data, o); o += 4;
                run.colorRGBA = readU32(text->data, o); o += 4;
                run.flags = text->data[o];
                run.reserved[0] = 0;
                run.reserved[1] = 0;
                run.reserved[2] = 0;
                o += 4;
                rec.runs.push_back(run);
            }

            if (!requireBytes(o, rec.header.contentLength, text->size)) return EngineError::BufferTruncated;
            rec.content.assign(reinterpret_cast<const char*>(text->data + o), rec.header.contentLength);
            o += rec.header.contentLength;

            out.texts.push_back(rec);
        }
    }

    // STYL
    {
        std::size_t o = 0;
        if (!requireBytes(o, 4, styl->size)) return EngineError::BufferTruncated;
        const std::uint32_t count = readU32(styl->data, o); o += 4;
        if (!requireBytes(o, static_cast<std::size_t>(count) * styleOverrideSnapshotBytes, styl->size)) {
            return EngineError::BufferTruncated;
        }
        out.styleOverrides.clear();
        out.styleOverrides.reserve(count);
        for (std::uint32_t i = 0; i < count; ++i) {
            StyleOverrideSnapshot rec{};
            rec.id = readU32(styl->data, o); o += 4;
            rec.colorMask = styl->data[o++];
            rec.enabledMask = styl->data[o++];
            rec.reserved = static_cast<std::uint16_t>(styl->data[o])
                | static_cast<std::uint16_t>(styl->data[o + 1] << 8);
            o += 2;
            rec.textColorRGBA = readU32(styl->data, o); o += 4;
            rec.textBackgroundRGBA = readU32(styl->data, o); o += 4;
            rec.fillEnabled = readU32(styl->data, o); o += 4;
            rec.textBackgroundEnabled = readU32(styl->data, o); o += 4;
            out.styleOverrides.push_back(rec);
        }
    }

    return EngineError::Ok;
}


} // namespace engine
