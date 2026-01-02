import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import ShapeOverlay from '@/features/editor/components/ShapeOverlay';
import { EntityKind } from '@/engine/types';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';

const mockGetRuntime = vi.fn();

vi.mock('@/engine/core/singleton', () => ({
  getEngineRuntime: () => mockGetRuntime(),
  getEngineRuntimeSync: () => null,
}));

describe('ShapeOverlay', () => {
  let rafSpy: ReturnType<typeof vi.spyOn> | null = null;
  let cafSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    useUIStore.setState({
      isEditingAppearance: false,
      engineInteractionActive: false,
      canvasSize: { width: 200, height: 200 },
      viewTransform: { x: 0, y: 0, scale: 1 },
    } as any);
    useSettingsStore.setState({
      featureFlags: {
        enableEngineResize: false,
        enablePickProfiling: false,
        enablePickThrottling: false,
      },
      engineCapabilitiesMask: 0,
    } as any);

    if (!window.requestAnimationFrame) {
      (window as any).requestAnimationFrame = () => 0;
    }
    if (!window.cancelAnimationFrame) {
      (window as any).cancelAnimationFrame = () => undefined;
    }
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    rafSpy?.mockRestore();
    cafSpy?.mockRestore();
    vi.clearAllMocks();
  });

  it('renders group selection bbox and handles for multi-selection', async () => {
    const runtime = {
      getSelectionIds: () => [1, 2],
      getSelectionBounds: () => ({ minX: 0, minY: 0, maxX: 10, maxY: 10, valid: 1 }),
      isInteractionActive: () => false,
      getSnapOverlayMeta: () => ({
        generation: 0,
        primitiveCount: 0,
        floatCount: 0,
        primitivesPtr: 0,
        dataPtr: 0,
      }),
      draft: {
        getDraftDimensions: () => null,
      },
      module: {
        HEAPU8: new Uint8Array(1),
      },
    };

    mockGetRuntime.mockResolvedValue(runtime);

    const { container } = render(<ShapeOverlay />);

    await waitFor(() => {
      const rects = container.querySelectorAll('rect.stroke-primary');
      expect(rects.length).toBe(5);
    });
  });

  it('does not render draft bbox for polyline draft', async () => {
    const runtime = {
      getSelectionIds: () => [],
      isInteractionActive: () => false,
      getSnapOverlayMeta: () => ({
        generation: 0,
        primitiveCount: 0,
        floatCount: 0,
        primitivesPtr: 0,
        dataPtr: 0,
      }),
      draft: {
        getDraftDimensions: () => ({
          minX: 0,
          minY: 0,
          maxX: 10,
          maxY: 10,
          width: 10,
          height: 10,
          centerX: 5,
          centerY: 5,
          kind: EntityKind.Polyline,
          active: true,
        }),
      },
      module: {
        HEAPU8: new Uint8Array(1),
      },
    };

    mockGetRuntime.mockResolvedValue(runtime);

    const { container } = render(<ShapeOverlay />);

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeNull();
    });
  });

  it('does not render draft bbox for line draft', async () => {
    const runtime = {
      getSelectionIds: () => [],
      isInteractionActive: () => false,
      getSnapOverlayMeta: () => ({
        generation: 0,
        primitiveCount: 0,
        floatCount: 0,
        primitivesPtr: 0,
        dataPtr: 0,
      }),
      draft: {
        getDraftDimensions: () => ({
          minX: 0,
          minY: 0,
          maxX: 10,
          maxY: 10,
          width: 10,
          height: 10,
          centerX: 5,
          centerY: 5,
          kind: EntityKind.Line,
          active: true,
        }),
      },
      module: {
        HEAPU8: new Uint8Array(1),
      },
    };

    mockGetRuntime.mockResolvedValue(runtime);

    const { container } = render(<ShapeOverlay />);

    await waitFor(() => {
      expect(container.querySelector('svg')).toBeNull();
    });
  });
});
