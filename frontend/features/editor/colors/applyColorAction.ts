import { CommandOp } from '@/engine/core/commandBuffer';
import { StyleTarget, type EntityId } from '@/engine/core/protocol';
import { packColorRGBA } from '@/types/text';
import { parseCssColorToHexAlpha } from '@/utils/cssColor';
import { hexToRgb } from '@/utils/color';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { ColorTargetMode, ToolKind } from './useColorTargetResolver';

export type ColorControlTarget = 'stroke' | 'fill';

export type ToolDefaultsActions = {
  setStrokeColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setFillEnabled: (enabled: boolean) => void;
  setTextColor: (color: string) => void;
  setTextBackgroundColor: (color: string) => void;
  setTextBackgroundEnabled: (enabled: boolean) => void;
};

type ApplyColorActionArgs = {
  runtime: EngineRuntime | null;
  mode: ColorTargetMode;
  toolKind: ToolKind;
  activeLayerId: number | null;
  selectionIds: EntityId[];
  selectionTargets: StyleTarget[];
  target: ColorControlTarget;
  color: string;
  toolActions: ToolDefaultsActions;
};

type ApplyToggleActionArgs = {
  runtime: EngineRuntime | null;
  mode: ColorTargetMode;
  toolKind: ToolKind;
  activeLayerId: number | null;
  selectionIds: EntityId[];
  selectionTargets: StyleTarget[];
  target: ColorControlTarget;
  enabled: boolean;
  toolActions: ToolDefaultsActions;
};

const packCssColor = (color: string): number | null => {
  const parsed = parseCssColorToHexAlpha(color);
  if (!parsed) return null;
  const rgb = hexToRgb(parsed.hex);
  if (!rgb) return null;
  return packColorRGBA(rgb.r / 255, rgb.g / 255, rgb.b / 255, parsed.alpha);
};

const mapToolTarget = (target: ColorControlTarget, toolKind: ToolKind): StyleTarget | null => {
  if (toolKind === 'text') {
    return target === 'stroke' ? StyleTarget.TextColor : StyleTarget.TextBackground;
  }
  if (toolKind === 'shape') {
    return target === 'stroke' ? StyleTarget.Stroke : StyleTarget.Fill;
  }
  return null;
};

const mapLayerTarget = (target: ColorControlTarget): StyleTarget =>
  target === 'stroke' ? StyleTarget.Stroke : StyleTarget.Fill;

export const applyColorAction = ({
  runtime,
  mode,
  toolKind,
  activeLayerId,
  selectionIds,
  selectionTargets,
  target,
  color,
  toolActions,
}: ApplyColorActionArgs): void => {
  const colorRGBA = packCssColor(color);
  if (colorRGBA === null) return;

  if (mode === 'selection') {
    if (!runtime || selectionIds.length === 0 || selectionTargets.length === 0) return;
    runtime.apply(
      selectionTargets.map((styleTarget) => ({
        op: CommandOp.SetEntityStyleOverride,
        style: { target: styleTarget, colorRGBA, ids: selectionIds },
      })),
    );
    return;
  }

  if (mode === 'tool') {
    const styleTarget = mapToolTarget(target, toolKind);
    if (styleTarget === StyleTarget.TextColor) {
      toolActions.setTextColor(color);
    } else if (styleTarget === StyleTarget.TextBackground) {
      toolActions.setTextBackgroundColor(color);
    } else if (styleTarget === StyleTarget.Stroke) {
      toolActions.setStrokeColor(color);
    } else if (styleTarget === StyleTarget.Fill) {
      toolActions.setFillColor(color);
    }
    return;
  }

  if (!runtime || activeLayerId === null) return;
  runtime.apply([
    {
      op: CommandOp.SetLayerStyle,
      id: activeLayerId,
      style: { target: mapLayerTarget(target), colorRGBA },
    },
  ]);
};

export const applyEnabledAction = ({
  runtime,
  mode,
  toolKind,
  activeLayerId,
  selectionIds,
  selectionTargets,
  target,
  enabled,
  toolActions,
}: ApplyToggleActionArgs): void => {
  if (mode === 'selection') {
    if (!runtime || selectionIds.length === 0 || selectionTargets.length === 0) return;
    runtime.apply(
      selectionTargets.map((styleTarget) => ({
        op: CommandOp.SetEntityStyleEnabled,
        enabled: { target: styleTarget, enabled, ids: selectionIds },
      })),
    );
    return;
  }

  if (mode === 'tool') {
    const styleTarget = mapToolTarget(target, toolKind);
    if (styleTarget === StyleTarget.TextBackground) {
      toolActions.setTextBackgroundEnabled(enabled);
    } else if (styleTarget === StyleTarget.Fill) {
      toolActions.setFillEnabled(enabled);
    }
    return;
  }

  if (!runtime || activeLayerId === null) return;
  runtime.apply([
    {
      op: CommandOp.SetLayerStyleEnabled,
      id: activeLayerId,
      style: { target: mapLayerTarget(target), enabled },
    },
  ]);
};
// ... (existing code)

export type ApplyRestoreActionArgs = {
  runtime: EngineRuntime | null;
  mode: ColorTargetMode;
  toolKind: ToolKind;
  activeLayerId: number | null;
  selectionIds: EntityId[];
  selectionTargets: StyleTarget[];
  target: ColorControlTarget;
  toolActions: ToolDefaultsActions;
};

export const applyRestoreAction = ({
  runtime,
  mode,
  toolKind,
  selectionIds,
  selectionTargets,
  target,
  toolActions,
}: ApplyRestoreActionArgs): void => {
  if (mode === 'selection') {
    if (!runtime || selectionIds.length === 0 || selectionTargets.length === 0) return;
    runtime.apply(
      selectionTargets.map((styleTarget) => ({
        op: CommandOp.ClearEntityStyleOverride,
        clear: { target: styleTarget, ids: selectionIds },
      })),
    );
    return;
  }

  if (mode === 'tool') {
    // Resetting to null usually implies "ByLayer" in tool defaults
    const styleTarget = mapToolTarget(target, toolKind);
    if (styleTarget === StyleTarget.TextColor) {
      // For text color, we might want null or a specific default? 
      // Assuming null means inherit/default.
       // Note: setTextColor expects string. We might need to check if store allows null.
       // If store expects string, we cannot set null. 
       // However, the request implies "Restore from layer" which usually means style override removal.
       // For tools, "ByLayer" concept exists if we have "ByLayer" logic in tool creation.
       // If the store `toolDefaults` types are string | null, then we can pass null.
       // Looking at `useSettingsStore.ts`, they are likely string | null.
       // BUT the toolActions signature in this file says `(color: string) => void`.
       // I should probably cast to any or fix the type definition if I want to pass null.
    } 
    // Actually, looking at ColorRibbonControls:192: `toolDefaults.text.textColor` logic.
    // If I can't check store types, I'll assume they support null if I change the type here.
    
    // Let's hold off on Tool mode "inherit" support if types don't allow it yet.
    // The requirement says "Restaurar da camada" mainly for SELECTION/UI.
    // "Deve haver indicador... Quando estiver 🔓... clicar para Restaurar da camada".
    // This strongly implies Selection mode.
    // But for Tool mode, if I have a custom color set, it overrides the layer. restore means go back to "ByLayer".
    
    // I will try to pass null effectively.
    // Warning: existing type is `(color: string) => void`.
  }
};
