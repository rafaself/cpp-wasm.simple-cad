// Deterministic benchmark: TS legacy -> WorldSnapshotV1 -> bytes -> decode.
// Usage: `node frontend/verification/benchmark_world_snapshot.mjs 10000`

import { performance } from 'node:perf_hooks';
import { encodeWorldSnapshot, decodeWorldSnapshot, snapshotFromLegacyProject } from '../src/next/worldSnapshot.ts';

const n = Number(process.argv[2] ?? 10000);
if (!Number.isFinite(n) || n <= 0) {
  console.error('Invalid N. Example: node frontend/verification/benchmark_world_snapshot.mjs 10000');
  process.exit(1);
}

const project = {
  layers: [{ id: 'desenho', name: 'Desenho', strokeColor: '#000', strokeEnabled: true, fillColor: '#fff', fillEnabled: true, visible: true, locked: false }],
  activeLayerId: 'desenho',
  shapes: [],
  electricalElements: [],
  connectionNodes: [],
  diagramNodes: [],
  diagramEdges: [],
};

for (let i = 0; i < n; i++) {
  project.shapes.push({
    id: `r${i}`,
    layerId: 'desenho',
    type: 'rect',
    x: i % 1000,
    y: Math.floor(i / 1000),
    width: 1,
    height: 1,
    strokeColor: '#000',
    fillColor: '#fff',
    points: [],
  });
}

const t0 = performance.now();
const { snapshot } = snapshotFromLegacyProject(project);
const t1 = performance.now();
const bytes = encodeWorldSnapshot(snapshot);
const t2 = performance.now();
const decoded = decodeWorldSnapshot(bytes);
const t3 = performance.now();

console.log(JSON.stringify({
  n,
  rects: decoded.rects.length,
  lines: decoded.lines.length,
  polylines: decoded.polylines.length,
  points: decoded.points.length,
  bytes: bytes.byteLength,
  ms_buildSnapshot: +(t1 - t0).toFixed(3),
  ms_encode: +(t2 - t1).toFixed(3),
  ms_decode: +(t3 - t2).toFixed(3),
}, null, 2));

