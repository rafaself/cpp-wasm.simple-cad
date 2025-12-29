#include "engine/snapshot.h"
#include "engine/util.h"
#include "engine/types.h"
#include <algorithm>
#include <cstring>
#include <unordered_map>

namespace {

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

constexpr std::size_t rectSnapshotBytes = 12 + 14 * 4;
constexpr std::size_t lineSnapshotBytes = 12 + 10 * 4;
constexpr std::size_t polySnapshotBytes = 20 + 11 * 4;
constexpr std::size_t circleSnapshotBytes = 12 + 17 * 4;
constexpr std::size_t polygonSnapshotBytes = 12 + 17 * 4 + 4;
constexpr std::size_t arrowSnapshotBytes = 12 + 11 * 4;
constexpr std::size_t textSnapshotHeaderBytes = 64;

struct SectionView {
    const std::uint8_t* data{nullptr};
    std::uint32_t size{0};
};

std::uint32_t crc32(const std::uint8_t* bytes, std::size_t len) {
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

bool requireBytes(std::size_t offset, std::size_t size, std::size_t total) {
    return offset + size <= total;
}

} // namespace
namespace engine {

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
    const std::size_t tableBytes = static_cast<std::size_t>(sectionCount) * snapshotSectionEntryBytes;
    if (byteCount < headerBytes + tableBytes) {
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

        const std::size_t end = static_cast<std::size_t>(offset) + size;
        if (offset < headerBytes + tableBytes) return EngineError::InvalidPayloadSize;
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
    if (!ents || !layr || !ordr || !selc || !text || !nidx) {
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
            if (!requireBytes(o, nameLen, layr->size)) return EngineError::BufferTruncated;
            rec.name.assign(reinterpret_cast<const char*>(layr->data + o), nameLen);
            o += nameLen;
            out.layers.push_back(rec);
        }
    }

    // ORDR
    {
        std::size_t o = 0;
        if (!requireBytes(o, 4, ordr->size)) return EngineError::BufferTruncated;
        const std::uint32_t count = readU32(ordr->data, o); o += 4;
        if (!requireBytes(o, static_cast<std::size_t>(count) * 4, ordr->size)) return EngineError::BufferTruncated;
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
        if (!requireBytes(o, static_cast<std::size_t>(count) * 4, selc->size)) return EngineError::BufferTruncated;
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

            if (!requireBytes(o, static_cast<std::size_t>(rec.header.runCount) * textRunRecordBytes, text->size)) {
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

    return EngineError::Ok;
}

std::vector<std::uint8_t> buildSnapshotBytes(const SnapshotData& data) {
    const std::uint32_t version = snapshotVersionEsnp;

    struct SectionBytes {
        std::uint32_t tag;
        std::vector<std::uint8_t> bytes;
    };

    std::vector<SectionBytes> sections;
    sections.reserve(7);

    // ENTS
    {
        SectionBytes sec{TAG_ENTS, {}};
        auto& out = sec.bytes;

        std::vector<std::size_t> rectOrder(data.rects.size());
        for (std::size_t i = 0; i < rectOrder.size(); ++i) rectOrder[i] = i;
        std::sort(rectOrder.begin(), rectOrder.end(), [&](std::size_t a, std::size_t b) {
            return data.rects[a].rec.id < data.rects[b].rec.id;
        });

        std::vector<std::size_t> lineOrder(data.lines.size());
        for (std::size_t i = 0; i < lineOrder.size(); ++i) lineOrder[i] = i;
        std::sort(lineOrder.begin(), lineOrder.end(), [&](std::size_t a, std::size_t b) {
            return data.lines[a].rec.id < data.lines[b].rec.id;
        });

        std::vector<std::size_t> polyOrder(data.polylines.size());
        for (std::size_t i = 0; i < polyOrder.size(); ++i) polyOrder[i] = i;
        std::sort(polyOrder.begin(), polyOrder.end(), [&](std::size_t a, std::size_t b) {
            return data.polylines[a].rec.id < data.polylines[b].rec.id;
        });

        std::vector<std::size_t> circleOrder(data.circles.size());
        for (std::size_t i = 0; i < circleOrder.size(); ++i) circleOrder[i] = i;
        std::sort(circleOrder.begin(), circleOrder.end(), [&](std::size_t a, std::size_t b) {
            return data.circles[a].rec.id < data.circles[b].rec.id;
        });

        std::vector<std::size_t> polygonOrder(data.polygons.size());
        for (std::size_t i = 0; i < polygonOrder.size(); ++i) polygonOrder[i] = i;
        std::sort(polygonOrder.begin(), polygonOrder.end(), [&](std::size_t a, std::size_t b) {
            return data.polygons[a].rec.id < data.polygons[b].rec.id;
        });

        std::vector<std::size_t> arrowOrder(data.arrows.size());
        for (std::size_t i = 0; i < arrowOrder.size(); ++i) arrowOrder[i] = i;
        std::sort(arrowOrder.begin(), arrowOrder.end(), [&](std::size_t a, std::size_t b) {
            return data.arrows[a].rec.id < data.arrows[b].rec.id;
        });

        auto appendU32 = [&](std::uint32_t v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeU32LE(out.data(), o, v);
        };
        auto appendF32 = [&](float v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeF32LE(out.data(), o, v);
        };

        appendU32(static_cast<std::uint32_t>(rectOrder.size()));
        appendU32(static_cast<std::uint32_t>(lineOrder.size()));
        appendU32(static_cast<std::uint32_t>(polyOrder.size()));
        appendU32(static_cast<std::uint32_t>(data.points.size()));
        appendU32(static_cast<std::uint32_t>(circleOrder.size()));
        appendU32(static_cast<std::uint32_t>(polygonOrder.size()));
        appendU32(static_cast<std::uint32_t>(arrowOrder.size()));

        for (std::size_t idx : rectOrder) {
            const RectSnapshot& rec = data.rects[idx];
            appendU32(rec.rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendF32(rec.rec.x);
            appendF32(rec.rec.y);
            appendF32(rec.rec.w);
            appendF32(rec.rec.h);
            appendF32(rec.rec.r);
            appendF32(rec.rec.g);
            appendF32(rec.rec.b);
            appendF32(rec.rec.a);
            appendF32(rec.rec.sr);
            appendF32(rec.rec.sg);
            appendF32(rec.rec.sb);
            appendF32(rec.rec.sa);
            appendF32(rec.rec.strokeEnabled);
            appendF32(rec.rec.strokeWidthPx);
        }

        for (std::size_t idx : lineOrder) {
            const LineSnapshot& rec = data.lines[idx];
            appendU32(rec.rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendF32(rec.rec.x0);
            appendF32(rec.rec.y0);
            appendF32(rec.rec.x1);
            appendF32(rec.rec.y1);
            appendF32(rec.rec.r);
            appendF32(rec.rec.g);
            appendF32(rec.rec.b);
            appendF32(rec.rec.a);
            appendF32(rec.rec.enabled);
            appendF32(rec.rec.strokeWidthPx);
        }

        for (std::size_t idx : polyOrder) {
            const PolySnapshot& rec = data.polylines[idx];
            appendU32(rec.rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendU32(rec.rec.offset);
            appendU32(rec.rec.count);
            appendF32(rec.rec.r);
            appendF32(rec.rec.g);
            appendF32(rec.rec.b);
            appendF32(rec.rec.a);
            appendF32(rec.rec.sr);
            appendF32(rec.rec.sg);
            appendF32(rec.rec.sb);
            appendF32(rec.rec.sa);
            appendF32(rec.rec.enabled);
            appendF32(rec.rec.strokeEnabled);
            appendF32(rec.rec.strokeWidthPx);
        }

        for (const auto& p : data.points) {
            appendF32(p.x);
            appendF32(p.y);
        }

        for (std::size_t idx : circleOrder) {
            const CircleSnapshot& rec = data.circles[idx];
            appendU32(rec.rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendF32(rec.rec.cx);
            appendF32(rec.rec.cy);
            appendF32(rec.rec.rx);
            appendF32(rec.rec.ry);
            appendF32(rec.rec.rot);
            appendF32(rec.rec.sx);
            appendF32(rec.rec.sy);
            appendF32(rec.rec.r);
            appendF32(rec.rec.g);
            appendF32(rec.rec.b);
            appendF32(rec.rec.a);
            appendF32(rec.rec.sr);
            appendF32(rec.rec.sg);
            appendF32(rec.rec.sb);
            appendF32(rec.rec.sa);
            appendF32(rec.rec.strokeEnabled);
            appendF32(rec.rec.strokeWidthPx);
        }

        for (std::size_t idx : polygonOrder) {
            const PolygonSnapshot& rec = data.polygons[idx];
            appendU32(rec.rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendF32(rec.rec.cx);
            appendF32(rec.rec.cy);
            appendF32(rec.rec.rx);
            appendF32(rec.rec.ry);
            appendF32(rec.rec.rot);
            appendF32(rec.rec.sx);
            appendF32(rec.rec.sy);
            appendU32(rec.rec.sides);
            appendF32(rec.rec.r);
            appendF32(rec.rec.g);
            appendF32(rec.rec.b);
            appendF32(rec.rec.a);
            appendF32(rec.rec.sr);
            appendF32(rec.rec.sg);
            appendF32(rec.rec.sb);
            appendF32(rec.rec.sa);
            appendF32(rec.rec.strokeEnabled);
            appendF32(rec.rec.strokeWidthPx);
        }

        for (std::size_t idx : arrowOrder) {
            const ArrowSnapshot& rec = data.arrows[idx];
            appendU32(rec.rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendF32(rec.rec.ax);
            appendF32(rec.rec.ay);
            appendF32(rec.rec.bx);
            appendF32(rec.rec.by);
            appendF32(rec.rec.head);
            appendF32(rec.rec.sr);
            appendF32(rec.rec.sg);
            appendF32(rec.rec.sb);
            appendF32(rec.rec.sa);
            appendF32(rec.rec.strokeEnabled);
            appendF32(rec.rec.strokeWidthPx);
        }

        sections.push_back(std::move(sec));
    }

    // LAYR
    {
        SectionBytes sec{TAG_LAYR, {}};
        auto& out = sec.bytes;

        std::vector<std::size_t> order(data.layers.size());
        for (std::size_t i = 0; i < order.size(); ++i) order[i] = i;
        std::stable_sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) {
            return data.layers[a].order < data.layers[b].order;
        });

        auto appendU32 = [&](std::uint32_t v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeU32LE(out.data(), o, v);
        };

        appendU32(static_cast<std::uint32_t>(order.size()));
        for (std::size_t idx : order) {
            const LayerSnapshot& rec = data.layers[idx];
            appendU32(rec.id);
            appendU32(rec.order);
            appendU32(rec.flags);
            appendU32(static_cast<std::uint32_t>(rec.name.size()));
            const std::size_t o = out.size();
            out.resize(o + rec.name.size());
            if (!rec.name.empty()) {
                std::memcpy(out.data() + o, rec.name.data(), rec.name.size());
            }
        }

        sections.push_back(std::move(sec));
    }

    // ORDR
    {
        SectionBytes sec{TAG_ORDR, {}};
        auto& out = sec.bytes;
        const std::size_t total = 4 + data.drawOrder.size() * 4;
        out.resize(total);
        writeU32LE(out.data(), 0, static_cast<std::uint32_t>(data.drawOrder.size()));
        std::size_t o = 4;
        for (std::uint32_t id : data.drawOrder) {
            writeU32LE(out.data(), o, id);
            o += 4;
        }
        sections.push_back(std::move(sec));
    }

    // SELC
    {
        SectionBytes sec{TAG_SELC, {}};
        auto& out = sec.bytes;
        const std::size_t total = 4 + data.selection.size() * 4;
        out.resize(total);
        writeU32LE(out.data(), 0, static_cast<std::uint32_t>(data.selection.size()));
        std::size_t o = 4;
        for (std::uint32_t id : data.selection) {
            writeU32LE(out.data(), o, id);
            o += 4;
        }
        sections.push_back(std::move(sec));
    }

    // TEXT
    {
        SectionBytes sec{TAG_TEXT, {}};
        auto& out = sec.bytes;

        std::vector<std::size_t> order(data.texts.size());
        for (std::size_t i = 0; i < order.size(); ++i) order[i] = i;
        std::sort(order.begin(), order.end(), [&](std::size_t a, std::size_t b) {
            return data.texts[a].id < data.texts[b].id;
        });

        auto appendU32 = [&](std::uint32_t v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeU32LE(out.data(), o, v);
        };
        auto appendF32 = [&](float v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeF32LE(out.data(), o, v);
        };
        auto appendByte = [&](std::uint8_t v) {
            out.push_back(v);
        };

        appendU32(static_cast<std::uint32_t>(order.size()));
        for (std::size_t idx : order) {
            const TextSnapshot& rec = data.texts[idx];
            const std::uint32_t runCount = static_cast<std::uint32_t>(rec.runs.size());
            const std::uint32_t contentLength = static_cast<std::uint32_t>(rec.content.size());

            appendU32(rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendF32(rec.header.x);
            appendF32(rec.header.y);
            appendF32(rec.header.rotation);
            appendByte(rec.header.boxMode);
            appendByte(rec.header.align);
            appendByte(0);
            appendByte(0);
            appendF32(rec.header.constraintWidth);
            appendU32(runCount);
            appendU32(contentLength);
            appendF32(rec.layoutWidth);
            appendF32(rec.layoutHeight);
            appendF32(rec.minX);
            appendF32(rec.minY);
            appendF32(rec.maxX);
            appendF32(rec.maxY);

            for (const auto& run : rec.runs) {
                appendU32(run.startIndex);
                appendU32(run.length);
                appendU32(run.fontId);
                appendF32(run.fontSize);
                appendU32(run.colorRGBA);
                appendByte(run.flags);
                appendByte(0);
                appendByte(0);
                appendByte(0);
            }

            const std::size_t o = out.size();
            out.resize(o + contentLength);
            if (contentLength > 0) {
                std::memcpy(out.data() + o, rec.content.data(), contentLength);
            }
        }

        sections.push_back(std::move(sec));
    }

    // NIDX
    {
        SectionBytes sec{TAG_NIDX, {}};
        sec.bytes.resize(4);
        writeU32LE(sec.bytes.data(), 0, data.nextId);
        sections.push_back(std::move(sec));
    }

    // HIST (optional)
    if (!data.historyBytes.empty()) {
        SectionBytes sec{TAG_HIST, data.historyBytes};
        sections.push_back(std::move(sec));
    }

    const std::size_t headerBytes = snapshotHeaderBytesEsnp;
    const std::size_t tableBytes = sections.size() * snapshotSectionEntryBytes;
    std::size_t payloadBytes = 0;
    for (const auto& sec : sections) payloadBytes += sec.bytes.size();
    const std::size_t totalBytes = headerBytes + tableBytes + payloadBytes;

    std::vector<std::uint8_t> out;
    out.resize(totalBytes);

    writeU32LE(out.data(), 0, snapshotMagicEsnp);
    writeU32LE(out.data(), 4, version);
    writeU32LE(out.data(), 8, static_cast<std::uint32_t>(sections.size()));
    writeU32LE(out.data(), 12, 0);

    std::size_t tableOffset = headerBytes;
    std::size_t dataOffset = headerBytes + tableBytes;
    for (const auto& sec : sections) {
        writeU32LE(out.data(), tableOffset + 0, sec.tag);
        writeU32LE(out.data(), tableOffset + 4, static_cast<std::uint32_t>(dataOffset));
        writeU32LE(out.data(), tableOffset + 8, static_cast<std::uint32_t>(sec.bytes.size()));
        writeU32LE(out.data(), tableOffset + 12, crc32(sec.bytes.data(), sec.bytes.size()));
        std::memcpy(out.data() + dataOffset, sec.bytes.data(), sec.bytes.size());
        tableOffset += snapshotSectionEntryBytes;
        dataOffset += sec.bytes.size();
    }

    return out;
}

} // namespace engine
