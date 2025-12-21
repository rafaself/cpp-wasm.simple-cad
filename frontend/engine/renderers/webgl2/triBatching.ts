export type TriangleBatch = {
  firstVertex: number;
  vertexCount: number;
  blended: boolean;
};

const isTriangleBlended = (vertices: Float32Array, triFirstFloat: number, floatsPerVertex: number): boolean => {
  // Expected interleaved layout: [x,y,z,r,g,b,a] per vertex => alpha at offset 6.
  const alphaOffset = 6;
  if (floatsPerVertex <= alphaOffset) return true;

  for (let i = 0; i < 3; i += 1) {
    const a = vertices[triFirstFloat + i * floatsPerVertex + alphaOffset];
    if (!Number.isFinite(a) || a < 0.999) return true;
  }
  return false;
};

export const computeTriangleBatches = (
  vertices: Float32Array,
  floatsPerVertex: number,
): TriangleBatch[] => {
  if (floatsPerVertex <= 0) return [];
  const vertexCount = Math.floor(vertices.length / floatsPerVertex);
  const triCount = Math.floor(vertexCount / 3);
  if (triCount <= 0) return [];

  const batches: TriangleBatch[] = [];
  let current: TriangleBatch | null = null;

  for (let tri = 0; tri < triCount; tri += 1) {
    const triFirstVertex = tri * 3;
    const triFirstFloat = triFirstVertex * floatsPerVertex;
    const blended = isTriangleBlended(vertices, triFirstFloat, floatsPerVertex);

    if (!current || current.blended !== blended) {
      current = { firstVertex: triFirstVertex, vertexCount: 3, blended };
      batches.push(current);
      continue;
    }

    current.vertexCount += 3;
  }

  return batches;
};

