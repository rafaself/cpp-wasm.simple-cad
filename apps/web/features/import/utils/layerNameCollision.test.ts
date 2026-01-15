import { describe, it, expect } from 'vitest';

import { mapImportedLayerNames } from './layerNameCollision';

describe('layerNameCollision', () => {
  it('merge policy keeps original name and reports conflicts', () => {
    const { mapping, conflicts } = mapImportedLayerNames({
      importedNames: ['C1', 'C2'],
      existingNames: ['C1'],
      policy: 'merge',
    });

    expect(mapping.get('C1')).toBe('C1');
    expect(mapping.get('C2')).toBe('C2');
    expect(conflicts).toEqual(['C1']);
  });

  it('createUnique policy suffixes when name exists (case-insensitive)', () => {
    const { mapping, conflicts } = mapImportedLayerNames({
      importedNames: ['C1', 'c2'],
      existingNames: ['c1', 'C1 (1)'],
      policy: 'createUnique',
    });

    expect(mapping.get('C1')).toBe('C1 (2)');
    expect(mapping.get('c2')).toBe('c2');
    expect(conflicts).toEqual(['C1']);
  });

  it('createUnique policy increments past existing numbered names', () => {
    const { mapping } = mapImportedLayerNames({
      importedNames: ['Layer'],
      existingNames: ['Layer', 'Layer (1)', 'Layer (2)'],
      policy: 'createUnique',
    });

    expect(mapping.get('Layer')).toBe('Layer (3)');
  });
});
