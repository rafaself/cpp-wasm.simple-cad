// Deterministic benchmark: parse SVG -> VectorDocumentV1.
// Usage:
// - `node frontend/verification/benchmark_svg_to_vector_document.mjs 1000`
// - `node frontend/verification/benchmark_svg_to_vector_document.mjs 10000`

import { performance } from 'node:perf_hooks';

import { svgToVectorDocumentV1 } from '../features/import/utils/svg/svgToVectorDocument.js';

const parseN = () => {
  const raw = process.argv[2] ?? '1000';
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
};

const N = parseN();
if (!N) {
  console.error('Invalid N. Example: node frontend/verification/benchmark_svg_to_vector_document.mjs 1000');
  process.exit(1);
}

const buildSvg = (n) => {
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`<defs><path id="seg" d="M0 0 L10 0 L10 10 Z" /></defs>`);
  for (let i = 0; i < n; i++) {
    const x = (i % 100) * 12;
    const y = Math.floor(i / 100) * 12;
    parts.push(`<use href="#seg" x="${x}" y="${y}" fill="#000" stroke="#fff" stroke-width="1"/>`);
  }
  parts.push(`</svg>`);
  return parts.join('');
};

const svg = buildSvg(N);
const t0 = performance.now();
const doc = svgToVectorDocumentV1(svg);
const t1 = performance.now();

console.log(JSON.stringify({
  N,
  ms: Number((t1 - t0).toFixed(2)),
  paths: doc.paths.length,
  draws: doc.draws.length,
}));

