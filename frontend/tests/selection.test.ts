import { describe, it, expect } from 'vitest';
import { isShapeInSelection } from '../utils/geometry';
import { Shape, Rect } from '../types/index';

describe('Selection Logic', () => {
    it('selects a line that passes exactly through the corner of the selection rect (Crossing)', () => {
        const line: Shape = {
            id: 'line1',
            type: 'line',
            layerId: '0',
            strokeColor: '#000',
            fillColor: '#fff',
            points: [{ x: -5, y: -5 }, { x: 15, y: 15 }]
        };

        const selectionRect: Rect = {
            x: 0,
            y: 0,
            width: 10,
            height: 10
        };

        // CROSSING mode should select if it touches/intersects
        const result = isShapeInSelection(line, selectionRect, 'CROSSING');
        expect(result).toBe(true);
    });
});
