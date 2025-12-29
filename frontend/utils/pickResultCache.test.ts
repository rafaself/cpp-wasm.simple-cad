/**
 * PickResultCache Test Suite - 100% Coverage
 * 
 * Comprehensive tests for LRU cache with spatial hashing
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PickResultCache, resetPickCache } from '@/utils/pickResultCache';
import { createMockRuntime, createMockPickResult, wait } from '../tests/utils/testHelpers';
import type { EngineRuntime } from '@/engine/core/EngineRuntime';

describe('PickResultCache', () => {
  let cache: PickResultCache;
  let mockRuntime: any;

  beforeEach(() => {
    mockRuntime = createMockRuntime({ initialGeneration: 1 });
    cache = new PickResultCache(mockRuntime, {
      maxSize: 3,
      ttlMs: 100,
      gridSize: 10,
    });
  });

  afterEach(() => {
    cache.destroy();
    resetPickCache();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create cache with default config', () => {
      const defaultCache = new PickResultCache(mockRuntime);
      expect(defaultCache).toBeDefined();
      expect(defaultCache.getStats().maxSize).toBe(100);
      defaultCache.destroy();
    });

    it('should create cache with custom config', () => {
      expect(cache.getStats().maxSize).toBe(3);
    });

    it('should throw if runtime is null', () => {
      expect(() => new PickResultCache(null as any)).toThrow();
    });

    it('should validate config values', () => {
      const invalidCache = new PickResultCache(mockRuntime, {
        maxSize: -1,
        ttlMs: -50,
        gridSize: -10,
      });
      
      const stats = invalidCache.getStats();
      expect(stats.maxSize).toBeGreaterThan(0);
      invalidCache.destroy();
    });

    it('should setup invalidation interval', () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      const testCache = new PickResultCache(mockRuntime);
      
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 100);
      
      testCache.destroy();
      setIntervalSpy.mockRestore();
    });
  });

  describe('get/set operations', () => {
    it('should return null for cache miss', () => {
      const result = cache.get(0, 0, 10, 0xFF);
      expect(result).toBeNull();
    });

    it('should return cached result on hit', () => {
      const pickResult = createMockPickResult(123);
      cache.set(0, 0, 10, 0xFF, pickResult);
      
      const cached = cache.get(0, 0, 10, 0xFF);
      expect(cached).toEqual(pickResult);
    });

    it('should not cache empty results (id === 0)', () => {
      const emptyResult = createMockPickResult(0);
      cache.set(0, 0, 10, 0xFF, emptyResult);
      
      expect(cache.get(0, 0, 10, 0xFF)).toBeNull();
      expect(cache.getStats().size).toBe(0);
    });

    it('should cache results with different IDs', () => {
      const r1 = createMockPickResult(1);
      const r2 = createMockPickResult(2);
      
      cache.set(0, 0, 10, 0xFF, r1);
      cache.set(10, 10, 10, 0xFF, r2);
      
      expect(cache.get(0, 0, 10, 0xFF)).toEqual(r1);
      expect(cache.get(10, 10, 10, 0xFF)).toEqual(r2);
    });

    it('should update existing entry', () => {
      const r1 = createMockPickResult(100);
      const r2 = createMockPickResult(200);
      
      cache.set(5, 5, 10, 0xFF, r1);
      cache.set(5, 5, 10, 0xFF, r2);
      
      expect(cache.get(5, 5, 10, 0xFF)).toEqual(r2);
      expect(cache.getStats().size).toBe(1);
    });

    it('should handle invalid coordinates gracefully', () => {
      const result = cache.get(NaN, 0, 10, 0xFF);
      expect(result).toBeNull();
      
      const result2 = cache.get(0, Infinity, 10, 0xFF);
      expect(result2).toBeNull();
    });

    it('should handle invalid tolerance gracefully', () => {
      const result = cache.get(0, 0, -10, 0xFF);
      expect(result).toBeNull();
      
      const result2 = cache.get(0, 0, NaN, 0xFF);
      expect(result2).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should expire entries after TTL', async () => {
      const result = createMockPickResult(456);
      cache.set(0, 0, 10, 0xFF, result);
      
      expect(cache.get(0, 0, 10, 0xFF)).toEqual(result);
      
      vi.advanceTimersByTime(150); // Beyond TTL
      
      expect(cache.get(0, 0, 10, 0xFF)).toBeNull();
    });

    it('should not expire before TTL', () => {
      const result = createMockPickResult(789);
      cache.set(0, 0, 10, 0xFF, result);
      
      vi.advanceTimersByTime(50); // Within TTL
      
      expect(cache.get(0, 0, 10, 0xFF)).toEqual(result);
    });

    it('should delete expired entry on access', () => {
      const result = createMockPickResult(111);
      cache.set(0, 0, 10, 0xFF, result);
      
      expect(cache.getStats().size).toBe(1);
      
      vi.advanceTimersByTime(150);
      cache.get(0, 0, 10, 0xFF);
      
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest when at capacity', () => {
      const r1 = createMockPickResult(1);
      const r2 = createMockPickResult(2);
      const r3 = createMockPickResult(3);
      const r4 = createMockPickResult(4);
      
      cache.set(0, 0, 10, 0xFF, r1);
      cache.set(10, 10, 10, 0xFF, r2);
      cache.set(20, 20, 10, 0xFF, r3);
      
      expect(cache.getStats().size).toBe(3);
      
      // Should evict r1 (oldest)
      cache.set(30, 30, 10, 0xFF, r4);
      
      expect(cache.getStats().size).toBe(3);
      expect(cache.get(0, 0, 10, 0xFF)).toBeNull(); // Evicted
      expect(cache.get(10, 10, 10, 0xFF)).toEqual(r2);
      expect(cache.get(20, 20, 10, 0xFF)).toEqual(r3);
      expect(cache.get(30, 30, 10, 0xFF)).toEqual(r4);
    });

    it('should evict correctly with mixed timestamps', () => {
      vi.useFakeTimers();
      
      const r1 = createMockPickResult(10);
      cache.set(0, 0, 10, 0xFF, r1);
      
      vi.advanceTimersByTime(10);
      const r2 = createMockPickResult(20);
      cache.set(10, 10, 10, 0xFF, r2);
      
      vi.advanceTimersByTime(10);
      const r3 = createMockPickResult(30);
      cache.set(20, 20, 10, 0xFF, r3);
      
      vi.advanceTimersByTime(10);
      const r4 = createMockPickResult(40);
      cache.set(30, 30, 10, 0xFF, r4);
      
      // r1 should be evicted (oldest timestamp)
      expect(cache.get(0, 0, 10, 0xFF)).toBeNull();
    });
  });

  describe('spatial hashing', () => {
    it('should use grid cells for spatial grouping', () => {
      const result = createMockPickResult(100);
      
      // Pos (5,5) and (7,7) are in same grid cell [0,1)
      cache.set(5, 5, 10, 0xFF, result);
      
      // Should hit cache for nearby position in same cell
      const cached = cache.get(7, 7, 10, 0xFF);
      expect(cached).toEqual(result);
    });

    it('should miss for different grid cells', () => {
      const result = createMockPickResult(200);
      
      // Grid cell [0,1)
      cache.set(5, 5, 10, 0xFF, result);
      
      // Grid cell [1,2) - different
      expect(cache.get(15, 15, 10, 0xFF)).toBeNull();
    });

    it('should handle negative coordinates', () => {
      const result = createMockPickResult(300);
      
      cache.set(-5, -5, 10, 0xFF, result);
      
      // Same grid cell
      expect(cache.get(-3, -3, 10, 0xFF)).toEqual(result);
      
      // Different grid cell
      expect(cache.get(5, 5, 10, 0xFF)).toBeNull();
    });

    it('should respect tolerance in key generation', () => {
      const result = createMockPickResult(400);
      
      cache.set(0, 0, 10.0, 0xFF, result);
      
      // Same tolerance (rounded)
      expect(cache.get(0, 0, 10.04, 0xFF)).toEqual(result);
      
      // Different tolerance
      expect(cache.get(0, 0, 20.0, 0xFF)).toBeNull();
    });

    it('should respect mask in key generation', () => {
      const result = createMockPickResult(500);
      
      cache.set(0, 0, 10, 0xFF, result);
      
      // Different mask
      expect(cache.get(0, 0, 10, 0xAA)).toBeNull();
    });
  });

  describe('getOrCompute', () => {
    it('should return cached value if exists', () => {
      const result = createMockPickResult(123);
      const compute = vi.fn(() => createMockPickResult(999));
      
      cache.set(0, 0, 10, 0xFF, result);
      
      const returned = cache.getOrCompute(0, 0, 10, 0xFF, compute);
      
      expect(returned).toEqual(result);
      expect(compute).not.toHaveBeenCalled();
    });

    it('should compute and cache if miss', () => {
      const computed = createMockPickResult(456);
      const compute = vi.fn(() => computed);
      
      const returned = cache.getOrCompute(0, 0, 10, 0xFF, compute);
      
      expect(returned).toEqual(computed);
      expect(compute).toHaveBeenCalledTimes(1);
      expect(cache.get(0, 0, 10, 0xFF)).toEqual(computed);
    });

    it('should not cache if computed result is empty', () => {
      const emptyResult = createMockPickResult(0);
      const compute = vi.fn(() => emptyResult);
      
      cache.getOrCompute(0, 0, 10, 0xFF, compute);
      
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      cache.set(0, 0, 10, 0xFF, createMockPickResult(1));
      cache.set(10, 10, 10, 0xFF, createMockPickResult(2));
      
      expect(cache.getStats().size).toBe(2);
      
      cache.clear();
      
      expect(cache.getStats().size).toBe(0);
    });

    it('should allow new entries after clear', () => {
      cache.set(0, 0, 10, 0xFF, createMockPickResult(1));
      cache.clear();
      
      const newResult = createMockPickResult(2);
      cache.set(5, 5, 10, 0xFF, newResult);
      
      expect(cache.get(5, 5, 10, 0xFF)).toEqual(newResult);
    });
  });

  describe('destroy', () => {
    it('should clear interval on destroy', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      
      cache.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('should clear cache on destroy', () => {
      cache.set(0, 0, 10, 0xFF, createMockPickResult(100));
      
      cache.destroy();
      
      expect(cache.getStats().size).toBe(0);
    });

    it('should be idempotent', () => {
      cache.destroy();
      
      expect(() => cache.destroy()).not.toThrow();
    });

    it('should set intervalId to null', () => {
      cache.destroy();
      
      // Accessing private property for validation
      expect((cache as any).intervalId).toBeNull();
    });
  });

  describe('document invalidation', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should clear cache when generation changes', () => {
      const result = createMockPickResult(300);
      cache.set(0, 0, 10, 0xFF, result);
      
      expect(cache.get(0, 0, 10, 0xFF)).toEqual(result);
      
      // Change document generation
      mockRuntime.engine.getStats.mockReturnValue({
        generation: 10,
        rectCount: 5,
        lineCount: 0,
        polylineCount: 0,
        pointCount: 0,
        textCount: 0,
        triangleVertexCount: 0,
      });
      
      // Trigger invalidation check
      vi.advanceTimersByTime(150);
      
      expect(cache.get(0, 0, 10, 0xFF)).toBeNull();
    });

    it('should not clear if generation unchanged', () => {
      const result = createMockPickResult(400);
      cache.set(0, 0, 10, 0xFF, result);
      
      vi.advanceTimersByTime(150);
      
      expect(cache.get(0, 0, 10, 0xFF)).toEqual(result);
    });

    it('should handle missing stats gracefully', () => {
      mockRuntime.engine.getStats.mockReturnValue(null as any);
      
      expect(() => {
        vi.advanceTimersByTime(150);
      }).not.toThrow();
    });
  });

  describe('getStats', () => {
    it('should return correct size', () => {
      cache.set(0, 0, 10, 0xFF, createMockPickResult(1));
      cache.set(10, 10, 10, 0xFF, createMockPickResult(2));
      
      expect(cache.getStats().size).toBe(2);
    });

    it('should return maxSize', () => {
      expect(cache.getStats().maxSize).toBe(3);
    });

    it('should calculate hit rate correctly', () => {
      const result = createMockPickResult(500);
      cache.set(0, 0, 10, 0xFF, result);
      
      // 2 hits
      cache.get(0, 0, 10, 0xFF);
      cache.get(0, 0, 10, 0xFF);
      
      // 1 miss
      cache.get(100, 100, 10, 0xFF);
      
      const stats = cache.getStats();
      // Hit rate = 2 hits / (2 hits + 1 set + 1 miss attempt)
      // But hits are counted after first set, so: 2 / (1 initial + 2 hits) = 0.666...
      expect(stats.hitRate).toBeCloseTo(0.67, 1);
    });

    it('should calculate hit rate as 0 for empty cache', () => {
      expect(cache.getStats().hitRate).toBe(0);
    });

    it('should track average age', () => {
      vi.useFakeTimers();
      
      cache.set(0, 0, 10, 0xFF, createMockPickResult(1));
      
      vi.advanceTimersByTime(50);
      
      const stats = cache.getStats();
      expect(stats.avgAge).toBeGreaterThanOrEqual(50);
    });
  });

  describe('edge cases', () => {
    it('should handle very large coordinates', () => {
      const result = createMockPickResult(999);
      cache.set(1000000, 1000000, 10, 0xFF, result);
      
      expect(cache.get(1000000, 1000000, 10, 0xFF)).toEqual(result);
    });

    it('should handle zero coordinates', () => {
      const result = createMockPickResult(111);
      cache.set(0, 0, 10, 0xFF, result);
      
      expect(cache.get(0, 0, 10, 0xFF)).toEqual(result);
    });

    it('should handle very small tolerance', () => {
      const result = createMockPickResult(222);
      cache.set(0, 0, 0.001, 0xFF, result);
      
      expect(cache.get(0, 0, 0.001, 0xFF)).toEqual(result);
    });

    it('should handle rapid set operations', () => {
      for (let i = 0; i < 100; i++) {
        cache.set(i, i, 10, 0xFF, createMockPickResult(i));
      }
      
      // Should maintain maxSize
      expect(cache.getStats().size).toBe(3);
    });

    it('should handle mixed get/set operations', () => {
      cache.set(0, 0, 10, 0xFF, createMockPickResult(1));
      cache.get(0, 0, 10, 0xFF);
      cache.set(10, 10, 10, 0xFF, createMockPickResult(2));
      cache.get(10, 10, 10, 0xFF);
      cache.get(0, 0, 10, 0xFF);
      
      expect(cache.getStats().size).toBe(2);
    });
  });
});

describe('resetPickCache', () => {
  it('should reset global cache', () => {
    resetPickCache();
    
    // Should not throw
    expect(() => resetPickCache()).not.toThrow();
  });
});
