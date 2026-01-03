import { beforeEach, describe, expect, it, vi } from 'vitest';

import { applyFontSizeUpdate } from './textStyleActions';
import { useUIStore } from '@/stores/useUIStore';

const spies = vi.hoisted(() => ({
  applyFontSizeSpy: vi.fn(),
  applyFontSizeToTextSpy: vi.fn(),
}));

vi.mock('@/engine/core/singleton', () => ({
  getEngineRuntime: vi.fn().mockResolvedValue({
    getAllTextMetas: () => [{ id: 1, boxMode: 0, constraintWidth: 0 }],
  }),
}));

vi.mock('./textToolController', () => ({
  ensureTextToolReady: vi.fn().mockResolvedValue({
    applyFontSize: spies.applyFontSizeSpy,
    applyFontSizeToText: spies.applyFontSizeToTextSpy,
  }),
  ensureFontFamilyLoaded: vi.fn().mockResolvedValue(undefined),
  applyTextDefaultsFromSettings: vi.fn(),
  mapFontFamilyToId: vi.fn((family?: string) => (family ? 5 : 4)),
}));

describe('textStyleActions', () => {
  beforeEach(() => {
    spies.applyFontSizeSpy.mockClear();
    spies.applyFontSizeToTextSpy.mockClear();
  });

  it('applies font size to active editing text', async () => {
    useUIStore.setState({
      engineTextEditState: {
        active: true,
        textId: 99,
        editGeneration: 0,
        caretPosition: null,
      },
    } as any);

    await applyFontSizeUpdate(18, []);

    expect(spies.applyFontSizeSpy).toHaveBeenCalledWith(18);
    expect(spies.applyFontSizeToTextSpy).not.toHaveBeenCalled();
  });

  it('applies font size to selected text entities when not editing', async () => {
    useUIStore.setState({
      engineTextEditState: {
        active: false,
        textId: null,
        editGeneration: 0,
        caretPosition: null,
      },
    } as any);

    await applyFontSizeUpdate(20, [1, 2]);

    expect(spies.applyFontSizeToTextSpy).toHaveBeenCalledTimes(1);
    expect(spies.applyFontSizeToTextSpy).toHaveBeenCalledWith(1, 20);
    expect(spies.applyFontSizeSpy).not.toHaveBeenCalled();
  });
});
