import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SelectionHoverPick } from '@/features/editor/interactions/handlers/selection/SelectionHoverPick';
import { useSettingsStore } from '@/stores/useSettingsStore';

describe('SelectionHoverPick', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSettingsStore.setState({
      featureFlags: { enablePickThrottling: true },
      performance: { pickThrottleInterval: 50 },
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('throttles hover picks when enabled', () => {
    const runtime = {
      pickExSmart: vi.fn(() => ({
        id: 0,
        kind: 0,
        subTarget: 0,
        subIndex: -1,
        distance: Infinity,
      })),
    } as any;

    const hover = new SelectionHoverPick();
    const nowSpy = vi.spyOn(performance, 'now');

    nowSpy.mockReturnValue(0);
    hover.get(runtime, 1, 1, 2, 0xff);
    expect(runtime.pickExSmart).toHaveBeenCalledTimes(1);

    nowSpy.mockReturnValue(10);
    hover.get(runtime, 2, 2, 2, 0xff);
    expect(runtime.pickExSmart).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(runtime.pickExSmart).toHaveBeenCalledTimes(2);
  });
});
