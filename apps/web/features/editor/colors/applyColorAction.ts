import { CommandOp } from '@/engine/core/commandBuffer';
import { StyleTarget, type EntityId } from '@/engine/core/protocol';
import { packColorRGBA } from '@/types/text';
import { parseCssColorToHexAlpha } from '@/utils/cssColor';
import { hexToRgb } from '@/utils/color';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { ColorTargetMode, ToolKind } from './useColorTargetResolver';

export type ColorControlTarget = 'stroke' | 'fill';

export type ToolDefaultsActions = {
  setStrokeColor: (color: string | null) => void;
  setFillColor: (color: string | null) => void;
  setFillEnabled: (enabled: boolean) => void;
  setTextColor: (color: string | null) => void;
  setTextBackgroundColor: (color: string | null) => void;
  setTextBackgroundEnabled: (enabled: boolean) => void;
};

type ApplyColorActionArgs = {
  runtime: EngineRuntime | null;
  mode: ColorTargetMode;
  toolKind: ToolKind;
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

export const applyColorAction = ({
  runtime,
  mode,
  toolKind,
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

  // Mode 'none': no action - ribbon controls should be disabled
};

export const applyEnabledAction = ({
  runtime,
  mode,
  toolKind,
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

  // Mode 'none': no action - ribbon controls should be disabled
};
// ... (existing code)

export type ApplyRestoreActionArgs = {
  runtime: EngineRuntime | null;
  mode: ColorTargetMode;
  toolKind: ToolKind;
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
    // Restaurar para ByLayer significa definir como null nos defaults da ferramenta
    // Quando null, a entidade criada herdará a cor da camada
    const styleTarget = mapToolTarget(target, toolKind);
    if (styleTarget === StyleTarget.TextColor) {
      toolActions.setTextColor(null);
    } else if (styleTarget === StyleTarget.TextBackground) {
      toolActions.setTextBackgroundColor(null);
      toolActions.setTextBackgroundEnabled(true);
    } else if (styleTarget === StyleTarget.Stroke) {
      toolActions.setStrokeColor(null);
    } else if (styleTarget === StyleTarget.Fill) {
      toolActions.setFillColor(null);
      toolActions.setFillEnabled(true);
    }
    return;
  }

  // Mode 'none': no action - ribbon controls should be disabled
};

/**
 * Apply color directly to a layer.
 * This function is intended ONLY for the Layer Manager UI, where direct layer editing is expected.
 * The Ribbon CORES section should NEVER use this function - it should use applyColorAction instead.
 */
export const applyLayerColorAction = ({
  runtime,
  layerId,
  target,
  color,
}: {
  runtime: EngineRuntime | null;
  layerId: number;
  target: ColorControlTarget;
  color: string;
}): void => {
  const colorRGBA = packCssColor(color);
  if (colorRGBA === null || !runtime) return;

  const styleTarget = target === 'stroke' ? StyleTarget.Stroke : StyleTarget.Fill;
  runtime.apply([
    {
      op: CommandOp.SetLayerStyle,
      id: layerId,
      style: { target: styleTarget, colorRGBA },
    },
  ]);
};
