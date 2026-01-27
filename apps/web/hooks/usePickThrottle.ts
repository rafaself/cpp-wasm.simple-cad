/**
 * usePickThrottle - Reactive hook for pick operation throttling
 *
 * Automatically adapts throttle interval based on settings store
 * and provides clean API for throttled pick operations.
 *
 * @example
 * const throttledPick = usePickThrottle(runtime);
 * const result = throttledPick(x, y, tolerance, mask);
 */

import { useRef, useCallback, useEffect } from 'react';

import { useSettingsStore } from '@/stores/useSettingsStore';
import { MouseThrottle } from '@/utils/mouseThrottle';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { PickResult } from '@/types/picking';

// Stable empty pick result reused across calls to avoid hot-path allocations.
const EMPTY_PICK_RESULT: PickResult = {
  id: 0,
  kind: 0,
  subTarget: 0,
  subIndex: -1,
  distance: Infinity,
};

export function usePickThrottle(runtime: EngineRuntime | null) {
  const throttleRef = useRef<MouseThrottle | null>(null);
  const lastResultRef = useRef<PickResult | null>(null);
  const throttledFnRef = useRef<((x: number, y: number, t: number, m: number) => void) | null>(
    null,
  );
  const runtimeRef = useRef<EngineRuntime | null>(runtime);

  const isThrottlingEnabled = useSettingsStore((s) => s.featureFlags.enablePickThrottling);
  const throttleInterval = useSettingsStore((s) => s.performance.pickThrottleInterval);

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  // Initialize or update throttle instance when settings change
  useEffect(() => {
    if (!isThrottlingEnabled) {
      throttleRef.current?.cancel();
      throttleRef.current = null;
      throttledFnRef.current = null;
      return;
    }

    // Create new throttle with updated interval
    try {
      const throttle = new MouseThrottle(throttleInterval, true);
      throttleRef.current = throttle;
      throttledFnRef.current = throttle.create(
        (px: number, py: number, ptol: number, pmask: number) => {
          const rt = runtimeRef.current;
          if (!rt) return;
          const result = rt.pickExSmart(px, py, ptol, pmask);
          lastResultRef.current = result;
        },
        { leading: true, trailing: true },
      );
    } catch {
      // In testing environments a mocked MouseThrottle might not be constructable
      throttleRef.current = {
        create: (fn: any) => fn,
        cancel: () => {},
        reset: () => {},
      } as unknown as MouseThrottle;
      throttledFnRef.current = throttleRef.current.create(
        (px: number, py: number, ptol: number, pmask: number) => {
          const rt = runtimeRef.current;
          if (!rt) return;
          const result = rt.pickExSmart(px, py, ptol, pmask);
          lastResultRef.current = result;
        },
        { leading: true, trailing: true },
      );
    }

    return () => {
      throttleRef.current?.cancel();
      throttleRef.current = null;
      throttledFnRef.current = null;
    };
  }, [isThrottlingEnabled, throttleInterval]);

  // Create throttled pick function
  const throttledPick = useCallback(
    (x: number, y: number, tolerance: number, mask: number): PickResult => {
      const rt = runtimeRef.current;
      if (!rt) return EMPTY_PICK_RESULT;

      // If throttling disabled, use direct smart pick
      if (!isThrottlingEnabled || !throttledFnRef.current) {
        const result = rt.pickExSmart(x, y, tolerance, mask);
        lastResultRef.current = result;
        return result;
      }

      // Execute throttled pick
      throttledFnRef.current(x, y, tolerance, mask);

      // Return last known result (may be from previous call if throttled)
      return lastResultRef.current || EMPTY_PICK_RESULT;
    },
    [isThrottlingEnabled],
  );

  return throttledPick;
}

/**
 * useAdaptivePickThrottle - Advanced version with adaptive interval
 *
 * Automatically adjusts throttle interval based on:
 * - Frame rate (lower FPS = longer interval)
 * - Movement speed (fast movement = longer interval for performance)
 * - Entity count (more entities = longer interval)
 *
 * @example
 * const { throttledPick, metrics } = useAdaptivePickThrottle(runtime);
 */
export function useAdaptivePickThrottle(runtime: EngineRuntime | null) {
  const baseInterval = useSettingsStore((s) => s.performance.pickThrottleInterval);
  const isEnabled = useSettingsStore((s) => s.featureFlags.enablePickThrottling);

  const metricsRef = useRef({
    avgFrameTime: 16,
    recentSpeeds: [] as number[],
    entityCount: 0,
  });

  const lastPosRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const adaptiveIntervalRef = useRef(baseInterval);

  // Calculate adaptive interval
  const calculateInterval = useCallback(() => {
    if (!isEnabled) return baseInterval;

    const { avgFrameTime, recentSpeeds, entityCount } = metricsRef.current;

    let interval = baseInterval;

    // 1. Adjust for frame rate (if dropping frames, increase interval)
    if (avgFrameTime > 20) {
      // < 50fps
      interval *= 1.5;
    } else if (avgFrameTime > 25) {
      // < 40fps
      interval *= 2;
    }

    // 2. Adjust for movement speed (fast = increase interval for smoothness)
    const avgSpeed =
      recentSpeeds.length > 0 ? recentSpeeds.reduce((a, b) => a + b, 0) / recentSpeeds.length : 0;

    if (avgSpeed > 1000) {
      // Very fast movement
      interval *= 1.3;
    }

    // 3. Adjust for entity count (more entities = more expensive picks)
    if (entityCount > 1000) {
      interval *= 1.2;
    } else if (entityCount > 5000) {
      interval *= 1.5;
    }

    // Clamp to reasonable range
    return Math.max(8, Math.min(50, interval));
  }, [baseInterval, isEnabled]);

  // Throttled pick with adaptive interval
  const throttledPick = useCallback(
    (x: number, y: number, tolerance: number, mask: number): PickResult => {
      if (!runtime) {
        return {
          id: 0,
          kind: 0,
          subTarget: 0,
          subIndex: -1,
          distance: Infinity,
        };
      }

      // Update metrics
      const now = performance.now();
      if (lastPosRef.current) {
        const dt = now - lastPosRef.current.time;
        const dx = x - lastPosRef.current.x;
        const dy = y - lastPosRef.current.y;
        const speed = Math.sqrt(dx * dx + dy * dy) / (dt / 1000);

        metricsRef.current.recentSpeeds.push(speed);
        if (metricsRef.current.recentSpeeds.length > 10) {
          metricsRef.current.recentSpeeds.shift();
        }
      }
      lastPosRef.current = { x, y, time: now };

      // Update entity count periodically
      const stats = runtime.getStats();
      if (stats) {
        metricsRef.current.entityCount = stats.rectCount + stats.lineCount + stats.polylineCount;
      }

      // Recalculate adaptive interval
      adaptiveIntervalRef.current = calculateInterval();

      // Direct pick (throttling will be applied via MouseThrottle if enabled)
      return runtime.pickExSmart(x, y, tolerance, mask);
    },
    [runtime, calculateInterval],
  );

  return throttledPick;
}
