#include "engine/persistence/snapshot.h"
#include "engine/core/util.h"
#include "engine/core/types.h"
#include "engine/persistence/snapshot_internal.h"
#include <algorithm>
#include <cstring>

namespace engine {
using namespace snapshot::detail;

std::vector<std::uint8_t> buildSnapshotBytes(const SnapshotData& data) {
    const std::uint32_t version = snapshotVersionEsnp;

    struct SectionBytes {
        std::uint32_t tag;
        std::vector<std::uint8_t> bytes;
    };

    std::vector<SectionBytes> sections;
    sections.reserve(8);

    auto appendBytes = [](std::vector<std::uint8_t>& out, const void* src, std::size_t size) {
        const std::size_t o = out.size();
        out.resize(o + size);
        if (size > 0) {
            std::memcpy(out.data() + o, src, size);
        }
    };

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

        for (const Point2& p : data.points) {
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

        auto appendU32 = [&](std::uint32_t v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeU32LE(out.data(), o, v);
        };

        appendU32(static_cast<std::uint32_t>(data.layers.size()));
        for (const LayerSnapshot& rec : data.layers) {
            appendU32(rec.id);
            appendU32(rec.order);
            appendU32(rec.flags);
            appendU32(static_cast<std::uint32_t>(rec.name.size()));
            appendBytes(out, rec.name.data(), rec.name.size());
            appendU32(rec.style.strokeRGBA);
            appendU32(rec.style.fillRGBA);
            appendU32(rec.style.textColorRGBA);
            appendU32(rec.style.textBackgroundRGBA);
            out.push_back(rec.style.strokeEnabled);
            out.push_back(rec.style.fillEnabled);
            out.push_back(rec.style.textBackgroundEnabled);
            out.push_back(rec.style.reserved);
        }

        sections.push_back(std::move(sec));
    }

    // ORDR
    {
        SectionBytes sec{TAG_ORDR, {}};
        auto& out = sec.bytes;

        auto appendU32 = [&](std::uint32_t v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeU32LE(out.data(), o, v);
        };

        appendU32(static_cast<std::uint32_t>(data.drawOrder.size()));
        for (std::uint32_t id : data.drawOrder) {
            appendU32(id);
        }

        sections.push_back(std::move(sec));
    }

    // SELC
    {
        SectionBytes sec{TAG_SELC, {}};
        auto& out = sec.bytes;

        auto appendU32 = [&](std::uint32_t v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeU32LE(out.data(), o, v);
        };

        appendU32(static_cast<std::uint32_t>(data.selection.size()));
        for (std::uint32_t id : data.selection) {
            appendU32(id);
        }

        sections.push_back(std::move(sec));
    }

    // TEXT
    {
        SectionBytes sec{TAG_TEXT, {}};
        auto& out = sec.bytes;

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

        appendU32(static_cast<std::uint32_t>(data.texts.size()));
        for (const TextSnapshot& rec : data.texts) {
            const std::uint32_t runCount = static_cast<std::uint32_t>(rec.runs.size());
            const std::uint32_t contentLength = static_cast<std::uint32_t>(rec.content.size());

            appendU32(rec.id);
            appendU32(rec.layerId);
            appendU32(rec.flags);
            appendF32(rec.header.x);
            appendF32(rec.header.y);
            appendF32(rec.header.rotation);
            out.push_back(static_cast<std::uint8_t>(rec.header.boxMode));
            out.push_back(static_cast<std::uint8_t>(rec.header.align));
            out.push_back(0);
            out.push_back(0);
            appendF32(rec.header.constraintWidth);
            appendU32(runCount);
            appendU32(contentLength);
            appendF32(rec.layoutWidth);
            appendF32(rec.layoutHeight);
            appendF32(rec.minX);
            appendF32(rec.minY);
            appendF32(rec.maxX);
            appendF32(rec.maxY);

            for (const TextRunPayload& run : rec.runs) {
                appendU32(run.startIndex);
                appendU32(run.length);
                appendU32(run.fontId);
                appendF32(run.fontSize);
                appendU32(run.colorRGBA);
                out.push_back(run.flags);
                out.push_back(0);
                out.push_back(0);
                out.push_back(0);
            }

            appendBytes(out, rec.content.data(), rec.content.size());
        }

        sections.push_back(std::move(sec));
    }

    // STYL
    {
        SectionBytes sec{TAG_STYL, {}};
        auto& out = sec.bytes;

        auto appendU32 = [&](std::uint32_t v) {
            const std::size_t o = out.size();
            out.resize(o + 4);
            writeU32LE(out.data(), o, v);
        };

        appendU32(static_cast<std::uint32_t>(data.styleOverrides.size()));
        for (const auto& rec : data.styleOverrides) {
            appendU32(rec.id);
            out.push_back(rec.colorMask);
            out.push_back(rec.enabledMask);
            out.push_back(static_cast<std::uint8_t>(rec.reserved & 0xFF));
            out.push_back(static_cast<std::uint8_t>((rec.reserved >> 8) & 0xFF));
            appendU32(rec.textColorRGBA);
            appendU32(rec.textBackgroundRGBA);
            appendU32(rec.fillEnabled);
            appendU32(rec.textBackgroundEnabled);
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
