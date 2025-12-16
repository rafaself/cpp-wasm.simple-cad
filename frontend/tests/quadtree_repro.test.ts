import { describe, it, expect } from 'vitest';
import { QuadTree } from '../utils/spatial';
import { Shape, Point } from '../types';

// Mock Shape Creator
const createLine = (id: string, p1: Point, p2: Point): Shape => ({
    id,
    type: 'line',
    points: [p1, p2],
    strokeColor: '#000',
    strokeEnabled: true,
    fillEnabled: false,
    fillColor: 'transparent',
    layerId: 'layer1',
    strokeWidth: 1
});

describe('QuadTree Bug Reproduction', () => {
    it('should find a line that crosses multiple quadrants when querying a specific quadrant', () => {
        // Root bounds: -100 to 100 on both axes
        const qt = new QuadTree({ x: -100, y: -100, width: 200, height: 200 }, 1); // Capacity 1 to force subdivision

        // Create a line from -50,0 to 50,0 (Crosses West to East through center)


        // Add dummy shapes to force subdivision FIRST
        qt.insert(createLine('dummy1', { x: -90, y: -90 }, { x: -80, y: -80 })); // SW
        qt.insert(createLine('dummy2', { x: 90, y: 90 }, { x: 80, y: 80 })); // NE
        
        // Ensure root is full (capacity 1, but we added 2 distinct shapes in children? No.)
        // Root capacity 1.
        // Insert dummy1 -> Root[0] = dummy1.
        // Insert dummy2 -> Root full. Subdivide. dummy2 -> NE.
        
        // Now insert the long line
        // Root full. Checks NE. Line intersects NE.
        // NE has dummy2 (full). NE subdivides.
        // Line added to NE (because it overlaps NE).
        const line = createLine('long-line', { x: -50, y: 0 }, { x: 50, y: 0 });
        qt.insert(line);

        // Query the West side (should include the line)
        // Rect: x=-60, y=-10, w=20, h=20 (Centered at -50, 0)
        const westQuery = qt.query({ x: -60, y: -10, width: 20, height: 20 });
        const westIds = westQuery.map(s => s.id);
        
        // Query the East side (should also include the line)
        // Rect: x=40, y=-10, w=20, h=20 (Centered at 50, 0)
        const eastQuery = qt.query({ x: 40, y: -10, width: 20, height: 20 });
        const eastIds = eastQuery.map(s => s.id);

        console.log('West Found:', westIds);
        console.log('East Found:', eastIds);

        expect(westIds).toContain('long-line');
        expect(eastIds).toContain('long-line');
    });
});
