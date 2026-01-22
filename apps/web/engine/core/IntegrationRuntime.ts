export type DomainTransaction = {
  commit: () => void;
  rollback: () => void;
};

export type DomainRuntime = {
  beginTransaction: (label: string) => DomainTransaction;
};

export type AtlasIntegrationApi = {
  beginHistoryEntry: () => boolean;
  commitHistoryEntry: () => void;
  discardHistoryEntry: () => void;
  rollbackHistoryEntry: () => boolean;
};

export type IntegrationContext<
  TAtlas extends AtlasIntegrationApi,
  TDomain extends DomainRuntime,
> = {
  atlas: TAtlas;
  domain: TDomain;
};

export class IntegrationRuntime<TAtlas extends AtlasIntegrationApi, TDomain extends DomainRuntime> {
  constructor(
    private readonly atlas: TAtlas,
    private readonly domain: TDomain,
  ) {}

  public runTransaction<T>(label: string, fn: (ctx: IntegrationContext<TAtlas, TDomain>) => T): T {
    if (!this.atlas.beginHistoryEntry()) {
      throw new Error(`[IntegrationRuntime] Failed to begin Atlas history entry for ${label}.`);
    }

    let domainTx: DomainTransaction | null = null;

    try {
      domainTx = this.domain.beginTransaction(label);
      const result = fn({ atlas: this.atlas, domain: this.domain });
      domainTx.commit();
      this.atlas.commitHistoryEntry();
      return result;
    } catch (err) {
      if (domainTx) {
        try {
          domainTx.rollback();
        } catch {
          // Best-effort rollback; Atlas rollback still runs below.
        }
      }
      if (!this.atlas.rollbackHistoryEntry()) {
        this.atlas.discardHistoryEntry();
        throw new Error(`[IntegrationRuntime] Atlas rollback failed for ${label}.`);
      }
      throw err;
    }
  }
}
