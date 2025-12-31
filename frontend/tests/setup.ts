/**
 * Vitest Test Setup
 *
 * Global configuration and utilities for all tests
 */

import { cleanup } from '@testing-library/react';
import { expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.clearAllTimers();
});

// Mock performance.now() for consistent timing tests
const originalPerformanceNow = performance.now;
let mockTime = 0;

export function mockPerformanceNow(startTime = 0) {
  mockTime = startTime;
  vi.spyOn(performance, 'now').mockImplementation(() => mockTime);
}

export function advanceMockTime(ms: number) {
  mockTime += ms;
}

export function restorePerformanceNow() {
  vi.mocked(performance.now).mockRestore();
  mockTime = 0;
}

// Global test timeout for slow tests
vi.setConfig({ testTimeout: 10000 });

// Suppress console errors in tests (can be enabled per test)
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

export function suppressConsole() {
  console.error = vi.fn();
  console.warn = vi.fn();
}

export function restoreConsole() {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}

// Custom matchers
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be within range ${floor} - ${ceiling}`
          : `expected ${received} to be within range ${floor} - ${ceiling}`,
    };
  },
});

// Augment expect types
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeWithinRange(floor: number, ceiling: number): T;
  }
  interface AsymmetricMatchersContaining {
    toBeWithinRange(floor: number, ceiling: number): any;
  }
}
