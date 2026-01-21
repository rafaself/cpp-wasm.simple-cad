import { describe, it, expect, vi } from 'vitest';

import {
  IntegrationRuntime,
  type AtlasIntegrationApi,
  type DomainRuntime,
} from '@/engine/core/IntegrationRuntime';

type TestAtlas = AtlasIntegrationApi & {
  setEntityGeomZ: (entityId: number, z: number) => boolean;
};

type TestDomain = DomainRuntime & {
  setSemanticHeight: (componentId: number, height: number) => void;
};

const createAtlas = (): TestAtlas => ({
  beginHistoryEntry: vi.fn(() => true),
  commitHistoryEntry: vi.fn(),
  discardHistoryEntry: vi.fn(),
  rollbackHistoryEntry: vi.fn(() => true),
  setEntityGeomZ: vi.fn(() => true),
});

const createDomain = (tx: { commit: () => void; rollback: () => void }): TestDomain => ({
  beginTransaction: vi.fn(() => tx),
  setSemanticHeight: vi.fn(),
});

describe('IntegrationRuntime', () => {
  it('commits Atlas and domain when the transaction succeeds', () => {
    const atlas = createAtlas();
    const tx = { commit: vi.fn(), rollback: vi.fn() };
    const domain = createDomain(tx);
    const runtime = new IntegrationRuntime(atlas, domain);

    const result = runtime.runTransaction('set-elevation', () => 'ok');

    expect(result).toBe('ok');
    expect(atlas.beginHistoryEntry).toHaveBeenCalledTimes(1);
    expect(domain.beginTransaction).toHaveBeenCalledWith('set-elevation');
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(atlas.commitHistoryEntry).toHaveBeenCalledTimes(1);
    expect(atlas.rollbackHistoryEntry).not.toHaveBeenCalled();
  });

  it('rolls back Atlas when domain commit fails', () => {
    const atlas = createAtlas();
    const tx = {
      commit: vi.fn(() => {
        throw new Error('domain-failed');
      }),
      rollback: vi.fn(),
    };
    const domain = createDomain(tx);
    const runtime = new IntegrationRuntime(atlas, domain);

    expect(() => runtime.runTransaction('set-elevation', () => null)).toThrow('domain-failed');
    expect(tx.commit).toHaveBeenCalledTimes(1);
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(atlas.rollbackHistoryEntry).toHaveBeenCalledTimes(1);
    expect(atlas.commitHistoryEntry).not.toHaveBeenCalled();
  });

  it('rolls back both sides when the callback throws', () => {
    const atlas = createAtlas();
    const tx = { commit: vi.fn(), rollback: vi.fn() };
    const domain = createDomain(tx);
    const runtime = new IntegrationRuntime(atlas, domain);

    expect(() => runtime.runTransaction('set-elevation', () => {
      throw new Error('boom');
    })).toThrow('boom');

    expect(tx.commit).not.toHaveBeenCalled();
    expect(tx.rollback).toHaveBeenCalledTimes(1);
    expect(atlas.rollbackHistoryEntry).toHaveBeenCalledTimes(1);
    expect(atlas.commitHistoryEntry).not.toHaveBeenCalled();
  });

  it('keeps geomZ and semantic height updates distinct', () => {
    const atlas = createAtlas();
    const tx = { commit: vi.fn(), rollback: vi.fn() };
    const domain = createDomain(tx);
    const runtime = new IntegrationRuntime(atlas, domain);

    runtime.runTransaction('set-elevation', ({ atlas: atlasApi, domain: domainApi }) => {
      atlasApi.setEntityGeomZ(42, 1.25);
      domainApi.setSemanticHeight(7, 2.5);
    });

    expect(atlas.setEntityGeomZ).toHaveBeenCalledWith(42, 1.25);
    expect(domain.setSemanticHeight).toHaveBeenCalledWith(7, 2.5);
  });
});
