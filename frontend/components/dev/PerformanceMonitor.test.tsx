/**
 * PerformanceMonitor Component Test Suite - 100% Coverage
 */

import { render, screen, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { PerformanceMonitor } from '@/components/dev/PerformanceMonitor';

import { createMockRuntime } from '../../tests/utils/testHelpers';

// Mocks
vi.mock('@/utils/pickProfiler', () => ({
  getPickProfiler: () => ({
    getStats: () => ({
      callsPerSecond: 10,
      skipRate: 0.5,
      avgTime: 1.5,
      p95: 2.0,
    }),
  }),
}));

vi.mock('@/utils/pickResultCache', () => ({
  getPickCache: () => ({
    getStats: () => ({
      hitRate: 0.8,
      size: 100,
    }),
  }),
}));

describe('PerformanceMonitor', () => {
  let mockRuntime: any;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not render when disabled', () => {
    const { container } = render(<PerformanceMonitor runtime={mockRuntime} enabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should not render when runtime is null', () => {
    const { container } = render(<PerformanceMonitor runtime={null} enabled={true} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('should render title and metrics when enabled', () => {
    render(<PerformanceMonitor runtime={mockRuntime} enabled={true} />);

    expect(screen.getByText('⚡ Performance Monitor')).toBeInTheDocument();
    expect(screen.getByText('FPS:')).toBeInTheDocument();
  });

  it('should update metrics periodically', () => {
    render(<PerformanceMonitor runtime={mockRuntime} enabled={true} updateInterval={100} />);

    // Initial render
    expect(screen.getAllByText('0').length).toBeGreaterThan(0); // Initial state zeroes

    // Advance time to trigger update
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // Verify updates (values might stay same as mock is static,
    // but at least no error and re-render happens)
    expect(screen.getByText('10')).toBeInTheDocument();
  });

  it('should position correctly', () => {
    const { rerender, container } = render(
      <PerformanceMonitor runtime={mockRuntime} position="top-left" />,
    );
    // Checking styles requires computing styles or checking props passed to div
    // Testing library is semantic, checking styles is brittle but possible via inline styles
    const div = container.firstChild as HTMLElement;
    expect(div.style.top).toBe('10px');
    expect(div.style.left).toBe('10px');

    rerender(<PerformanceMonitor runtime={mockRuntime} position="bottom-right" />);
    expect(div.style.bottom).toBe('10px');
    expect(div.style.right).toBe('10px');
  });

  it('should cleanup cleanup interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = render(<PerformanceMonitor runtime={mockRuntime} />);

    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
