import type {
  VectorClipEntry,
  VectorDocumentV1,
  VectorDraw,
  VectorPath,
  VectorSidecarV1,
} from '@/types';

const prefixId = (prefix: string, id: string): string => `${prefix}${id}`;

const remapClipStack = (
  stack: VectorClipEntry[] | undefined,
  pathIdMap: Map<string, string>,
): VectorClipEntry[] | undefined => {
  if (!stack || stack.length === 0) return stack;
  return stack.map((c) => ({
    ...c,
    pathId: pathIdMap.get(c.pathId) ?? c.pathId,
  }));
};

const remapDocumentV1 = (
  doc: VectorDocumentV1,
  prefix: string,
): {
  document: VectorDocumentV1;
  pathIdMap: Map<string, string>;
  drawIdMap: Map<string, string>;
} => {
  const pathIdMap = new Map<string, string>();
  const drawIdMap = new Map<string, string>();

  const paths: VectorPath[] = doc.paths.map((p) => {
    const nextId = prefixId(prefix, p.id);
    pathIdMap.set(p.id, nextId);
    return { ...p, id: nextId };
  });

  const draws: VectorDraw[] = doc.draws.map((d) => {
    const nextId = prefixId(prefix, d.id);
    drawIdMap.set(d.id, nextId);
    return {
      ...d,
      id: nextId,
      pathId: pathIdMap.get(d.pathId) ?? d.pathId,
      clipStack: remapClipStack(d.clipStack, pathIdMap),
    };
  });

  return { document: { version: 1, paths, draws }, pathIdMap, drawIdMap };
};

export const mergeVectorSidecarsV1 = (
  base: VectorSidecarV1 | null,
  add: VectorSidecarV1,
  prefixForAdd: string,
): VectorSidecarV1 => {
  if (!base) {
    const remapped = remapDocumentV1(add.document as VectorDocumentV1, prefixForAdd);
    const bindings: VectorSidecarV1['bindings'] = {};
    for (const [shapeId, binding] of Object.entries(add.bindings)) {
      bindings[shapeId] = {
        drawIds: binding.drawIds.map((id) => remapped.drawIdMap.get(id) ?? id),
      };
    }
    return { version: 1, document: remapped.document, bindings };
  }

  const remapped = remapDocumentV1(add.document as VectorDocumentV1, prefixForAdd);
  const bindings: VectorSidecarV1['bindings'] = { ...base.bindings };
  for (const [shapeId, binding] of Object.entries(add.bindings)) {
    bindings[shapeId] = { drawIds: binding.drawIds.map((id) => remapped.drawIdMap.get(id) ?? id) };
  }

  return {
    version: 1,
    document: {
      version: 1,
      paths: [...(base.document as VectorDocumentV1).paths, ...remapped.document.paths],
      draws: [...(base.document as VectorDocumentV1).draws, ...remapped.document.draws],
    },
    bindings,
  };
};
