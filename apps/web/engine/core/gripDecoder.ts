import { GripMeta } from './protocol';

/**
 * Decoded grip information in WCS coordinates.
 */
export interface GripWCS {
  kind: 'vertex' | 'edge-midpoint';
  positionWCS: { x: number; y: number };
  index: number; // vertex or edge index
}

/**
 * Decodes grip metadata from WASM heap.
 *
 * @param heap - WASM memory (HEAPU8)
 * @param meta - Grip metadata from engine
 * @returns Array of grip positions in WCS
 */
export const decodeGripMeta = (heap: Uint8Array, meta: GripMeta): GripWCS[] => {
  if (!meta || meta.valid === 0 || meta.floatCount === 0) {
    return [];
  }

  const grips: GripWCS[] = [];

  // Decode vertex grips
  if (meta.vertexCount > 0 && meta.verticesPtr !== 0) {
    const vertices = new Float32Array(heap.buffer, meta.verticesPtr, meta.vertexCount * 2);
    for (let i = 0; i < meta.vertexCount; i++) {
      const x = vertices[i * 2] ?? 0;
      const y = vertices[i * 2 + 1] ?? 0;
      grips.push({
        kind: 'vertex',
        positionWCS: { x, y },
        index: i,
      });
    }
  }

  // Decode edge midpoint grips (Phase 2)
  if (meta.edgeCount > 0 && meta.edgeMidpointsPtr !== 0) {
    const edgeMidpoints = new Float32Array(
      heap.buffer,
      meta.edgeMidpointsPtr,
      meta.edgeCount * 2,
    );
    for (let i = 0; i < meta.edgeCount; i++) {
      const x = edgeMidpoints[i * 2] ?? 0;
      const y = edgeMidpoints[i * 2 + 1] ?? 0;
      grips.push({
        kind: 'edge-midpoint',
        positionWCS: { x, y },
        index: i,
      });
    }
  }

  return grips;
};
