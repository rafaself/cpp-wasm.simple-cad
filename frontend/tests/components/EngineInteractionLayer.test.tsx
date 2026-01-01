import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import EngineInteractionLayer from '@/features/editor/components/EngineInteractionLayer';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';

const mockGetRuntime = vi.fn();

vi.mock('@/engine/core/singleton', () => ({
  getEngineRuntime: () => mockGetRuntime(),
  getEngineRuntimeSync: () => null,
}));

describe('EngineInteractionLayer snap sync', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeTool: 'select',
      viewTransform: { x: 0, y: 0, scale: 1 },
      canvasSize: { width: 300, height: 300 },
    } as any);

    useSettingsStore.setState((state) => ({
      ...state,
      grid: { ...state.grid, size: 25 },
      snap: {
        ...state.snap,
        enabled: true,
        grid: true,
        tolerancePx: 12,
        endpoint: false,
        midpoint: true,
        center: false,
        nearest: true,
      },
      display: {
        ...state.display,
        centerIcon: { ...state.display.centerIcon, show: false },
      },
    }));
  });

  it('syncs snap options to engine', async () => {
    const runtime = {
      setSnapOptions: vi.fn(),
      apply: vi.fn(),
      getSelectionIds: () => [],
      isInteractionActive: () => false,
      draft: { getDraftDimensions: () => null },
      module: { HEAPU8: new Uint8Array() },
    };

    mockGetRuntime.mockResolvedValue(runtime);

    render(<EngineInteractionLayer />);

    await waitFor(() => {
      expect(runtime.setSnapOptions).toHaveBeenCalled();
    });

    expect(runtime.setSnapOptions).toHaveBeenLastCalledWith(
      true,
      true,
      25,
      12,
      false,
      true,
      false,
      true,
    );
  });
});
