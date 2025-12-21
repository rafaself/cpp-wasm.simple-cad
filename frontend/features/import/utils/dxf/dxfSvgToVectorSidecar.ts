import type { Shape, VectorSidecarV1 } from '@/types';

import { svgToVectorDocumentV1 } from '../svg/svgToVectorDocument';

export const buildDxfSvgVectorSidecarV1 = (shape: Shape): VectorSidecarV1 | null => {
  if (shape.type !== 'rect') return null;
  if (!shape.svgRaw) return null;

  const document = svgToVectorDocumentV1(shape.svgRaw);
  if (document.draws.length === 0) return null;

  return {
    version: 1,
    document,
    bindings: {
      [shape.id]: { drawIds: document.draws.map((d) => d.id) },
    },
  };
};

