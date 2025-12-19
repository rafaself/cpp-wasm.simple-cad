import { describe, expect, it } from 'vitest';
import { decodeNextDocumentFile, encodeNextDocumentFile, type NextDocumentPayload } from '../persistence/nextDocumentFile';

describe('nextDocumentFile (.ewnd)', () => {
  const basePayload: NextDocumentPayload = {
    worldScale: 100,
    frame: { enabled: false, widthMm: 297, heightMm: 210, marginMm: 10 },
    project: {
      layers: [],
      shapes: [],
      activeLayerId: 'desenho',
      electricalElements: [],
      connectionNodes: [],
      diagramNodes: [],
      diagramEdges: [],
    },
    history: { past: [], future: [] },
  };

  it('roundtrips v2 payload + optional engine snapshot', () => {
    const engineSnapshot = new Uint8Array([0x45, 0x57, 0x43, 0x31, 0x02, 0x00, 0x00, 0x00]);
    const bytes = encodeNextDocumentFile(basePayload, { engineSnapshot });
    const decoded = decodeNextDocumentFile(bytes);
    expect(decoded.worldScale).toBe(basePayload.worldScale);
    expect(decoded.frame).toEqual(basePayload.frame);
    expect(decoded.project).toEqual(basePayload.project);
    expect(decoded.history).toEqual(basePayload.history);
    expect(decoded.engineSnapshot).toEqual(engineSnapshot);
  });

  it('rejects tampered bytes (CRC mismatch)', () => {
    const bytes = encodeNextDocumentFile(basePayload, { engineSnapshot: new Uint8Array([1, 2, 3, 4]) });
    const tampered = new Uint8Array(bytes);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;
    expect(() => decodeNextDocumentFile(tampered)).toThrow(/checksum mismatch/i);
  });
});

