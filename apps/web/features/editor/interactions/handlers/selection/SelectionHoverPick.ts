import { useSettingsStore } from '@/stores/useSettingsStore';
import { MouseThrottle } from '@/utils/mouseThrottle';

import { EMPTY_PICK_RESULT } from './selectionConstants';

import type { PickResult } from '@/types/picking';
import type { EngineRuntime } from '../../types';

export class SelectionHoverPick {
  private hoverPickThrottle: MouseThrottle | null = null;
  private hoverPickInterval = -1;
  private hoverPickResult: PickResult = EMPTY_PICK_RESULT;
  private hoverPickFn: ((x: number, y: number, tolerance: number, mask: number) => void) | null =
    null;
  private runtime: EngineRuntime | null = null;

  private ensureHoverPickThrottle(): void {
    const settings = useSettingsStore.getState();
    const enabled = settings.featureFlags.enablePickThrottling;
    const interval = settings.performance.pickThrottleInterval;
    if (!enabled) {
      this.hoverPickThrottle = null;
      this.hoverPickFn = null;
      this.hoverPickInterval = -1;
      return;
    }
    if (this.hoverPickThrottle && this.hoverPickInterval === interval && this.hoverPickFn) return;
    this.hoverPickThrottle = new MouseThrottle(interval, true);
    this.hoverPickInterval = interval;
    this.hoverPickFn = this.hoverPickThrottle.create(
      (x: number, y: number, tolerance: number, mask: number) => {
        if (!this.runtime) return;
        this.hoverPickResult = this.runtime.pickExSmart(x, y, tolerance, mask);
      },
      { leading: true, trailing: true },
    );
  }

  get(runtime: EngineRuntime, x: number, y: number, tolerance: number, mask: number): PickResult {
    const settings = useSettingsStore.getState();
    if (!settings.featureFlags.enablePickThrottling) {
      return runtime.pickExSmart(x, y, tolerance, mask);
    }
    this.runtime = runtime;
    this.ensureHoverPickThrottle();
    if (!this.hoverPickFn) return this.hoverPickResult;
    this.hoverPickFn(x, y, tolerance, mask);
    return this.hoverPickResult;
  }
}
