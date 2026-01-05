import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import { StyleState } from '@/engine/core/protocol';
import { ColorStateBadge } from '@/features/editor/colors/ColorStateBadge';
import { getStateIndicator } from '@/features/editor/colors/colorState';
import { resolveColorTargetMode } from '@/features/editor/colors/useColorTargetResolver';
import { LABELS } from '@/i18n/labels';

describe('colors ribbon helpers', () => {
  it('resolves target priority for selection, tool, and layer', () => {
    expect(resolveColorTargetMode(2, 'line')).toBe('selection');
    expect(resolveColorTargetMode(0, 'line')).toBe('tool');
    expect(resolveColorTargetMode(0, 'text')).toBe('tool');
    expect(resolveColorTargetMode(0, 'select')).toBe('layer');
  });

  it('maps tooltips with exact PT-BR strings', () => {
    const layerTooltip = getStateIndicator(StyleState.Layer, 'Base')?.tooltip;
    expect(layerTooltip).toBe(LABELS.colors.inheritedTooltip.replace('{nome}', 'Base'));
    expect(getStateIndicator(StyleState.Override)?.tooltip).toBe(LABELS.colors.overrideTooltip);
    expect(getStateIndicator(StyleState.None)?.tooltip).toBe(LABELS.colors.noneTooltip);
    expect(getStateIndicator(StyleState.Mixed)?.tooltip).toBe(LABELS.colors.mixedTooltip);
  });

  it('renders mixed state indicator using the mixed label', () => {
    const indicator = getStateIndicator(StyleState.Mixed);
    const { getByText } = render(<ColorStateBadge indicator={indicator} />);
    expect(getByText(LABELS.text.mixed)).toBeTruthy();
  });
});
