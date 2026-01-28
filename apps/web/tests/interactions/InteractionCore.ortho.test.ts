import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InteractionCore } from '@/features/editor/interactions/interactionCore';
import { useSettingsStore } from '@/stores/useSettingsStore';

describe('InteractionCore ortho toggle', () => {
  beforeEach(() => {
    useSettingsStore.setState((state) => ({
      ...state,
      ortho: { ...state.ortho, persistentEnabled: false, shiftOverrideEnabled: true },
    }));
  });

  it('toggles persistent ortho with F8 and syncs runtime immediately', () => {
    const pointerRectRef = { current: { left: 0, top: 0 } };
    const viewTransform = { x: 0, y: 0, scale: 1 };
    const canvasSize = { width: 300, height: 300 };
    const toolDefaults = {
      strokeColor: '#fff',
      fillColor: '#000',
      fillEnabled: true,
      strokeEnabled: true,
      strokeWidth: 1,
      polygonSides: 3,
    };

    const core = new InteractionCore(
      pointerRectRef as any,
      viewTransform,
      canvasSize,
      toolDefaults as any,
    );

    const setOrthoOptions = vi.fn();
    core.setRuntime({ setOrthoOptions } as any);

    core.handleKeyDown({ key: 'F8', code: 'F8', preventDefault: vi.fn(), target: null } as any);
    expect(useSettingsStore.getState().ortho.persistentEnabled).toBe(true);
    expect(setOrthoOptions).toHaveBeenLastCalledWith(true, true);

    core.handleKeyDown({ key: 'F8', code: 'F8', preventDefault: vi.fn(), target: null } as any);
    expect(useSettingsStore.getState().ortho.persistentEnabled).toBe(false);
    expect(setOrthoOptions).toHaveBeenLastCalledWith(false, true);
  });
});

