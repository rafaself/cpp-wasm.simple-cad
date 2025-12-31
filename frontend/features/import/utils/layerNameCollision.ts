export type LayerNameConflictPolicy = 'merge' | 'createUnique';

const normalize = (name: string): string => name.trim().toLowerCase();

export const buildUniqueLayerName = (baseName: string, usedNamesLower: Set<string>): string => {
  const trimmed = baseName.trim();
  const baseKey = normalize(trimmed);
  if (!usedNamesLower.has(baseKey)) {
    usedNamesLower.add(baseKey);
    return trimmed;
  }

  for (let n = 1; n < 10000; n += 1) {
    const candidate = `${trimmed} (${n})`;
    const key = normalize(candidate);
    if (!usedNamesLower.has(key)) {
      usedNamesLower.add(key);
      return candidate;
    }
  }

  // Extremely unlikely, keep function total.
  const fallback = `${trimmed} (${Date.now().toString(16)})`;
  usedNamesLower.add(normalize(fallback));
  return fallback;
};

export const mapImportedLayerNames = (params: {
  importedNames: readonly string[];
  existingNames: readonly string[];
  policy: LayerNameConflictPolicy;
}): { mapping: Map<string, string>; conflicts: string[] } => {
  const used = new Set<string>(params.existingNames.map(normalize));
  const mapping = new Map<string, string>();
  const conflicts: string[] = [];

  params.importedNames.forEach((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = normalize(trimmed);
    const isConflict = used.has(key);

    if (params.policy === 'merge') {
      mapping.set(trimmed, trimmed);
      if (isConflict) conflicts.push(trimmed);
      return;
    }

    // createUnique
    const target = buildUniqueLayerName(trimmed, used);
    mapping.set(trimmed, target);
    if (isConflict) conflicts.push(trimmed);
  });

  return { mapping, conflicts };
};
