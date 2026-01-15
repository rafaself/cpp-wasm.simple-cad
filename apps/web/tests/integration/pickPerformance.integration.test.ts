/**
 * Pick Performance Integration Tests
 */

import { describe, it, expect, beforeAll } from 'vitest';

import { PickEntityKind } from '@/types/picking';
import { runPickBenchmarks } from '@/utils/benchmarks/pickBenchmarks';

import { createMockRuntime } from '../utils/testHelpers';

describe('Pick Performance Integration', () => {
  let runtime: any;

  beforeAll(() => {
    runtime = createMockRuntime();
    // Simulate some implementation for pickEx
    runtime.pickEx.mockImplementation((x: number, y: number) => ({
      id: x + y, // Simple hash for testing
      kind: PickEntityKind.Rect,
      subTarget: 0,
      subIndex: -1,
      distance: 0,
    }));
  });

  it('should run picking pipeline end-to-end', () => {
    const result = runtime.pickExSmart(10, 20, 5, 0xff);
    // pickExSmart calls pickEx wrapped in profiler
    expect(result).toBeDefined();
    // If we skip bounds check in mock, logic flows to pickEx
  });

  it('should handle rapid picks without crashing', () => {
    const picks = [];
    for (let i = 0; i < 50; i++) {
      picks.push(runtime.pickExCached(i, i, 5, 0xff));
    }
    expect(picks).toHaveLength(50);
  });
});

describe('Pick Benchmarks Runner', () => {
  it('should execute comparison suite', async () => {
    const mockRt = createMockRuntime();
    // Mock performance.now to advance time for duration calc

    // We expect this to run, log to console, and return results
    const results = await runPickBenchmarks(mockRt as any);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('scenario');
    expect(results[0]).toHaveProperty('method');
    expect(results[0]).toHaveProperty('avgTime');
  });
});
