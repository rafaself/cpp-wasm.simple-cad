// CadEngine style system methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state_aliases.h"
#include "engine/core/util.h"

namespace {
    ::StyleTarget toEntityStyleTarget(CadEngine::StyleTarget target) {
        return static_cast<::StyleTarget>(static_cast<std::uint8_t>(target));
    }

    std::uint8_t targetMask(CadEngine::StyleTarget target) {
        return EntityManager::styleTargetMask(toEntityStyleTarget(target));
    }

    StyleEntry selectEntry(const ResolvedStyle& style, ::StyleTarget target) {
        switch (target) {
            case ::StyleTarget::Stroke: return style.stroke;
            case ::StyleTarget::Fill: return style.fill;
            case ::StyleTarget::TextColor: return style.textColor;
            case ::StyleTarget::TextBackground: return style.textBackground;
            default: return StyleEntry{};
        }
    }

    bool supportsTarget(EntityKind kind, CadEngine::StyleTarget target) {
        return (EntityManager::styleCapabilities(kind) & targetMask(target)) != 0;
    }
}

CadEngine::LayerStyleSnapshot CadEngine::getLayerStyle(std::uint32_t layerId) const {
    const LayerStyle style = entityManager_.layerStore.getLayerStyle(layerId);
    LayerStyleSnapshot out{};
    out.strokeRGBA = packColorRGBA(style.stroke.color.r, style.stroke.color.g, style.stroke.color.b, style.stroke.color.a);
    out.fillRGBA = packColorRGBA(style.fill.color.r, style.fill.color.g, style.fill.color.b, style.fill.color.a);
    out.textColorRGBA = packColorRGBA(style.textColor.color.r, style.textColor.color.g, style.textColor.color.b, style.textColor.color.a);
    out.textBackgroundRGBA = packColorRGBA(
        style.textBackground.color.r,
        style.textBackground.color.g,
        style.textBackground.color.b,
        style.textBackground.color.a);
    out.strokeEnabled = style.stroke.enabled > 0.5f ? 1 : 0;
    out.fillEnabled = style.fill.enabled > 0.5f ? 1 : 0;
    out.textBackgroundEnabled = style.textBackground.enabled > 0.5f ? 1 : 0;
    out.reserved = 0;
    return out;
}

void CadEngine::setLayerStyle(std::uint32_t layerId, StyleTarget target, std::uint32_t colorRGBA) {
    const bool historyStarted = beginHistoryEntry();
    markLayerChange();

    StyleColor color{};
    unpackColorRGBA(colorRGBA, color.r, color.g, color.b, color.a);
    entityManager_.layerStore.setLayerStyleColor(layerId, toEntityStyleTarget(target), color);

    renderDirty = true;
    snapshotDirty = true;
    if (target == StyleTarget::TextColor || target == StyleTarget::TextBackground) {
        markTextQuadsDirty();
    }

    recordLayerChanged(layerId, 0);
    recordDocChanged(static_cast<std::uint32_t>(ChangeMask::Style));
    generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setLayerStyleEnabled(std::uint32_t layerId, StyleTarget target, bool enabled) {
    const bool historyStarted = beginHistoryEntry();
    markLayerChange();

    entityManager_.layerStore.setLayerStyleEnabled(layerId, toEntityStyleTarget(target), enabled);

    renderDirty = true;
    snapshotDirty = true;
    if (target == StyleTarget::TextColor || target == StyleTarget::TextBackground) {
        markTextQuadsDirty();
    }

    recordLayerChanged(layerId, 0);
    recordDocChanged(static_cast<std::uint32_t>(ChangeMask::Style));
    generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setEntityStyleOverride(const std::uint32_t* ids, std::uint32_t count, StyleTarget target, std::uint32_t colorRGBA) {
    if (!ids || count == 0) return;
    const bool historyStarted = beginHistoryEntry();

    StyleColor color{};
    unpackColorRGBA(colorRGBA, color.r, color.g, color.b, color.a);
    const std::uint8_t bit = targetMask(target);
    bool touched = false;
    bool changed = false;

    for (std::uint32_t i = 0; i < count; ++i) {
        const std::uint32_t id = ids[i];
        if (id == DRAFT_ENTITY_ID) continue;
        auto it = entityManager_.entities.find(id);
        if (it == entityManager_.entities.end()) continue;
        const EntityKind kind = it->second.kind;
        if (!supportsTarget(kind, target)) continue;

        markEntityChange(id);
        EntityStyleOverrides& overrides = entityManager_.ensureEntityStyleOverrides(id);
        overrides.colorMask |= bit;

        switch (target) {
            case StyleTarget::Stroke: {
                if (kind == EntityKind::Line) {
                    auto& rec = entityManager_.lines[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Polyline) {
                    auto& rec = entityManager_.polylines[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Arrow) {
                    auto& rec = entityManager_.arrows[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                } else if (kind == EntityKind::Rect) {
                    auto& rec = entityManager_.rects[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                } else if (kind == EntityKind::Circle) {
                    auto& rec = entityManager_.circles[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                } else if (kind == EntityKind::Polygon) {
                    auto& rec = entityManager_.polygons[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                }
                break;
            }
            case StyleTarget::Fill: {
                if (kind == EntityKind::Rect) {
                    auto& rec = entityManager_.rects[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Circle) {
                    auto& rec = entityManager_.circles[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Polygon) {
                    auto& rec = entityManager_.polygons[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                }
                break;
            }
            case StyleTarget::TextColor:
                overrides.textColor = color;
                touched = true;
                break;
            case StyleTarget::TextBackground:
                overrides.textBackground = color;
                touched = true;
                break;
            default:
                break;
        }

        recordEntityChanged(id, static_cast<std::uint32_t>(ChangeMask::Style));
        changed = true;
    }

    if (!changed) {
        if (historyStarted) discardHistoryEntry();
        return;
    }

    renderDirty = true;
    snapshotDirty = true;
    if (touched) {
        markTextQuadsDirty();
    }
    generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::clearEntityStyleOverride(const std::uint32_t* ids, std::uint32_t count, StyleTarget target) {
    if (!ids || count == 0) return;
    const bool historyStarted = beginHistoryEntry();

    const std::uint8_t bit = targetMask(target);
    bool touched = false;
    bool changed = false;

    for (std::uint32_t i = 0; i < count; ++i) {
        const std::uint32_t id = ids[i];
        if (id == DRAFT_ENTITY_ID) continue;
        auto it = entityManager_.styleOverrides.find(id);
        if (it == entityManager_.styleOverrides.end()) continue;

        markEntityChange(id);
        it->second.colorMask &= static_cast<std::uint8_t>(~bit);
        it->second.enabledMask &= static_cast<std::uint8_t>(~bit);
        if (it->second.colorMask == 0 && it->second.enabledMask == 0) {
            entityManager_.styleOverrides.erase(it);
        }
        if (target == StyleTarget::TextColor || target == StyleTarget::TextBackground) {
            touched = true;
        }

        recordEntityChanged(id, static_cast<std::uint32_t>(ChangeMask::Style));
        changed = true;
    }

    if (!changed) {
        if (historyStarted) discardHistoryEntry();
        return;
    }

    renderDirty = true;
    snapshotDirty = true;
    if (touched) {
        markTextQuadsDirty();
    }
    generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setEntityStyleEnabled(const std::uint32_t* ids, std::uint32_t count, StyleTarget target, bool enabled) {
    if (!ids || count == 0) return;
    const bool historyStarted = beginHistoryEntry();

    const std::uint8_t bit = targetMask(target);
    bool touched = false;
    bool changed = false;

    for (std::uint32_t i = 0; i < count; ++i) {
        const std::uint32_t id = ids[i];
        if (id == DRAFT_ENTITY_ID) continue;
        auto entIt = entityManager_.entities.find(id);
        if (entIt == entityManager_.entities.end()) continue;
        const EntityKind kind = entIt->second.kind;
        if (!supportsTarget(kind, target)) continue;

        markEntityChange(id);
        EntityStyleOverrides& overrides = entityManager_.ensureEntityStyleOverrides(id);
        overrides.enabledMask |= bit;

        switch (target) {
            case StyleTarget::Stroke: {
                if (kind == EntityKind::Line) {
                    auto& rec = entityManager_.lines[entIt->second.index];
                    rec.enabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Polyline) {
                    auto& rec = entityManager_.polylines[entIt->second.index];
                    rec.enabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Arrow) {
                    auto& rec = entityManager_.arrows[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Rect) {
                    auto& rec = entityManager_.rects[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Circle) {
                    auto& rec = entityManager_.circles[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Polygon) {
                    auto& rec = entityManager_.polygons[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                }
                break;
            }
            case StyleTarget::Fill:
                overrides.fillEnabled = enabled ? 1.0f : 0.0f;
                break;
            case StyleTarget::TextBackground:
                overrides.textBackgroundEnabled = enabled ? 1.0f : 0.0f;
                touched = true;
                break;
            default:
                break;
        }

        recordEntityChanged(id, static_cast<std::uint32_t>(ChangeMask::Style));
        changed = true;
    }

    if (!changed) {
        if (historyStarted) discardHistoryEntry();
        return;
    }

    renderDirty = true;
    snapshotDirty = true;
    if (touched) {
        markTextQuadsDirty();
    }
    generation++;

    if (historyStarted) commitHistoryEntry();
}

CadEngine::SelectionStyleSummary CadEngine::getSelectionStyleSummary() const {
    SelectionStyleSummary summary{};
    const auto& ids = selectionManager_.getOrdered();
    summary.selectionCount = static_cast<std::uint32_t>(ids.size());

    auto buildSummary = [&](StyleTarget target) {
        StyleTargetSummary out{};
        const ::StyleTarget entityTarget = toEntityStyleTarget(target);
        const std::uint8_t bit = targetMask(target);
        std::uint32_t supportedCount = 0;
        std::uint32_t unsupportedCount = 0;
        bool hasOverride = false;
        bool hasLayer = false;
        bool mixed = false;
        bool colorSet = false;
        std::uint32_t colorRGBA = 0;
        bool enabledSet = false;
        bool enabled = false;
        bool enabledMixed = false;
        bool layerSet = false;
        std::uint32_t layerId = 0;

        for (const std::uint32_t id : ids) {
            const auto it = entityManager_.entities.find(id);
            if (it == entityManager_.entities.end()) continue;
            const EntityKind kind = it->second.kind;
            if ((EntityManager::styleCapabilities(kind) & bit) == 0) {
                unsupportedCount++;
                continue;
            }

            supportedCount++;
            const ResolvedStyle resolved = entityManager_.resolveStyle(id, kind);
            const StyleEntry entry = selectEntry(resolved, entityTarget);
            const bool entryEnabled = entry.enabled > 0.5f;

            if (!enabledSet) {
                enabledSet = true;
                enabled = entryEnabled;
            } else if (enabled != entryEnabled) {
                enabledMixed = true;
                mixed = true;
            }

            const std::uint32_t packed = packColorRGBA(entry.color.r, entry.color.g, entry.color.b, entry.color.a);
            if (!colorSet) {
                colorSet = true;
                colorRGBA = packed;
            } else if (colorRGBA != packed) {
                mixed = true;
            }

            bool usesOverride = false;
            if (const EntityStyleOverrides* overrides = entityManager_.getEntityStyleOverrides(id)) {
                usesOverride = ((overrides->colorMask & bit) != 0) || ((overrides->enabledMask & bit) != 0);
            }
            if (usesOverride) {
                hasOverride = true;
            } else {
                hasLayer = true;
                const std::uint32_t lid = entityManager_.getEntityLayer(id);
                if (!layerSet) {
                    layerSet = true;
                    layerId = lid;
                } else if (layerId != lid) {
                    mixed = true;
                }
            }
            if (hasOverride && hasLayer) {
                mixed = true;
            }
        }

        if (supportedCount == 0) {
            out.state = static_cast<std::uint8_t>(StyleState::None);
            out.enabledState = static_cast<std::uint8_t>(TriState::Off);
            out.supportedState = static_cast<std::uint8_t>(TriState::Off);
            out.colorRGBA = 0;
            out.layerId = 0;
            return out;
        }

        if (unsupportedCount > 0) {
            mixed = true;
            out.supportedState = static_cast<std::uint8_t>(TriState::Mixed);
        } else {
            out.supportedState = static_cast<std::uint8_t>(TriState::On);
        }

        if (enabledMixed) {
            out.enabledState = static_cast<std::uint8_t>(TriState::Mixed);
        } else {
            out.enabledState = enabled ? static_cast<std::uint8_t>(TriState::On) : static_cast<std::uint8_t>(TriState::Off);
        }

        if (mixed) {
            out.state = static_cast<std::uint8_t>(StyleState::Mixed);
        } else if (hasOverride) {
            out.state = static_cast<std::uint8_t>(StyleState::Override);
        } else {
            out.state = static_cast<std::uint8_t>(StyleState::Layer);
        }

        if (target == StyleTarget::Fill || target == StyleTarget::TextBackground) {
            if (!mixed && !enabledMixed && !enabled) {
                out.state = static_cast<std::uint8_t>(StyleState::None);
            }
        }

        out.colorRGBA = colorSet ? colorRGBA : 0;
        out.layerId = (!mixed && hasLayer) ? layerId : 0;
        return out;
    };

    summary.stroke = buildSummary(StyleTarget::Stroke);
    summary.fill = buildSummary(StyleTarget::Fill);
    summary.textColor = buildSummary(StyleTarget::TextColor);
    summary.textBackground = buildSummary(StyleTarget::TextBackground);
    return summary;
}

#include "engine/internal/engine_state_aliases_undef.h"
