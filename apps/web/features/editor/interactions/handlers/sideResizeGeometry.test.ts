import { describe, it, expect } from 'vitest';

import { calculateSideResize, localToWorldShift, SideResizeInput } from './sideResizeGeometry';

describe('sideResizeGeometry', () => {
  describe('calculateSideResize', () => {
    const minSize = 1.0;

    describe('Asymmetric Resize (Normal Mode)', () => {
      it('should extend East handle correctly (Positive Side)', () => {
        // Anchor at -50, Drag starts at 50
        // Drag +10 -> 60
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: 10,
          isSymmetric: false,
          isPositiveSide: true,
          minSize,
        };
        const result = calculateSideResize(input);

        expect(result.newDimension).toBe(110);
        expect(result.scale).toBe(1); // Normal orientation
        expect(result.centerShift).toBe(5); // Shifted right by 5 (10/2)
      });

      it('should shrink East handle correctly', () => {
        // Anchor at -50, Drag starts at 50
        // Drag -10 -> 40
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: -10,
          isSymmetric: false,
          isPositiveSide: true,
          minSize,
        };
        const result = calculateSideResize(input);

        expect(result.newDimension).toBe(90);
        expect(result.scale).toBe(1);
        expect(result.centerShift).toBe(-5);
      });

      it('should extend West handle correctly (Negative Side)', () => {
        // Anchor at 50, Drag starts at -50
        // Drag -10 -> -60 (Moving left is negative delta)
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: -10, // Move left
          isSymmetric: false,
          isPositiveSide: false, // West
          minSize,
        };
        const result = calculateSideResize(input);

        expect(result.newDimension).toBe(110);
        expect(result.scale).toBe(1); // Normal orientation (Left < Right)
        expect(result.centerShift).toBe(-5); // Center moves left
      });

      it('should shrink West handle correctly', () => {
        // Anchor at 50, Drag starts at -50
        // Drag +10 -> -40 (Moving right)
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: 10,
          isSymmetric: false,
          isPositiveSide: false, // West
          minSize,
        };
        const result = calculateSideResize(input);

        expect(result.newDimension).toBe(90);
        expect(result.scale).toBe(1);
        expect(result.centerShift).toBe(5);
      });
    });

    describe('Asymmetric Resize (Flip)', () => {
      it('should flip when East handle crosses West edge', () => {
        // Anchor at -50. Drag starts at 50.
        // Drag -110 -> -60. (Crossed anchor)
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: -110,
          isSymmetric: false,
          isPositiveSide: true, // East
          minSize,
        };
        const result = calculateSideResize(input);

        // Anchor -50. Drag -60.
        // Min -60, Max -50. Size 10.
        expect(result.newDimension).toBe(10);
        expect(result.scale).toBe(-1); // Flipped
        expect(result.centerShift).toBe(-55); // New center at -55
      });

      it('should flip when West handle crosses East edge', () => {
        // Anchor at 50. Drag starts at -50.
        // Drag +110 -> 60. (Crossed anchor)
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: 110,
          isSymmetric: false,
          isPositiveSide: false, // West
          minSize,
        };
        const result = calculateSideResize(input);

        // Anchor 50. Drag 60.
        // Min 50, Max 60. Size 10.
        expect(result.newDimension).toBe(10);
        expect(result.scale).toBe(-1); // Flipped
        expect(result.centerShift).toBe(55); // New center at 55
      });
    });

    describe('Symmetric Resize (Alt Key)', () => {
      it('should resize symmetrically', () => {
        // Center stays 0. Both sides move.
        // Drag E (+10) -> 60.
        // Size should be 120.
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: 10,
          isSymmetric: true,
          isPositiveSide: true,
          minSize,
        };
        const result = calculateSideResize(input);

        expect(result.newDimension).toBe(120);
        expect(result.scale).toBe(1);
        expect(result.centerShift).toBe(0);
      });

      it('should handle symmetric resize crossing center (Flip)', () => {
        // Drag E (-60) -> -10.
        // Drag point is -10.
        // Size = 2 * |-10| = 20.
        // Scale: Drag is negative, so -1.
        const input: SideResizeInput = {
          startDimension: 100,
          localDelta: -60,
          isSymmetric: true,
          isPositiveSide: true,
          minSize,
        };
        const result = calculateSideResize(input);

        expect(result.newDimension).toBe(20);
        expect(result.scale).toBe(-1);
        expect(result.centerShift).toBe(0);
      });
    });
  });

  describe('localToWorldShift', () => {
    it('should rotate vector correctly (0 deg)', () => {
      const shift = { x: 10, y: 0 };
      const res = localToWorldShift(shift, 0);
      expect(res.x).toBeCloseTo(10);
      expect(res.y).toBeCloseTo(0);
    });

    it('should rotate vector correctly (90 deg)', () => {
      const shift = { x: 10, y: 0 };
      const res = localToWorldShift(shift, Math.PI / 2);
      expect(res.x).toBeCloseTo(0);
      expect(res.y).toBeCloseTo(10);
    });
  });
});
