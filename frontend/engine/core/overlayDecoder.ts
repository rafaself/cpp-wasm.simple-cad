import type { OverlayBufferMeta, OverlayPrimitive } from './protocol';

const PRIMITIVE_STRIDE_BYTES = 12;

export const decodeOverlayBuffer = (
  heap: Uint8Array,
  meta: OverlayBufferMeta,
): { primitives: OverlayPrimitive[]; data: Float32Array } => {
  if (!meta || meta.primitiveCount === 0 || meta.floatCount === 0) {
    return { primitives: [], data: new Float32Array() };
  }
  if (meta.primitivesPtr === 0 || meta.dataPtr === 0) {
    return { primitives: [], data: new Float32Array() };
  }

  const primitives: OverlayPrimitive[] = [];
  const primitiveBytes = meta.primitiveCount * PRIMITIVE_STRIDE_BYTES;
  const view = new DataView(heap.buffer, meta.primitivesPtr, primitiveBytes);

  for (let i = 0; i < meta.primitiveCount; i++) {
    const base = i * PRIMITIVE_STRIDE_BYTES;
    const kind = view.getUint16(base + 0, true);
    const flags = view.getUint16(base + 2, true);
    const count = view.getUint32(base + 4, true);
    const offset = view.getUint32(base + 8, true);
    primitives.push({ kind, flags, count, offset });
  }

  const data = new Float32Array(heap.buffer, meta.dataPtr, meta.floatCount);
  return { primitives, data };
};
