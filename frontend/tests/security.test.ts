import { describe, it, expect } from 'vitest';
import { generateId } from '../utils/uuid';
import { useDataStore } from '../stores/useDataStore';

describe('Security Utils', () => {
    it('generateId should produce a valid UUID v4 string', () => {
        const id = generateId();
        // Regex for UUID v4
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(id).toMatch(uuidRegex);
    });

    it('generateId should produce unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 1000; i++) {
            ids.add(generateId());
        }
        expect(ids.size).toBe(1000);
    });
});

describe('DataStore Security', () => {
    it('should use UUIDs for new layers', () => {
        // Initial state has 2 layers. addLayer adds one.
        useDataStore.getState().addLayer();
        const layers = useDataStore.getState().layers;
        const newLayer = layers[layers.length - 1];

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        expect(newLayer.id).toMatch(uuidRegex);
    });
});
