import { beforeEach, describe, expect, it } from 'vitest';
import { useDataStore, __resetDataStoreForTests } from '../stores/useDataStore';
import { migrateVectorSidecar } from '../utils/vectorSidecar';
import type { VectorSidecarV1 } from '../types';

const sampleSidecar: VectorSidecarV1 = {
  version: 1,
  document: {
    version: 1,
    paths: [
      {
        id: 'path-1',
        segments: [
          { kind: 'move', to: { x: 0, y: 0 } },
          { kind: 'line', to: { x: 10, y: 0 } },
          { kind: 'line', to: { x: 10, y: 10 } },
          { kind: 'close' },
        ],
        closed: true,
      },
    ],
    draws: [
      {
        id: 'draw-1',
        pathId: 'path-1',
        style: { fill: { color: '#000000' }, fillRule: 'nonzero' },
        clipStack: [],
      },
    ],
  },
  bindings: {
    'shape-1': { drawIds: ['draw-1'] },
  },
};

beforeEach(() => {
  __resetDataStoreForTests();
});

describe('vector sidecar migration', () => {
  it('returns null for missing or unknown versions', () => {
    expect(migrateVectorSidecar(undefined)).toBeNull();
    expect(migrateVectorSidecar(null)).toBeNull();
    expect(migrateVectorSidecar({ version: 2 })).toBeNull();
  });

  it('passes through v1 sidecars', () => {
    const migrated = migrateVectorSidecar(sampleSidecar);
    expect(migrated).toEqual(sampleSidecar);
  });
});

describe('vector sidecar serialization', () => {
  it('serializes sidecar when present', () => {
    const store = useDataStore.getState();
    store.setVectorSidecar(sampleSidecar);
    const project = store.serializeProject();
    expect(project.vectorSidecar).toEqual(sampleSidecar);
  });

  it('loads sidecar via migration', () => {
    const store = useDataStore.getState();
    const baseProject = store.serializeProject();

    store.setVectorSidecar(null);
    store.loadSerializedProject({
      project: { ...baseProject, vectorSidecar: sampleSidecar },
      worldScale: store.worldScale,
      frame: store.frame,
    });

    expect(useDataStore.getState().vectorSidecar).toEqual(sampleSidecar);
  });
});
