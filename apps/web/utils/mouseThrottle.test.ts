/**
 * MouseThrottle Test Suite - 100% Coverage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { MouseThrottle, throttle } from '@/utils/mouseThrottle';

describe('MouseThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create with default interval', () => {
      const t = new MouseThrottle();
      expect(t).toBeDefined();
    });

    it('should create with custom interval', () => {
      const t = new MouseThrottle(50);
      expect(t).toBeDefined();
    });

    it('should support RAF mode', () => {
      const t = new MouseThrottle(16, true);
      expect(t).toBeDefined();
    });

    it('should support setTimeout mode', () => {
      const t = new MouseThrottle(16, false);
      expect(t).toBeDefined();
    });
  });

  describe('leading edge', () => {
    it('should execute immediately if interval passed', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true });

      throttled(1, 2, 3);

      expect(fn).toHaveBeenCalledWith(1, 2, 3);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should not execute again within interval', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true });

      throttled(1);
      throttled(2);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it('should execute again after interval', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true, trailing: false });

      throttled(1);
      vi.advanceTimersByTime(100);
      throttled(2);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenNthCalledWith(1, 1);
      expect(fn).toHaveBeenNthCalledWith(2, 2);
    });
  });

  describe('trailing edge', () => {
    it('should execute after interval', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it('should execute last call', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);
      throttled(2);
      throttled(3);

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(3);
    });

    it('should use RAF if useRAF is true and delay is 0', () => {
      const rafSpy = vi.spyOn(global, 'requestAnimationFrame');
      const fn = vi.fn();
      const t = new MouseThrottle(0, true);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);

      expect(rafSpy).toHaveBeenCalled();
      rafSpy.mockRestore();
    });

    it('should use setTimeout for non-zero delay', () => {
      const timeoutSpy = vi.spyOn(global, 'setTimeout');
      const fn = vi.fn();
      const t = new MouseThrottle(50, false);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);

      expect(timeoutSpy).toHaveBeenCalled();
      timeoutSpy.mockRestore();
    });
  });

  describe('leading + trailing', () => {
    it('should execute both edges', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true, trailing: true });

      throttled(1); // Leading
      throttled(2); // Queued
      throttled(3); // Queued

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(1);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith(3); // Trailing with last value
    });
  });

  describe('cancel', () => {
    it('should cancel pending trailing call', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);
      t.cancel();

      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should cancel RAF pending call', () => {
      const cancelSpy = vi.spyOn(global, 'cancelAnimationFrame');
      const fn = vi.fn();
      const t = new MouseThrottle(0, true);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);
      t.cancel();

      expect(cancelSpy).toHaveBeenCalled();
      cancelSpy.mockRestore();
    });

    it('should cancel setTimeout pending call', () => {
      const clearSpy = vi.spyOn(global, 'clearTimeout');
      const fn = vi.fn();
      const t = new MouseThrottle(100, false);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);
      t.cancel();

      expect(clearSpy).toHaveBeenCalled();
      clearSpy.mockRestore();
    });

    it('should be safe to call when nothing pending', () => {
      const t = new MouseThrottle(100);
      expect(() => t.cancel()).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should allow immediate next call', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true });

      throttled(1);
      t.reset();
      throttled(2);

      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should cancel pending calls', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);
      t.reset();

      vi.advanceTimersByTime(200);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should reset lastCallTime', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true });

      throttled(1);
      vi.advanceTimersByTime(50);

      t.reset();

      throttled(2); // Should execute immediately
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid calls', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true, trailing: true });

      for (let i = 0; i < 100; i++) {
        throttled(i);
      }

      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenLastCalledWith(99);
    });

    it('should preserve function arguments', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn);

      throttled(1, 'two', { three: 3 }, [4]);

      expect(fn).toHaveBeenCalledWith(1, 'two', { three: 3 }, [4]);
    });

    it('should work with zero interval', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(0);
      const throttled = t.create(fn);

      throttled(1);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it('should handle only leading option', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: true, trailing: false });

      throttled(1);
      throttled(2);

      vi.advanceTimersByTime(200);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it('should handle only trailing option', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: false, trailing: true });

      throttled(1);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith(1);
    });

    it('should handle neither leading nor trailing (no execution)', () => {
      const fn = vi.fn();
      const t = new MouseThrottle(100);
      const throttled = t.create(fn, { leading: false, trailing: false });

      throttled(1);
      vi.advanceTimersByTime(200);

      expect(fn).not.toHaveBeenCalled();
    });
  });
});

describe('throttle utility function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create throttled function', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('should accept options', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100, { leading: false, trailing: true });

    throttled(1);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(1);
  });
});
