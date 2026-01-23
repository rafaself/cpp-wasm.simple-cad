import { describe, it, expect } from 'vitest';

import { ViewportSystem } from '@/engine/core/runtime/ViewportSystem';

describe('ViewportSystem', () => {
  describe('coordinate transformations', () => {
    it('converts screen to world coordinates', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 100, y: 200, scale: 2 });

      const world = viewport.screenToWorld({ x: 150, y: 250 });

      // (150 - 100) / 2 = 25, -(250 - 200) / 2 = -25
      expect(world.x).toBe(25);
      expect(world.y).toBe(-25);
    });

    it('converts world to screen coordinates', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 100, y: 200, scale: 2 });

      const screen = viewport.worldToScreen({ x: 25, y: -25 });

      // 25 * 2 + 100 = 150, -(-25) * 2 + 200 = 250
      expect(screen.x).toBe(150);
      expect(screen.y).toBe(250);
    });

    it('round-trips screen→world→screen correctly', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 100, y: 200, scale: 1.5 });

      const original = { x: 300, y: 400 };
      const world = viewport.screenToWorld(original);
      const roundTrip = viewport.worldToScreen(world);

      expect(roundTrip.x).toBeCloseTo(original.x, 10);
      expect(roundTrip.y).toBeCloseTo(original.y, 10);
    });
  });

  describe('picking tolerance at 3 distinct view scales', () => {
    it('calculates tolerance at scale 0.5 (zoomed out)', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 0.5 });

      const tolerance = viewport.getPickingTolerance(10); // 10px screen tolerance

      // 10px / 0.5 = 20 world units
      expect(tolerance).toBe(20);
    });

    it('calculates tolerance at scale 1.0 (default)', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 1.0 });

      const tolerance = viewport.getPickingTolerance(10); // 10px screen tolerance

      // 10px / 1.0 = 10 world units
      expect(tolerance).toBe(10);
    });

    it('calculates tolerance at scale 2.0 (zoomed in)', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 2.0 });

      const tolerance = viewport.getPickingTolerance(10); // 10px screen tolerance

      // 10px / 2.0 = 5 world units
      expect(tolerance).toBe(5);
    });

    it('uses default 10px screen tolerance when not specified', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 2.0 });

      const tolerance = viewport.getPickingTolerance();

      expect(tolerance).toBe(5);
    });

    it('calculates tolerance with explicit transform', () => {
      const viewport = new ViewportSystem();
      const transform = { x: 0, y: 0, scale: 1.5 };

      const tolerance = viewport.getPickingToleranceWithTransform(transform, 12);

      // 12px / 1.5 = 8 world units
      expect(tolerance).toBe(8);
    });
  });

  describe('snap tolerance', () => {
    it('calculates snap tolerance with default 8px', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 2.0 });

      const tolerance = viewport.getSnapTolerance();

      // 8px / 2.0 = 4 world units
      expect(tolerance).toBe(4);
    });

    it('calculates snap tolerance with custom screen pixels', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 1.5 });

      const tolerance = viewport.getSnapTolerance(12);

      // 12px / 1.5 = 8 world units
      expect(tolerance).toBe(8);
    });
  });

  describe('distance conversions', () => {
    it('converts screen distance to world distance', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 2.0 });

      const worldDist = viewport.screenToWorldDistance(20);

      // 20px / 2.0 = 10 world units
      expect(worldDist).toBe(10);
    });

    it('converts world distance to screen distance', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 1.5 });

      const screenDist = viewport.worldToScreenDistance(10);

      // 10 * 1.5 = 15px
      expect(screenDist).toBe(15);
    });
  });

  describe('tolerance check', () => {
    it('detects point within tolerance', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 1.0 });

      const point = { x: 5, y: 5 };
      const target = { x: 10, y: 10 };

      // Distance = sqrt((5-10)^2 + (5-10)^2) = sqrt(50) ≈ 7.07
      // Tolerance = 10px / 1.0 = 10 world units
      // 7.07 < 10, so should be within tolerance
      const isWithin = viewport.isWithinTolerance(point, target, 10);

      expect(isWithin).toBe(true);
    });

    it('detects point outside tolerance', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 1.0 });

      const point = { x: 0, y: 0 };
      const target = { x: 15, y: 15 };

      // Distance = sqrt((15-0)^2 + (15-0)^2) = sqrt(450) ≈ 21.21
      // Tolerance = 10px / 1.0 = 10 world units
      // 21.21 > 10, so should be outside tolerance
      const isWithin = viewport.isWithinTolerance(point, target, 10);

      expect(isWithin).toBe(false);
    });

    it('tolerance check is scale-aware', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 0, y: 0, scale: 2.0 });

      const point = { x: 3, y: 4 };
      const target = { x: 0, y: 0 };

      // Distance = 5 world units
      // Tolerance = 10px / 2.0 = 5 world units
      // 5 == 5, so should be within tolerance (edge case)
      const isWithin = viewport.isWithinTolerance(point, target, 10);

      expect(isWithin).toBe(true);
    });
  });

  describe('scale management', () => {
    it('gets current scale', () => {
      const viewport = new ViewportSystem();
      viewport.setViewTransform({ x: 100, y: 200, scale: 1.75 });

      expect(viewport.getScale()).toBe(1.75);
    });

    it('gets current view transform', () => {
      const viewport = new ViewportSystem();
      const transform = { x: 100, y: 200, scale: 1.5 };
      viewport.setViewTransform(transform);

      const retrieved = viewport.getViewTransform();

      expect(retrieved).toEqual(transform);
      // Ensure it's a copy, not the same reference
      expect(retrieved).not.toBe(transform);
    });
  });
});
