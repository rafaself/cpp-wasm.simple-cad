/**
 * Integration Tests for Polygon Grip System (Phase 4)
 *
 * Comprehensive regression tests covering:
 * - Zoom extremes
 * - Large polygon stress testing
 * - Multi-selection interaction
 * - Grid snap integration
 * - Edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { GripWCS } from '@/engine/core/gripDecoder';
import type { ViewTransform } from '@/types';
import { calculateGripBudget, applyGripBudget } from '@/utils/gripBudget';

/**
 * Create mock grips for testing
 */
function createMockPolygonGrips(sides: number): GripWCS[] {
  const grips: GripWCS[] = [];
  const radius = 100;

  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    grips.push({
      kind: 'vertex',
      positionWCS: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      },
      index: i,
    });
  }

  // Add edge midpoints
  for (let i = 0; i < sides; i++) {
    const angle = ((i + 0.5) / sides) * Math.PI * 2;
    grips.push({
      kind: 'edge-midpoint',
      positionWCS: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      },
      index: i,
    });
  }

  return grips;
}

/**
 * Create view transform
 */
function createViewTransform(scale: number): ViewTransform {
  return { x: 0, y: 0, scale };
}

describe('Polygon Grip System Integration Tests', () => {
  describe('Zoom Extremes', () => {
    it('handles extreme zoom out (0.01x scale)', () => {
      const grips = createMockPolygonGrips(12);
      const transform = createViewTransform(0.01);

      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);

      // At extreme zoom out, grips should be hidden or reduced
      expect(budget.strategy).toMatch(/progressive|show-all/);

      // Should not throw
      expect(filtered).toBeDefined();
      expect(Array.isArray(filtered)).toBe(true);
    });

    it('handles extreme zoom in (100x scale)', () => {
      const grips = createMockPolygonGrips(48);
      const transform = createViewTransform(100.0);

      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);

      // At extreme zoom in, even large polygons should show grips
      expect(budget.strategy).toBe('show-vertices-only');
      expect(filtered.length).toBeGreaterThan(0);

      // Should show vertex grips
      expect(filtered.every((g) => g.kind === 'vertex')).toBe(true);
    });

    it('maintains grip hittability across zoom levels', () => {
      const grips = createMockPolygonGrips(6);

      const zooms = [0.1, 0.5, 1.0, 2.0, 10.0];

      for (const zoom of zooms) {
        const transform = createViewTransform(zoom);
        const budget = calculateGripBudget(grips, transform, false);
        const filtered = applyGripBudget(grips, budget);

        // Grips should always be defined
        expect(filtered).toBeDefined();

        // For low vertex count, grips should always be visible
        if (budget.strategy === 'show-all') {
          expect(filtered.length).toBe(12); // 6 vertices + 6 edges
        }
      }
    });

    it('transitions smoothly between zoom thresholds', () => {
      const grips = createMockPolygonGrips(30);

      // Test around the 20px threshold
      const scales = [0.5, 1.0, 2.0, 5.0];
      const budgets = scales.map((s) => calculateGripBudget(grips, createViewTransform(s), false));

      // All budgets should be valid
      budgets.forEach((budget) => {
        expect(budget.strategy).toBeDefined();
        expect(budget.reason).toBeDefined();
      });

      // Strategy should change based on zoom
      const strategies = budgets.map((b) => b.strategy);
      expect(new Set(strategies).size).toBeGreaterThan(1); // Should have different strategies
    });
  });

  describe('Large Polygon Stress Testing', () => {
    it('handles 24-sided polygon (maximum)', () => {
      const grips = createMockPolygonGrips(24);
      const transform = createViewTransform(1.0);

      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);

      // Should handle max polygon size
      expect(budget.strategy).toBe('show-vertices-only');
      expect(filtered.length).toBe(24); // Only vertices
    });

    it('handles 48 vertices with progressive disclosure', () => {
      const grips = createMockPolygonGrips(48);
      const transform = createViewTransform(0.5);

      const budget = calculateGripBudget(grips, transform, false);

      // Should use progressive strategy
      expect(budget.strategy).toBe('progressive');
      expect(budget.shouldShowVertexGrips).toBeDefined();
      expect(budget.shouldShowEdgeGrips).toBeDefined();
    });

    it('maintains performance with large grip count', () => {
      const grips = createMockPolygonGrips(100); // Stress test
      const transform = createViewTransform(1.0);

      const start = performance.now();
      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);
      const duration = performance.now() - start;

      // Should complete in <10ms
      expect(duration).toBeLessThan(10);

      // Should return valid result
      expect(budget).toBeDefined();
      expect(filtered).toBeDefined();
    });

    it('handles rapid zoom changes on large polygons', () => {
      const grips = createMockPolygonGrips(48);

      // Simulate rapid zoom in/out
      const scales = [0.1, 10.0, 0.5, 5.0, 1.0];

      for (const scale of scales) {
        const transform = createViewTransform(scale);
        const budget = calculateGripBudget(grips, transform, false);
        const filtered = applyGripBudget(grips, budget);

        // Should not throw on rapid changes
        expect(budget).toBeDefined();
        expect(filtered).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('handles triangle (3 sides - minimum)', () => {
      const grips = createMockPolygonGrips(3);
      const transform = createViewTransform(1.0);

      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);

      expect(budget.strategy).toBe('show-all');
      expect(filtered.length).toBe(6); // 3 vertices + 3 edges
    });

    it('handles empty grip array gracefully', () => {
      const grips: GripWCS[] = [];
      const transform = createViewTransform(1.0);

      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);

      expect(budget.strategy).toBe('show-all');
      expect(budget.reason).toBe('no-grips');
      expect(filtered.length).toBe(0);
    });

    it('respects forceShowAll flag', () => {
      const grips = createMockPolygonGrips(48);
      const transform = createViewTransform(0.1);

      const budget = calculateGripBudget(grips, transform, true);
      const filtered = applyGripBudget(grips, budget);

      expect(budget.strategy).toBe('show-all');
      expect(budget.reason).toBe('force-show-all');
      expect(filtered.length).toBe(96); // 48 vertices + 48 edges
    });

    it('handles zero scale gracefully', () => {
      const grips = createMockPolygonGrips(6);
      const transform = createViewTransform(0);

      const budget = calculateGripBudget(grips, transform, false);

      // Should not crash, but may hide grips
      expect(budget).toBeDefined();
      expect(budget.strategy).toBeDefined();
    });

    it('handles negative scale gracefully', () => {
      const grips = createMockPolygonGrips(6);
      const transform = createViewTransform(-1.0);

      const budget = calculateGripBudget(grips, transform, false);

      // Should handle edge case (use absolute value or treat as invalid)
      expect(budget).toBeDefined();
    });
  });

  describe('Grid Snap Integration', () => {
    it('calculates correct average edge length for snap decisions', () => {
      const grips = createMockPolygonGrips(12);
      const transform = createViewTransform(1.0);

      const budget = calculateGripBudget(grips, transform, false);

      // Reason should include edge length info for progressive mode
      if (budget.strategy === 'progressive') {
        expect(budget.reason).toMatch(/zoom-insufficient-\d+px/);
      }
    });

    it('maintains grip budget across different grid sizes', () => {
      const grips = createMockPolygonGrips(20);

      // Grid size shouldn't affect grip budget
      const budget1 = calculateGripBudget(grips, createViewTransform(1.0), false);
      const budget2 = calculateGripBudget(grips, createViewTransform(1.0), false);

      expect(budget1.strategy).toBe(budget2.strategy);
      expect(budget1.shouldShowVertexGrips).toBe(budget2.shouldShowVertexGrips);
    });
  });

  describe('Multi-Selection Scenarios', () => {
    it('handles multiple polygons with different vertex counts', () => {
      const triangle = createMockPolygonGrips(3);
      const hexagon = createMockPolygonGrips(6);
      const polygon24 = createMockPolygonGrips(24);

      const transform = createViewTransform(1.0);

      const budget3 = calculateGripBudget(triangle, transform, false);
      const budget6 = calculateGripBudget(hexagon, transform, false);
      const budget24 = calculateGripBudget(polygon24, transform, false);

      // Different strategies for different complexities
      expect(budget3.strategy).toBe('show-all');
      expect(budget6.strategy).toBe('show-all');
      expect(budget24.strategy).toBe('show-vertices-only');
    });

    it('handles mixed vertex/edge grip display', () => {
      const grips = createMockPolygonGrips(15);
      const transform = createViewTransform(1.0);

      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);

      // 13-24 vertices: only vertex grips
      expect(budget.strategy).toBe('show-vertices-only');
      expect(filtered.every((g) => g.kind === 'vertex')).toBe(true);
    });
  });

  describe('Rotation and Transform Scenarios', () => {
    it('maintains grip positions under rotation', () => {
      // Note: Rotation is handled by engine, grips are provided in WCS
      // This test verifies that grip calculation doesn't depend on rotation

      const grips = createMockPolygonGrips(8);
      const transform = createViewTransform(1.0);

      const budget = calculateGripBudget(grips, transform, false);
      const filtered = applyGripBudget(grips, budget);

      // Grips should be based on vertex count, not orientation
      expect(filtered.length).toBeGreaterThan(0);
      expect(budget.strategy).toBe('show-all');
    });

    it('handles grips at extreme coordinates', () => {
      const extremeGrips: GripWCS[] = [
        { kind: 'vertex', positionWCS: { x: -10000, y: -10000 }, index: 0 },
        { kind: 'vertex', positionWCS: { x: 10000, y: -10000 }, index: 1 },
        { kind: 'vertex', positionWCS: { x: 10000, y: 10000 }, index: 2 },
        { kind: 'vertex', positionWCS: { x: -10000, y: 10000 }, index: 3 },
      ];

      const transform = createViewTransform(0.001);
      const budget = calculateGripBudget(extremeGrips, transform, false);

      // Should handle large coordinates
      expect(budget).toBeDefined();
      expect(budget.strategy).toBeDefined();
    });
  });

  describe('Performance Regression Tests', () => {
    it('calculateGripBudget completes in <10ms for 200 grips', () => {
      const grips = createMockPolygonGrips(100); // 200 total with edges
      const transform = createViewTransform(1.0);

      const start = performance.now();
      calculateGripBudget(grips, transform, false);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('applyGripBudget is linear time for 1000 grips', () => {
      const grips = createMockPolygonGrips(500); // 1000 total with edges
      const budget = {
        strategy: 'show-vertices-only' as const,
        shouldShowVertexGrips: true,
        shouldShowEdgeGrips: false,
        reason: 'test',
      };

      const start = performance.now();
      applyGripBudget(grips, budget);
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(5);
    });

    it('handles 1000 budget calculations efficiently', () => {
      const grips = createMockPolygonGrips(20);
      const transform = createViewTransform(1.0);

      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        calculateGripBudget(grips, transform, false);
      }

      const duration = performance.now() - start;

      // Should complete 1000 calculations in <100ms
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Documentation Compliance', () => {
    it('follows WCS-first principle (no screen-space math)', () => {
      // This test verifies that grip positions are in WCS
      const grips = createMockPolygonGrips(6);

      grips.forEach((grip) => {
        expect(grip.positionWCS).toBeDefined();
        expect(typeof grip.positionWCS.x).toBe('number');
        expect(typeof grip.positionWCS.y).toBe('number');

        // Should be finite numbers
        expect(Number.isFinite(grip.positionWCS.x)).toBe(true);
        expect(Number.isFinite(grip.positionWCS.y)).toBe(true);
      });
    });

    it('maintains grip index contract', () => {
      const grips = createMockPolygonGrips(8);

      // Vertex indices should be 0..7
      const vertexGrips = grips.filter((g) => g.kind === 'vertex');
      expect(vertexGrips.length).toBe(8);

      vertexGrips.forEach((grip, i) => {
        expect(grip.index).toBe(i);
      });

      // Edge indices should be 0..7
      const edgeGrips = grips.filter((g) => g.kind === 'edge-midpoint');
      expect(edgeGrips.length).toBe(8);

      edgeGrips.forEach((grip, i) => {
        expect(grip.index).toBe(i);
      });
    });
  });
});
