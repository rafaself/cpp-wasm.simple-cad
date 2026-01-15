import type { EngineEvent } from './protocol';

export const ENGINE_EVENT_STRIDE_BYTES = 20;

export const decodeEngineEvents = (
  heapU8: Uint8Array,
  ptr: number,
  count: number,
): EngineEvent[] => {
  if (count === 0) return [];
  const view = new DataView(heapU8.buffer, ptr, count * ENGINE_EVENT_STRIDE_BYTES);
  const events: EngineEvent[] = [];
  for (let i = 0; i < count; i++) {
    const offset = i * ENGINE_EVENT_STRIDE_BYTES;
    events.push({
      type: view.getUint16(offset, true),
      flags: view.getUint16(offset + 2, true),
      a: view.getUint32(offset + 4, true),
      b: view.getUint32(offset + 8, true),
      c: view.getUint32(offset + 12, true),
      d: view.getUint32(offset + 16, true),
    });
  }
  return events;
};
