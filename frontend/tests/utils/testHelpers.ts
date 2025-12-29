/**
 * Test Utilities and Mock Factories
 * 
 * Provides comprehensive mocks and utilities for testing performance components
 */

import { vi } from 'vitest';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { PickResult } from '@/types/picking';
import { PickEntityKind, PickSubTarget } from '@/types/picking';

/**
 * Creates a mock PickResult
 */
export function createMockPickResult(id: number, overrides?: Partial<PickResult>): PickResult {
  return {
    id,
    kind: PickEntityKind.Rect,
    subTarget: PickSubTarget.None,
    subIndex: -1,
    distance: 0,
    ...overrides,
  };
}

/**
 * Creates a mock EngineRuntime with configurable behavior
 */
export function createMockRuntime(options: {
  initialGeneration?: number;
  statsOverride?: Partial<ReturnType<EngineRuntime['engine']['getStats']>>;
} = {}): any {
  const { initialGeneration = 1, statsOverride = {} } = options;

  const mockEngine = {
    getStats: vi.fn(() => ({
      generation: initialGeneration,
      rectCount: 0,
      lineCount: 0,
      polylineCount: 0,
      pointCount: 0,
      textCount: 0,
      triangleVertexCount: 0,
      ...statsOverride,
    })),
    clear: vi.fn(),
    apply: vi.fn(),
    getSelectionIds: vi.fn(() => {
      const vec = {
        size: () => 0,
        get: (i: number) => 0,
        delete: () => {},
      };
      return vec;
    }),
  };

  return {
    engine: mockEngine as any,
    pickEx: vi.fn((x, y, tolerance, mask) => createMockPickResult(0)),
    pickExSmart: vi.fn((x, y, tolerance, mask) => createMockPickResult(0)),
    pickExCached: vi.fn((x, y, tolerance, mask) => createMockPickResult(0)),
    quickBoundsCheck: vi.fn(() => true),
    getSelectionIds: vi.fn(() => new Uint32Array()),
    setSelection: vi.fn(),
    clearSelection: vi.fn(),
    apply: vi.fn(),
  };
}

/**
 * Creates a sequence of mock PickResults for testing
 */
export function createPickResultSequence(count: number): PickResult[] {
  return Array.from({ length: count }, (_, i) =>
    createMockPickResult(i + 1, { distance: Math.random() * 100 })
  );
}

/**
 * Waits for a specific number of milliseconds (for async tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Waits for next event loop tick
 */
export function waitForNextTick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Runs a function and measures its execution time
 */
export async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Creates a spy on console methods
 */
export function spyOnConsole() {
  return {
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  };
}

/**
 * Restores all console spies
 */
export function restoreConsole() {
  vi.mocked(console.error).mockRestore?.();
  vi.mocked(console.warn).mockRestore?.();
  vi.mocked(console.log).mockRestore?.();
}

/**
 * Creates a mock function that tracks call order
 */
export function createCallOrderTracker() {
  const calls: string[] = [];
  
  return {
    track: (name: string) => {
      calls.push(name);
    },
    getCalls: () => [...calls],
    reset: () => {
      calls.length = 0;
    },
  };
}

/**
 * Asserts that a value is defined (TypeScript helper)
 */
export function assertDefined<T>(value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error('Value is null or undefined');
  }
}

/**
 * Creates a deferred promise for testing async behavior
 */
export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: any) => void;
  
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  
  return { promise, resolve, reject };
}
