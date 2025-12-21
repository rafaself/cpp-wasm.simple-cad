export type PickIdMaps = {
  toPickId: Map<string, number>;
  toShapeId: Map<number, string>;
};

export const createPickIdMaps = (shapeIds: readonly string[]): PickIdMaps => {
  const toPickId = new Map<string, number>();
  const toShapeId = new Map<number, string>();
  let nextId = 1;

  for (const id of shapeIds) {
    if (toPickId.has(id)) continue;
    const pickId = nextId++;
    toPickId.set(id, pickId);
    toShapeId.set(pickId, id);
  }

  return { toPickId, toShapeId };
};

export const encodePickId = (id: number): [number, number, number, number] => {
  const value = id >>> 0;
  const r = value & 0xff;
  const g = (value >>> 8) & 0xff;
  const b = (value >>> 16) & 0xff;
  const a = (value >>> 24) & 0xff;
  return [r / 255, g / 255, b / 255, a / 255];
};

export const decodePickId = (rgba: ArrayLike<number>): number => {
  const r = rgba[0] ?? 0;
  const g = rgba[1] ?? 0;
  const b = rgba[2] ?? 0;
  const a = rgba[3] ?? 0;
  return (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
};

export const getShapeIdFromPixel = (rgba: ArrayLike<number>, map: Map<number, string>): string | null => {
  const id = decodePickId(rgba);
  if (!id) return null;
  return map.get(id) ?? null;
};
