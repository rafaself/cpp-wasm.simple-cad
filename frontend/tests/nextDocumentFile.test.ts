import { describe, expect, it } from 'vitest';

import { decodeNextDocumentFile, encodeNextDocumentFile } from '@/persistence/nextDocumentFile';

describe('nextDocumentFile v3', () => {
  const payload = {
    worldScale: 100,
    frame: { enabled: false, widthMm: 297, heightMm: 210, marginMm: 10 },
  };

  it('requires ESNP snapshot on encode', () => {
    expect(() => encodeNextDocumentFile(payload, {})).toThrowError(/ESNP/);
  });

  it('roundtrips meta + snapshot', () => {
    const snapshot = new Uint8Array([1, 2, 3, 4]);
    const bytes = encodeNextDocumentFile(payload, { engineSnapshot: snapshot });
    const decoded = decodeNextDocumentFile(bytes);

    expect(decoded.worldScale).toBe(payload.worldScale);
    expect(decoded.frame).toEqual(payload.frame);
    expect(decoded.engineSnapshot).toEqual(snapshot);
    expect(decoded.project).toBeUndefined();
    expect(decoded.history).toBeUndefined();
  });
});
