#pragma once

#include "engine/core/types.h"
#include <vector>
#include <unordered_map>
#include <cstdint>
#include <algorithm>
#include <string>

enum class LayerFlags : std::uint32_t {
    Visible = 1 << 0,
    Locked = 1 << 1,
};

enum class EntityFlags : std::uint32_t {
    Visible = 1 << 0,
    Locked = 1 << 1,
};

struct LayerRecord {
    std::uint32_t id;
    std::uint32_t order;
    std::uint32_t flags;
};

enum class StyleTarget : std::uint8_t {
    Stroke = 0,
    Fill = 1,
    TextColor = 2,
    TextBackground = 3,
};

struct StyleColor {
    float r{0.0f};
    float g{0.0f};
    float b{0.0f};
    float a{1.0f};
};

struct StyleEntry {
    StyleColor color{};
    float enabled{1.0f};
};

struct LayerStyle {
    StyleEntry stroke{};
    StyleEntry fill{};
    StyleEntry textColor{};
    StyleEntry textBackground{};
};

struct EntityStyleOverrides {
    std::uint8_t colorMask{0};
    std::uint8_t enabledMask{0};
    std::uint16_t reserved{0};
    StyleColor textColor{};
    StyleColor textBackground{};
    float fillEnabled{1.0f};
    float textBackgroundEnabled{0.0f};
};

struct ResolvedStyle {
    StyleEntry stroke{};
    StyleEntry fill{};
    StyleEntry textColor{};
    StyleEntry textBackground{};
};

class LayerStore {
public:
    static constexpr std::uint32_t kDefaultLayerId = 1;
    static constexpr std::uint32_t kDefaultFlags = static_cast<std::uint32_t>(LayerFlags::Visible);

    void clear();
    void ensureLayer(std::uint32_t id);
    bool deleteLayer(std::uint32_t id);
    void setLayerFlags(std::uint32_t id, std::uint32_t mask, std::uint32_t value);
    void setLayerName(std::uint32_t id, const std::string& name);
    void setLayerStyleColor(std::uint32_t id, StyleTarget target, const StyleColor& color);
    void setLayerStyleEnabled(std::uint32_t id, StyleTarget target, bool enabled);
    LayerStyle getLayerStyle(std::uint32_t id) const;
    void loadSnapshot(
        const std::vector<LayerRecord>& records,
        const std::vector<std::string>& names,
        const std::vector<LayerStyle>& styles);
    std::uint32_t getLayerFlags(std::uint32_t id) const;
    std::string getLayerName(std::uint32_t id) const;
    std::vector<LayerRecord> snapshot() const;
    bool isLayerVisible(std::uint32_t id) const;
    bool isLayerLocked(std::uint32_t id) const;

private:
    std::unordered_map<std::uint32_t, LayerRecord> layers_;
    std::unordered_map<std::uint32_t, std::string> names_;
    std::unordered_map<std::uint32_t, LayerStyle> styles_;
    std::vector<std::uint32_t> order_;
};

// Forward declaration if needed
struct Point2;

class EntityManager {
public:
    // Core geometric entities storage
    std::vector<RectRec> rects;
    std::vector<LineRec> lines;
    std::vector<PolyRec> polylines;
    std::vector<Point2> points;
    std::vector<CircleRec> circles;
    std::vector<PolygonRec> polygons;
    std::vector<ArrowRec> arrows;

    // Global entity index
    std::unordered_map<std::uint32_t, EntityRef> entities;
    
    // Draw order (list of IDs)
    std::vector<std::uint32_t> drawOrderIds;

    // Layer store (engine-authoritative)
    LayerStore layerStore;

    // Entity metadata
    std::unordered_map<std::uint32_t, std::uint32_t> entityFlags;
    std::unordered_map<std::uint32_t, std::uint32_t> entityLayers;
    std::unordered_map<std::uint32_t, EntityStyleOverrides> styleOverrides;

    EntityManager();

    void clear() noexcept;
    
    // Reserve capacity for vectors (optimization for snapshot loading)
    void reserve(std::uint32_t maxRects, std::uint32_t maxLines, std::uint32_t maxPolylines, std::uint32_t maxPoints);

    // Deletes an entity from the geometry vectors and index.
    // NOTE: For Text entities (which are stored externally in TextStore), 
    // this method only removes them from 'entities' map and 'drawOrderIds'.
    // The caller is responsible for cleaning up the external store.
    void deleteEntity(std::uint32_t id) noexcept;

    // Upsert methods
    void upsertRect(std::uint32_t id, float x, float y, float w, float h, float r, float g, float b, float a, float sr, float sg, float sb, float sa, float strokeEnabled, float strokeWidthPx);
    void upsertLine(std::uint32_t id, float x0, float y0, float x1, float y1, float r, float g, float b, float a, float enabled, float strokeWidthPx);
    void upsertPolyline(std::uint32_t id, std::uint32_t offset, std::uint32_t count, float r, float g, float b, float a, float enabled, float strokeWidthPx);
    void upsertCircle(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);
    void upsertPolygon(std::uint32_t id, float cx, float cy, float rx, float ry, float rot, float sx, float sy, std::uint32_t sides, float fillR, float fillG, float fillB, float fillA, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);
    void upsertArrow(std::uint32_t id, float ax, float ay, float bx, float by, float head, float strokeR, float strokeG, float strokeB, float strokeA, float strokeEnabled, float strokeWidthPx);

    // Text registration helper (called by CadEngine when text is added)
    void registerTextEntity(std::uint32_t id);

    // Entity metadata helpers
    void ensureEntityMetadata(std::uint32_t id);
    void setEntityLayer(std::uint32_t id, std::uint32_t layerId);
    std::uint32_t getEntityLayer(std::uint32_t id) const;
    EntityStyleOverrides* getEntityStyleOverrides(std::uint32_t id);
    const EntityStyleOverrides* getEntityStyleOverrides(std::uint32_t id) const;
    EntityStyleOverrides& ensureEntityStyleOverrides(std::uint32_t id);
    void clearEntityStyleOverrides(std::uint32_t id);
    void setEntityFlags(std::uint32_t id, std::uint32_t mask, std::uint32_t value);
    std::uint32_t getEntityFlags(std::uint32_t id) const;
    bool isEntityVisible(std::uint32_t id) const;
    bool isEntityLocked(std::uint32_t id) const;
    bool isEntityPickable(std::uint32_t id) const;

    // Garbage collection for polyline points
    void compactPolylinePoints();

    // Accessors needed by PickSystem
    const RectRec* getRect(std::uint32_t id) const;
    const LineRec* getLine(std::uint32_t id) const;
    const PolyRec* getPolyline(std::uint32_t id) const;
    const CircleRec* getCircle(std::uint32_t id) const;
    const PolygonRec* getPolygon(std::uint32_t id) const;
    const ArrowRec* getArrow(std::uint32_t id) const;
    const std::vector<Point2>& getPoints() const { return points; }

    ResolvedStyle resolveStyle(std::uint32_t id, EntityKind kind) const;
    static std::uint8_t styleTargetMask(StyleTarget target);
    static std::uint8_t styleCapabilities(EntityKind kind);
};
