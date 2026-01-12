// CadEngine style system methods
// Part of the engine.h class split for SRP compliance

#include "engine/engine.h"
#include "engine/internal/engine_state.h"
#include "engine/core/util.h"

namespace {
    ::StyleTarget toEntityStyleTarget(engine::protocol::StyleTarget target) {
        return static_cast<::StyleTarget>(static_cast<std::uint8_t>(target));
    }

    std::uint8_t targetMask(engine::protocol::StyleTarget target) {
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

    bool supportsTarget(EntityKind kind, engine::protocol::StyleTarget target) {
        return (EntityManager::styleCapabilities(kind) & targetMask(target)) != 0;
    }
}

engine::protocol::LayerStyleSnapshot CadEngine::getLayerStyle(std::uint32_t layerId) const {
    const LayerStyle style = state().entityManager_.layerStore.getLayerStyle(layerId);
    engine::protocol::LayerStyleSnapshot out{};
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

void CadEngine::setLayerStyle(std::uint32_t layerId, engine::protocol::StyleTarget target, std::uint32_t colorRGBA) {
    const bool historyStarted = beginHistoryEntry();
    markLayerChange();

    StyleColor color{};
    unpackColorRGBA(colorRGBA, color.r, color.g, color.b, color.a);
    state().entityManager_.layerStore.setLayerStyleColor(layerId, toEntityStyleTarget(target), color);

    state().renderDirty = true;
    state().snapshotDirty = true;
    if (target == engine::protocol::StyleTarget::TextColor || target == engine::protocol::StyleTarget::TextBackground) {
        markTextQuadsDirty();
    }

    recordLayerChanged(layerId, 0);
    recordDocChanged(static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style));
    state().generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setLayerStyleEnabled(std::uint32_t layerId, engine::protocol::StyleTarget target, bool enabled) {
    const bool historyStarted = beginHistoryEntry();
    markLayerChange();

    state().entityManager_.layerStore.setLayerStyleEnabled(layerId, toEntityStyleTarget(target), enabled);

    state().renderDirty = true;
    state().snapshotDirty = true;
    if (target == engine::protocol::StyleTarget::TextColor || target == engine::protocol::StyleTarget::TextBackground) {
        markTextQuadsDirty();
    }

    recordLayerChanged(layerId, 0);
    recordDocChanged(static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style));
    state().generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setEntityStyleOverride(const std::uint32_t* ids, std::uint32_t count, engine::protocol::StyleTarget target, std::uint32_t colorRGBA) {
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
        auto it = state().entityManager_.entities.find(id);
        if (it == state().entityManager_.entities.end()) continue;
        const EntityKind kind = it->second.kind;
        if (!supportsTarget(kind, target)) continue;

        markEntityChange(id);
        EntityStyleOverrides& overrides = state().entityManager_.ensureEntityStyleOverrides(id);
        overrides.colorMask |= bit;

        switch (target) {
            case engine::protocol::StyleTarget::Stroke: {
                if (kind == EntityKind::Line) {
                    auto& rec = state().entityManager_.lines[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Polyline) {
                    auto& rec = state().entityManager_.polylines[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Arrow) {
                    auto& rec = state().entityManager_.arrows[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                } else if (kind == EntityKind::Rect) {
                    auto& rec = state().entityManager_.rects[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                } else if (kind == EntityKind::Circle) {
                    auto& rec = state().entityManager_.circles[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                } else if (kind == EntityKind::Polygon) {
                    auto& rec = state().entityManager_.polygons[it->second.index];
                    rec.sr = color.r; rec.sg = color.g; rec.sb = color.b; rec.sa = color.a;
                }
                break;
            }
            case engine::protocol::StyleTarget::Fill: {
                if (kind == EntityKind::Rect) {
                    auto& rec = state().entityManager_.rects[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Circle) {
                    auto& rec = state().entityManager_.circles[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                } else if (kind == EntityKind::Polygon) {
                    auto& rec = state().entityManager_.polygons[it->second.index];
                    rec.r = color.r; rec.g = color.g; rec.b = color.b; rec.a = color.a;
                }
                break;
            }
            case engine::protocol::StyleTarget::TextColor:
                overrides.textColor = color;
                touched = true;
                break;
            case engine::protocol::StyleTarget::TextBackground:
                overrides.textBackground = color;
                touched = true;
                break;
            default:
                break;
        }

        recordEntityChanged(id, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style));
        changed = true;
    }

    if (!changed) {
        if (historyStarted) discardHistoryEntry();
        return;
    }

    state().renderDirty = true;
    state().snapshotDirty = true;
    if (touched) {
        markTextQuadsDirty();
    }
    state().generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::clearEntityStyleOverride(const std::uint32_t* ids, std::uint32_t count, engine::protocol::StyleTarget target) {
    if (!ids || count == 0) return;
    const bool historyStarted = beginHistoryEntry();

    const std::uint8_t bit = targetMask(target);
    bool touched = false;
    bool changed = false;

    for (std::uint32_t i = 0; i < count; ++i) {
        const std::uint32_t id = ids[i];
        if (id == DRAFT_ENTITY_ID) continue;
        auto it = state().entityManager_.styleOverrides.find(id);
        if (it == state().entityManager_.styleOverrides.end()) continue;

        markEntityChange(id);
        it->second.colorMask &= static_cast<std::uint8_t>(~bit);
        it->second.enabledMask &= static_cast<std::uint8_t>(~bit);
        if (it->second.colorMask == 0 && it->second.enabledMask == 0) {
            state().entityManager_.styleOverrides.erase(it);
        }
        if (target == engine::protocol::StyleTarget::TextColor || target == engine::protocol::StyleTarget::TextBackground) {
            touched = true;
        }

        recordEntityChanged(id, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style));
        changed = true;
    }

    if (!changed) {
        if (historyStarted) discardHistoryEntry();
        return;
    }

    state().renderDirty = true;
    state().snapshotDirty = true;
    if (touched) {
        markTextQuadsDirty();
    }
    state().generation++;

    if (historyStarted) commitHistoryEntry();
}

void CadEngine::setEntityStyleEnabled(const std::uint32_t* ids, std::uint32_t count, engine::protocol::StyleTarget target, bool enabled) {
    if (!ids || count == 0) return;
    const bool historyStarted = beginHistoryEntry();

    const std::uint8_t bit = targetMask(target);
    bool touched = false;
    bool changed = false;

    for (std::uint32_t i = 0; i < count; ++i) {
        const std::uint32_t id = ids[i];
        if (id == DRAFT_ENTITY_ID) continue;
        auto entIt = state().entityManager_.entities.find(id);
        if (entIt == state().entityManager_.entities.end()) continue;
        const EntityKind kind = entIt->second.kind;
        if (!supportsTarget(kind, target)) continue;

        markEntityChange(id);
        EntityStyleOverrides& overrides = state().entityManager_.ensureEntityStyleOverrides(id);
        overrides.enabledMask |= bit;

        switch (target) {
            case engine::protocol::StyleTarget::Stroke: {
                if (kind == EntityKind::Line) {
                    auto& rec = state().entityManager_.lines[entIt->second.index];
                    rec.enabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Polyline) {
                    auto& rec = state().entityManager_.polylines[entIt->second.index];
                    rec.enabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Arrow) {
                    auto& rec = state().entityManager_.arrows[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Rect) {
                    auto& rec = state().entityManager_.rects[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Circle) {
                    auto& rec = state().entityManager_.circles[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                } else if (kind == EntityKind::Polygon) {
                    auto& rec = state().entityManager_.polygons[entIt->second.index];
                    rec.strokeEnabled = enabled ? 1.0f : 0.0f;
                }
                break;
            }
            case engine::protocol::StyleTarget::Fill:
                overrides.fillEnabled = enabled ? 1.0f : 0.0f;
                break;
            case engine::protocol::StyleTarget::TextBackground:
                overrides.textBackgroundEnabled = enabled ? 1.0f : 0.0f;
                touched = true;
                break;
            default:
                break;
        }

        recordEntityChanged(id, static_cast<std::uint32_t>(engine::protocol::ChangeMask::Style));
        changed = true;
    }

    if (!changed) {
        if (historyStarted) discardHistoryEntry();
        return;
    }

    state().renderDirty = true;
    state().snapshotDirty = true;
    if (touched) {
        markTextQuadsDirty();
    }
    state().generation++;

    if (historyStarted) commitHistoryEntry();
}

engine::protocol::SelectionStyleSummary CadEngine::getSelectionStyleSummary() const {
    engine::protocol::SelectionStyleSummary summary{};
    const auto& ids = state().selectionManager_.getOrdered();
    summary.selectionCount = static_cast<std::uint32_t>(ids.size());

    auto buildSummary = [&](engine::protocol::StyleTarget target) {
        engine::protocol::StyleTargetSummary out{};
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
            const auto it = state().entityManager_.entities.find(id);
            if (it == state().entityManager_.entities.end()) continue;
            const EntityKind kind = it->second.kind;
            if ((EntityManager::styleCapabilities(kind) & bit) == 0) {
                unsupportedCount++;
                continue;
            }

            supportedCount++;
            const ResolvedStyle resolved = state().entityManager_.resolveStyle(id, kind);
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
            if (const EntityStyleOverrides* overrides = state().entityManager_.getEntityStyleOverrides(id)) {
                usesOverride = ((overrides->colorMask & bit) != 0) || ((overrides->enabledMask & bit) != 0);
            }
            if (usesOverride) {
                hasOverride = true;
            } else {
                hasLayer = true;
                const std::uint32_t lid = state().entityManager_.getEntityLayer(id);
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
            out.state = static_cast<std::uint8_t>(engine::protocol::StyleState::None);
            out.enabledState = static_cast<std::uint8_t>(engine::protocol::TriState::Off);
            out.supportedState = static_cast<std::uint8_t>(engine::protocol::TriState::Off);
            out.colorRGBA = 0;
            out.layerId = 0;
            return out;
        }

        if (unsupportedCount > 0) {
            mixed = true;
            out.supportedState = static_cast<std::uint8_t>(engine::protocol::TriState::Mixed);
        } else {
            out.supportedState = static_cast<std::uint8_t>(engine::protocol::TriState::On);
        }

        if (enabledMixed) {
            out.enabledState = static_cast<std::uint8_t>(engine::protocol::TriState::Mixed);
        } else {
            out.enabledState = enabled ? static_cast<std::uint8_t>(engine::protocol::TriState::On) : static_cast<std::uint8_t>(engine::protocol::TriState::Off);
        }

        if (mixed) {
            out.state = static_cast<std::uint8_t>(engine::protocol::StyleState::Mixed);
        } else if (hasOverride) {
            out.state = static_cast<std::uint8_t>(engine::protocol::StyleState::Override);
        } else {
            out.state = static_cast<std::uint8_t>(engine::protocol::StyleState::Layer);
        }

        if (target == engine::protocol::StyleTarget::Fill || target == engine::protocol::StyleTarget::TextBackground) {
            if (!mixed && !enabledMixed && !enabled) {
                out.state = static_cast<std::uint8_t>(engine::protocol::StyleState::None);
            }
        }

        out.colorRGBA = colorSet ? colorRGBA : 0;
        out.layerId = (!mixed && hasLayer) ? layerId : 0;
        return out;
    };

    summary.stroke = buildSummary(engine::protocol::StyleTarget::Stroke);
    summary.fill = buildSummary(engine::protocol::StyleTarget::Fill);
    summary.textColor = buildSummary(engine::protocol::StyleTarget::TextColor);
    summary.textBackground = buildSummary(engine::protocol::StyleTarget::TextBackground);
    return summary;
}
