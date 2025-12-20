// Deterministic benchmark: build WorldSnapshot -> bytes -> decode.
// Usage: `node frontend/verification/benchmark_world_snapshot.mjs 10000`

import { performance } from 'node:perf_hooks';
import { encodeWorldSnapshot, decodeWorldSnapshot } from '../src/next/worldSnapshot.ts';

const n = Number(process.argv[2] ?? 10000);
if (!Number.isFinite(n) || n <= 0) {
  console.error('Invalid N. Example: node frontend/verification/benchmark_world_snapshot.mjs 10000');
  process.exit(1);
}

const snapshot = {
  version: 3,
  rects: [],
  lines: [],
  polylines: [],
  points: [],
  symbols: [],
  nodes: [],
  conduits: [],
};

for (let i = 0; i < n; i++) {
  snapshot.rects.push({
    id: i + 1,
    x: i % 1000,
    y: Math.floor(i / 1000),
    w: 1,
    h: 1,
  });
}

const t0 = performance.now();
const bytes = encodeWorldSnapshot(snapshot);
const t1 = performance.now();
const decoded = decodeWorldSnapshot(bytes);
const t3 = performance.now();

console.log(JSON.stringify({
  n,
  rects: decoded.rects.length,
  lines: decoded.lines.length,
  polylines: decoded.polylines.length,
  points: decoded.points.length,
  bytes: bytes.byteLength,
  ms_encode: +(t1 - t0).toFixed(3),
  ms_decode: +(t3 - t1).toFixed(3),
}, null, 2));
