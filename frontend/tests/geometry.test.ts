import { describe, it, expect } from 'vitest';
import { getShapeBounds } from '../utils/geometry';
import { Shape } from '../types/index';

describe('geometry utils', () => {
    it('getShapeBounds correctly calculates bounds for an arc including curvature', () => {
        const arcShape: Shape = {
            id: 'test-arc',
            layerId: 'layer-1',
            type: 'arc',
            points: [{x: 0, y: 0}, {x: 10, y: 0}],
            radius: 5,
            strokeColor: 'black',
            fillColor: 'none'
        };

        const bounds = getShapeBounds(arcShape);

        expect(bounds).not.toBeNull();
        if (bounds) {
            // A semi-circle from (0,0) to (10,0) with radius 5.
            // Width should be 10.
            expect(bounds.width).toBeCloseTo(10, 1);

            // Height should be 5.
            // Current bug: returns 0.
            expect(bounds.height).toBeCloseTo(5, 1);
        }
    });
});
