import { describe, it, expect } from 'vitest';
import { convertDxfToShapes } from './dxfToShapes';
import { DxfData } from './types';

describe('DXF Space Filtering (Model/Paper)', () => {

    // Create mock entities
    const modelSpaceLine = {
        type: 'LINE',
        layer: '0',
        vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
        // inPaperSpace missing or false
    };

    const paperSpaceLine = {
        type: 'LINE',
        layer: '0',
        vertices: [{ x: 100, y: 100 }, { x: 110, y: 100 }],
        inPaperSpace: true
    };

    const data: DxfData = {
        entities: [modelSpaceLine, paperSpaceLine]
    };

    const optionsBase = {
        floorId: 'f1',
        defaultLayerId: 'def'
    };

    it('should import only Model Space entities by default', () => {
        const result = convertDxfToShapes(data, { ...optionsBase });
        expect(result.shapes).toHaveLength(1);
        // Normalized coordinate check:
        // Model Space Line (0,0)->(10,0).
        // Since it's the only one, minX=0, minY=0.
        // P1: 0,0. P2: 1000, 0 (Scale 100).
        expect(result.shapes[0].points?.[0]).toEqual({ x: 0, y: 0 });
    });

    it('should import both when includePaperSpace is true', () => {
        const result = convertDxfToShapes(data, { ...optionsBase, includePaperSpace: true });
        expect(result.shapes).toHaveLength(2);
    });

    it('should calculate extents based only on imported entities', () => {
        // Model Space: (0,0) to (10,0) -> Bounds x: [0, 10]
        // Paper Space: (100,100) to (110,100) -> Bounds x: [100, 110]

        // If filtering works, origin/width/height should reflect Model Space only.
        const result = convertDxfToShapes(data, { ...optionsBase });

        // With only Model Space:
        // Width: 10 * 100 = 1000.
        // Height: 0 (Line).
        // Origin: (0,0) scaled.
        expect(result.width).toBe(1000);

        // If Paper Space was included (incorrectly), extents would be huge
        // MinX: 0. MaxX: 110. Width: 110. (Scaled: 11000)
    });

    it('should correctly calculate extents when including Paper Space', () => {
        const result = convertDxfToShapes(data, { ...optionsBase, includePaperSpace: true });

        // MinX: 0. MaxX: 110. Width: 110.
        // Scaled by 100 -> 11000.
        // Tolerance for float math?
        expect(result.width).toBe(11000);
    });

    it('should handle file with ONLY Paper Space entities when default', () => {
        // If file has only paper space and we filter them out, result should be empty
        const paperOnlyData: DxfData = {
            entities: [paperSpaceLine]
        };
        const result = convertDxfToShapes(paperOnlyData, { ...optionsBase });
        expect(result.shapes).toHaveLength(0);
        expect(result.width).toBe(0);
    });

});
