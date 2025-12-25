const fnv1a32 = (str: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

export type IdMaps = {
  idHashToString: Map<number, string>;
  idStringToHash: Map<string, number>;
};

export const createIdAllocator = (): {
  maps: IdMaps;
  ensureIdForString: (id: string) => number;
} => {
  const idHashToString = new Map<number, string>();
  const idStringToHash = new Map<string, number>();

  const ensureIdForString = (id: string): number => {
    const existing = idStringToHash.get(id);
    if (existing !== undefined) return existing;

    for (let attempt = 0; attempt < 1000; attempt++) {
      const candidate = attempt === 0 ? fnv1a32(id) : fnv1a32(`${id}#${attempt}`);
      const takenBy = idHashToString.get(candidate);
      if (takenBy === undefined || takenBy === id) {
        idHashToString.set(candidate, id);
        idStringToHash.set(id, candidate);
        return candidate;
      }
    }

    throw new Error(`Failed to allocate a stable engine id for "${id}".`);
  };

  return { maps: { idHashToString, idStringToHash }, ensureIdForString };
};

