/**
 * Unit tests for Grip Budget System
 *
 * Tests grip budget calculation, filtering, and statistics
 * for various polygon complexities and zoom levels.
 */

import { describe, it, expect } from 'vitest';

import type { GripWCS } from '@/engine/core/gripDecoder';
import type { ViewTransform } from '@/types';
import {
  calculateGripBudget,
  applyGripBudget,
  getGripBudgetStats,
  type GripBudgetResult,
} from '../gripBudget';

/**
 * Create mock grips for testing
 */
function createMockGrips(vertexCount: number, edgeCount: number = 0): GripWCS[] {
  const grips: GripWCS[] = [];

  // Add vertex grips
  for (let i = 0; i < vertexCount; i++) {
    grips.push({
      kind: 'vertex',
      positionWCS: { x: Math.cos((i / vertexCount) * Math.PI * 2), y: Math.sin((i / vertexCount) * Math.PI * 2) },
      index: i,
    });
  }

  // Add edge grips
  for (let i = 0; i < edgeCount; i++) {
    grips.push({
      kind: 'edge-midpoint',
      positionWCS: { x: 0.5, y: 0.5 },
      index: i,
    });
  }

  return grips;
}

/**
 * Create mock view transform
 */
function createMockTransform(scale: number = 1.0): ViewTransform {
  return { x: 0, y: 0, scale };
}

describe('calculateGripBudget', () => {
  describe('Strategy: show-all', () => {
    it('shows all grips for empty grip array', () => {
      const grips: GripWCS[] = [];
      const budget = calculateGripBudget(grips, createMockTransform(), false);

      expect(budget.strategy).toBe('show-all');
      expect(budget.shouldShowVertexGrips).toBe(false);
      expect(budget.shouldShowEdgeGrips).toBe(false);
      expect(budget.reason).toBe('no-grips');
    });

    it('shows all grips for triangle (3 vertices)', () => {
      const grips = createMockGrips(3, 3);
      const budget = calculateGripBudget(grips, createMockTransform(), false);

      expect(budget.strategy).toBe('show-all');
      expect(budget.shouldShowVertexGrips).toBe(true);
      expect(budget.shouldShowEdgeGrips).toBe(true);
      expect(budget.reason).toBe('vertex-count-3');
    });

    it('shows all grips for hexagon (6 vertices)', () => {
      const grips = createMockGrips(6, 6);
      const budget = calculateGripBudget(grips, createMockTransform(), false);

      expect(budget.strategy).toBe('show-all');
      expect(budget.shouldShowVertexGrips).toBe(true);
      expect(budget.shouldShowEdgeGrips).toBe(true);
      expect(budget.reason).toBe('vertex-count-6');
    });

    it('shows all grips for 12-sided polygon (threshold)', () => {
      const grips = createMockGrips(12, 12);
      const budget = calculateGripBudget(grips, createMockTransform(), false);

      expect(budget.strategy).toBe('show-all');
      expect(budget.shouldShowVertexGrips).toBe(true);
      expect(budget.shouldShowEdgeGrips).toBe(true);
      expect(budget.reason).toBe('vertex-count-12');
    });

    it('respects forceShowAll flag', () => {
      const grips = createMockGrips(48, 48);
      const budget = calculateGripBudget(grips, createMockTransform(0.1), true);

      expect(budget.strategy).toBe('show-all');
      expect(budget.shouldShowVertexGrips).toBe(true);
      expect(budget.shouldShowEdgeGrips).toBe(true);
      expect(budget.reason).toBe('force-show-all');
    });
  });

  describe('Strategy: show-vertices-only', () => {
    it('shows only vertices for 13-sided polygon', () => {
      const grips = createMockGrips(13, 13);
      const budget = calculateGripBudget(grips, createMockTransform(), false);

      expect(budget.strategy).toBe('show-vertices-only');
      expect(budget.shouldShowVertexGrips).toBe(true);
      expect(budget.shouldShowEdgeGrips).toBe(false);
      expect(budget.reason).toBe('vertex-count-13');
    });

    it('shows only vertices for 24-sided polygon (threshold)', () => {
      const grips = createMockGrips(24, 24);
      const budget = calculateGripBudget(grips, createMockTransform(), false);

      expect(budget.strategy).toBe('show-vertices-only');
      expect(budget.shouldShowVertexGrips).toBe(true);
      expect(budget.shouldShowEdgeGrips).toBe(false);
      expect(budget.reason).toBe('vertex-count-24');
    });

    it('shows only vertices for high vertex count with sufficient zoom', () => {
      const grips = createMockGrips(48, 48);
      const budget = calculateGripBudget(grips, createMockTransform(10.0), false);

      expect(budget.strategy).toBe('show-vertices-only');
      expect(budget.shouldShowVertexGrips).toBe(true);
      expect(budget.shouldShowEdgeGrips).toBe(false);
      expect(budget.reason).toMatch(/^zoom-sufficient-/);
    });
  });

  describe('Strategy: progressive', () => {
    it('hides all grips for high vertex count at low zoom', () => {
      const grips = createMockGrips(48, 48);
      const budget = calculateGripBudget(grips, createMockTransform(0.1), false);

      expect(budget.strategy).toBe('progressive');
      expect(budget.shouldShowVertexGrips).toBe(false);
      expect(budget.shouldShowEdgeGrips).toBe(false);
      expect(budget.reason).toMatch(/^zoom-insufficient-/);
      expect(budget.visibleGripIndices).toBeDefined();
      expect(budget.visibleGripIndices?.size).toBe(0);
    });

    it('calculates correct reason with average edge length', () => {
      const grips = createMockGrips(30, 30);
      const budget = calculateGripBudget(grips, createMockTransform(0.5), false);

      expect(budget.strategy).toBe('progressive');
      expect(budget.reason).toMatch(/zoom-insufficient-\d+px/);
    });
  });

  describe('Zoom level impact', () => {
    it('changes strategy based on zoom level', () => {
      const grips = createMockGrips(30, 30);

      // Low zoom - progressive
      const budgetLow = calculateGripBudget(grips, createMockTransform(0.1), false);
      expect(budgetLow.strategy).toBe('progressive');

      // High zoom - vertices only
      const budgetHigh = calculateGripBudget(grips, createMockTransform(10.0), false);
      expect(budgetHigh.strategy).toBe('show-vertices-only');
    });
  });
});

describe('applyGripBudget', () => {
  it('returns all grips for show-all strategy', () => {
    const grips = createMockGrips(6, 6);
    const budget: GripBudgetResult = {
      strategy: 'show-all',
      shouldShowVertexGrips: true,
      shouldShowEdgeGrips: true,
      reason: 'test',
    };

    const filtered = applyGripBudget(grips, budget);
    expect(filtered).toHaveLength(12); // 6 vertex + 6 edge
  });

  it('returns only vertex grips for show-vertices-only strategy', () => {
    const grips = createMockGrips(24, 24);
    const budget: GripBudgetResult = {
      strategy: 'show-vertices-only',
      shouldShowVertexGrips: true,
      shouldShowEdgeGrips: false,
      reason: 'test',
    };

    const filtered = applyGripBudget(grips, budget);
    expect(filtered).toHaveLength(24); // Only vertices
    expect(filtered.every((g) => g.kind === 'vertex')).toBe(true);
  });

  it('returns empty array for progressive strategy with empty indices', () => {
    const grips = createMockGrips(48, 48);
    const budget: GripBudgetResult = {
      strategy: 'progressive',
      shouldShowVertexGrips: false,
      shouldShowEdgeGrips: false,
      visibleGripIndices: new Set(),
      reason: 'test',
    };

    const filtered = applyGripBudget(grips, budget);
    expect(filtered).toHaveLength(0);
  });

  it('returns grips matching visible indices for progressive strategy', () => {
    const grips = createMockGrips(10, 0);
    const budget: GripBudgetResult = {
      strategy: 'progressive',
      shouldShowVertexGrips: false,
      shouldShowEdgeGrips: false,
      visibleGripIndices: new Set([0, 1, 2]),
      reason: 'test',
    };

    const filtered = applyGripBudget(grips, budget);
    expect(filtered).toHaveLength(3);
    expect(filtered.map((g) => g.index)).toEqual([0, 1, 2]);
  });

  it('handles missing visibleGripIndices gracefully', () => {
    const grips = createMockGrips(10, 0);
    const budget: GripBudgetResult = {
      strategy: 'progressive',
      shouldShowVertexGrips: false,
      shouldShowEdgeGrips: false,
      reason: 'test',
    };

    const filtered = applyGripBudget(grips, budget);
    expect(filtered).toHaveLength(0);
  });
});

describe('getGripBudgetStats', () => {
  it('calculates correct statistics for show-all strategy', () => {
    const grips = createMockGrips(6, 6);
    const transform = createMockTransform(1.0);
    const budget = calculateGripBudget(grips, transform, false);
    const stats = getGripBudgetStats(grips, budget, transform);

    expect(stats.totalGrips).toBe(12);
    expect(stats.visibleGrips).toBe(12);
    expect(stats.hiddenGrips).toBe(0);
    expect(stats.strategy).toBe('show-all');
    expect(stats.vertexCount).toBe(6);
    expect(stats.avgScreenEdgeLength).toBeGreaterThan(0);
  });

  it('calculates correct statistics for show-vertices-only strategy', () => {
    const grips = createMockGrips(24, 24);
    const transform = createMockTransform(1.0);
    const budget = calculateGripBudget(grips, transform, false);
    const stats = getGripBudgetStats(grips, budget, transform);

    expect(stats.totalGrips).toBe(48);
    expect(stats.visibleGrips).toBe(24);
    expect(stats.hiddenGrips).toBe(24);
    expect(stats.strategy).toBe('show-vertices-only');
    expect(stats.vertexCount).toBe(24);
  });

  it('calculates correct statistics for progressive strategy', () => {
    const grips = createMockGrips(48, 48);
    const transform = createMockTransform(0.1);
    const budget = calculateGripBudget(grips, transform, false);
    const stats = getGripBudgetStats(grips, budget, transform);

    expect(stats.totalGrips).toBe(96);
    expect(stats.visibleGrips).toBe(0);
    expect(stats.hiddenGrips).toBe(96);
    expect(stats.strategy).toBe('progressive');
    expect(stats.vertexCount).toBe(48);
  });

  it('handles edge-only grips correctly', () => {
    const grips = createMockGrips(0, 10);
    const transform = createMockTransform(1.0);
    const budget = calculateGripBudget(grips, transform, false);
    const stats = getGripBudgetStats(grips, budget, transform);

    expect(stats.totalGrips).toBe(10);
    expect(stats.vertexCount).toBe(0);
  });
});

describe('Edge cases', () => {
  it('handles single vertex gracefully', () => {
    const grips = createMockGrips(1, 0);
    const budget = calculateGripBudget(grips, createMockTransform(), false);

    expect(budget.strategy).toBe('show-all');
    expect(budget.shouldShowVertexGrips).toBe(true);
  });

  it('handles two vertices (degenerate polygon)', () => {
    const grips = createMockGrips(2, 0);
    const budget = calculateGripBudget(grips, createMockTransform(), false);

    expect(budget.strategy).toBe('show-all');
  });

  it('handles extreme zoom in (scale = 100)', () => {
    const grips = createMockGrips(48, 48);
    const budget = calculateGripBudget(grips, createMockTransform(100.0), false);

    expect(budget.strategy).toBe('show-vertices-only');
    expect(budget.reason).toMatch(/zoom-sufficient/);
  });

  it('handles extreme zoom out (scale = 0.01)', () => {
    const grips = createMockGrips(12, 12);
    const budget = calculateGripBudget(grips, createMockTransform(0.01), false);

    // Even at threshold, low zoom should trigger progressive mode
    // if average edge length is below 20px
    expect(['show-all', 'progressive']).toContain(budget.strategy);
  });
});

describe('Performance characteristics', () => {
  it('handles large grip counts efficiently', () => {
    const grips = createMockGrips(100, 100);
    const start = performance.now();

    calculateGripBudget(grips, createMockTransform(), false);

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(10); // Should be < 10ms for 200 grips
  });

  it('applyGripBudget is linear time', () => {
    const grips = createMockGrips(1000, 0);
    const budget: GripBudgetResult = {
      strategy: 'show-vertices-only',
      shouldShowVertexGrips: true,
      shouldShowEdgeGrips: false,
      reason: 'test',
    };

    const start = performance.now();
    applyGripBudget(grips, budget);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5); // Should be < 5ms for 1000 grips
  });
});
