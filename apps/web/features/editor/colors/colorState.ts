import { StyleState } from '@/engine/core/EngineRuntime';
import { LABELS } from '@/i18n/labels';

export type ColorStateIndicator = {
  kind: 'layer' | 'override' | 'none' | 'mixed';
  tooltip: string;
};

export const formatInheritedTooltip = (layerName: string): string =>
  LABELS.colors.inheritedTooltip.replace('{nome}', layerName);

export const getStateIndicator = (
  state: StyleState,
  layerName?: string,
): ColorStateIndicator | null => {
  switch (state) {
    case StyleState.Layer:
      return {
        kind: 'layer',
        tooltip: formatInheritedTooltip(layerName ?? ''),
      };
    case StyleState.Override:
      return {
        kind: 'override',
        tooltip: LABELS.colors.overrideTooltip,
      };
    case StyleState.None:
      return {
        kind: 'none',
        tooltip: LABELS.colors.noneTooltip,
      };
    case StyleState.Mixed:
      return {
        kind: 'mixed',
        tooltip: LABELS.colors.mixedTooltip,
      };
    default:
      return null;
  }
};
