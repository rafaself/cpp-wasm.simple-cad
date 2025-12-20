/* eslint-disable no-console */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DxfParser = require('dxf-parser/dist/dxf-parser.js');

const DXF_PATH = new URL('../assets/example-2.dxf', import.meta.url);
const rawText = fs.readFileSync(DXF_PATH, 'utf8');

const lines = rawText.split(/\r?\n/);
const readGroup = (i) => {
  if (i < 0 || i + 1 >= lines.length) return null;
  const code = parseInt(lines[i].trim(), 10);
  if (!Number.isFinite(code)) return null;
  return { code, value: (lines[i + 1] ?? '').trim() };
};

const scanRawEntityCounts = () => {
  const counts = new Map();
  for (let i = 0; i < lines.length - 1; i += 2) {
    const g = readGroup(i);
    if (!g) continue;
    if (g.code === 0) counts.set(g.value, (counts.get(g.value) || 0) + 1);
  }
  return counts;
};

const scanRawSpecials = () => {
  let section = null;
  let block = null;
  const polylineInBlocks = [];
  const hatchInEntities = [];

  for (let i = 0; i < lines.length - 1; i += 2) {
    const g = readGroup(i);
    if (!g) continue;

    if (g.code === 0 && g.value === 'SECTION') {
      const s = readGroup(i + 2);
      if (s?.code === 2) section = s.value;
      continue;
    }
    if (g.code === 0 && g.value === 'ENDSEC') {
      section = null;
      block = null;
      continue;
    }
    if (section === 'BLOCKS' && g.code === 0 && g.value === 'BLOCK') {
      block = null;
      for (let j = i + 2; j < lines.length - 1; j += 2) {
        const gg = readGroup(j);
        if (!gg) continue;
        if (gg.code === 0) break;
        if (gg.code === 2) {
          block = gg.value;
          break;
        }
      }
      continue;
    }
    if (section === 'BLOCKS' && g.code === 0 && g.value === 'ENDBLK') {
      block = null;
      continue;
    }

    if (section === 'BLOCKS' && g.code === 0 && g.value === 'POLYLINE') {
      // Extract basic header and vertices quickly
      let layer = '0';
      let flags70 = 0;
      const verts = [];
      let j = i + 2;
      for (; j < lines.length - 1; j += 2) {
        const gg = readGroup(j);
        if (!gg) continue;
        if (gg.code === 0) break;
        if (gg.code === 8) layer = gg.value || '0';
        if (gg.code === 70) flags70 = parseInt(gg.value, 10) || 0;
      }
      for (; j < lines.length - 1; j += 2) {
        const eg = readGroup(j);
        if (!eg) continue;
        if (eg.code !== 0) continue;
        if (eg.value === 'VERTEX') {
          let x, y, bulge;
          for (j = j + 2; j < lines.length - 1; j += 2) {
            const vg = readGroup(j);
            if (!vg) continue;
            if (vg.code === 0) {
              j -= 2;
              break;
            }
            if (vg.code === 10) x = Number(vg.value);
            if (vg.code === 20) y = Number(vg.value);
            if (vg.code === 42) bulge = Number(vg.value);
          }
          if (Number.isFinite(x) && Number.isFinite(y)) verts.push({ x, y, bulge });
        } else if (eg.value === 'SEQEND') {
          break;
        } else {
          break;
        }
      }
      polylineInBlocks.push({ block: block || '(unknown)', layer, flags70, vertCount: verts.length, verts });
      i = Math.max(i, j - 2);
      continue;
    }

    if (section === 'ENTITIES' && g.code === 0 && g.value === 'HATCH') {
      let layer = '0';
      let pattern = 'SOLID';
      let loopCount = 0;
      let edgeCount = 0;
      for (let j = i + 2; j < lines.length - 1; j += 2) {
        const hg = readGroup(j);
        if (!hg) continue;
        if (hg.code === 0) break;
        if (hg.code === 8) layer = hg.value || '0';
        if (hg.code === 2) pattern = hg.value || pattern;
        if (hg.code === 91) loopCount = parseInt(hg.value, 10) || 0;
        if (hg.code === 93) edgeCount = parseInt(hg.value, 10) || edgeCount;
      }
      hatchInEntities.push({ layer, pattern, loopCount, edgeCount });
      continue;
    }
  }

  return { polylineInBlocks, hatchInEntities };
};

const parser = new DxfParser();
const parsed = parser.parseSync(rawText);

const byType = {};
for (const e of parsed.entities || []) byType[e.type] = (byType[e.type] || 0) + 1;

const arcs = (parsed.entities || []).filter((e) => e.type === 'ARC');
const circles = (parsed.entities || []).filter((e) => e.type === 'CIRCLE');
const splines = (parsed.entities || []).filter((e) => e.type === 'SPLINE');
const lwBulge = (parsed.entities || []).filter(
  (e) => e.type === 'LWPOLYLINE' && Array.isArray(e.vertices) && e.vertices.some((v) => v.bulge && Math.abs(v.bulge) > 1e-10),
);

const arcSweepsDeg = arcs
  .map((a) => {
    if (typeof a.startAngle !== 'number' || typeof a.endAngle !== 'number') return null;
    let d = a.endAngle - a.startAngle;
    if (d < 0) d += Math.PI * 2;
    return (d * 180) / Math.PI;
  })
  .filter((v) => typeof v === 'number')
  .sort((a, b) => a - b);

const maxArcAngle = Math.max(
  0,
  ...arcs.flatMap((a) => [a.startAngle, a.endAngle].filter((v) => typeof v === 'number')),
);
const arcAngleUnitsGuess = maxArcAngle > Math.PI * 2 + 0.5 ? 'degrees' : 'radians';

const topSmallArcs = arcs
  .map((a) => ({
    layer: a.layer,
    radius: a.radius,
    start: a.startAngle,
    end: a.endAngle,
  }))
  .sort((a, b) => (a.radius ?? Infinity) - (b.radius ?? Infinity))
  .slice(0, 10);

const topBulge2v = lwBulge
  .filter((e) => (e.vertices || []).length === 2)
  .slice(0, 10)
  .map((e) => ({
    layer: e.layer,
    shape: e.shape,
    closed: e.closed,
    verts: e.vertices,
  }));

const rawCounts = scanRawEntityCounts();
const missingFromParser = [];
for (const [t, c] of rawCounts.entries()) {
  if (
    [
      'SECTION',
      'ENDSEC',
      'TABLE',
      'ENDTAB',
      'LAYER',
      'LTYPE',
      'BLOCK',
      'ENDBLK',
      'BLOCK_RECORD',
      'CLASS',
      'DICTIONARY',
      'DICTIONARYVAR',
      'XRECORD',
      'VPORT',
      'APPID',
      'STYLE',
      'DIMSTYLE',
      'MATERIAL',
      'ACDBPLACEHOLDER',
      'LAYOUT',
      'EOF',
      'SEQEND',
      'VERTEX',
    ].includes(t)
  )
    continue;
  if (!byType[t]) missingFromParser.push([t, c]);
}
missingFromParser.sort((a, b) => b[1] - a[1]);

const { polylineInBlocks, hatchInEntities } = scanRawSpecials();

console.log('=== DXF Curve Audit: example-2.dxf ===');
console.log('dxf-parser entity counts:', byType);
console.log('raw types missing from dxf-parser entities:', missingFromParser.slice(0, 20));
console.log('ARC angle units guess:', arcAngleUnitsGuess, '(max angle:', maxArcAngle, ')');
console.log('ARC sweep degrees (min/median/max):', {
  count: arcSweepsDeg.length,
  min: arcSweepsDeg[0],
  median: arcSweepsDeg[Math.floor(arcSweepsDeg.length / 2)],
  max: arcSweepsDeg[arcSweepsDeg.length - 1],
});
console.log('Smallest ARC samples:', topSmallArcs);
console.log('Bulged LWPOLYLINE (count):', lwBulge.length);
console.log('Bulged LWPOLYLINE with 2 vertices samples:', topBulge2v);
console.log('Raw HATCH count:', hatchInEntities.length, 'patterns:', [...new Set(hatchInEntities.map((h) => h.pattern))]);
console.log('Raw POLYLINE-in-BLOCKS count:', polylineInBlocks.length, 'blocks:', [...new Set(polylineInBlocks.map((p) => p.block))]);
console.log('First few POLYLINE-in-BLOCKS:', polylineInBlocks.slice(0, 5));
