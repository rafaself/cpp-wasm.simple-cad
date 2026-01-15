import { DxfData, DxfEntity, DxfVector } from './types';

type Group = { code: number; value: string };

const parseNumber = (raw: string): number | undefined => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const dist2 = (a: DxfVector, b: DxfVector) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
};

const EPS2 = 1e-12;

// dxf-parser currently does not surface some entities we need for fidelity:
// - HATCH (solid fills)
// - POLYLINE/VERTEX/SEQEND (often used inside BLOCKS with bulge arcs)
//
// This module performs a lightweight pass on the raw DXF text to extract those
// entities and merge them into the parsed DxfData.
export const augmentParsedDxfDataWithRaw = (rawText: string, parsed: DxfData): DxfData => {
  const lines = rawText.split(/\r?\n/);
  const readGroup = (i: number): Group | null => {
    if (i < 0 || i + 1 >= lines.length) return null;
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isFinite(code)) return null;
    return { code, value: (lines[i + 1] ?? '').trim() };
  };

  const readPoint = (
    startIndex: number,
    baseCode: number,
  ): { point?: DxfVector; nextIndex: number } => {
    // Expects codes baseCode and baseCode+10 for x/y.
    const gx = readGroup(startIndex);
    const gy = readGroup(startIndex + 2);
    if (!gx || !gy || gx.code !== baseCode || gy.code !== baseCode + 10) {
      return { nextIndex: startIndex };
    }
    const x = parseNumber(gx.value);
    const y = parseNumber(gy.value);
    if (x === undefined || y === undefined) return { nextIndex: startIndex + 4 };
    return { point: { x, y }, nextIndex: startIndex + 4 };
  };

  const parsedEntities: DxfEntity[] = [];
  const parsedBlockEntities: Record<string, DxfEntity[]> = {};

  let currentSection: string | null = null;
  let currentBlockName: string | null = null;

  // We iterate by group pairs (code/value).
  for (let i = 0; i < lines.length - 1; i += 2) {
    const g = readGroup(i);
    if (!g) continue;

    // SECTION handling
    if (g.code === 0 && g.value === 'SECTION') {
      const sec = readGroup(i + 2);
      if (sec && sec.code === 2) currentSection = sec.value;
      continue;
    }
    if (g.code === 0 && g.value === 'ENDSEC') {
      currentSection = null;
      currentBlockName = null;
      continue;
    }

    // BLOCKS: track current block name so we can attach extracted POLYLINEs to it
    if (currentSection === 'BLOCKS' && g.code === 0 && g.value === 'BLOCK') {
      currentBlockName = null;
      // scan forward until next entity marker, capture code 2 as block name
      for (let j = i + 2; j < lines.length - 1; j += 2) {
        const gg = readGroup(j);
        if (!gg) continue;
        if (gg.code === 0) break;
        if (gg.code === 2) {
          currentBlockName = gg.value;
          break;
        }
      }
      continue;
    }
    if (currentSection === 'BLOCKS' && g.code === 0 && g.value === 'ENDBLK') {
      currentBlockName = null;
      continue;
    }

    // POLYLINE parsing (in ENTITIES and in BLOCKS)
    if (
      (currentSection === 'ENTITIES' || currentSection === 'BLOCKS') &&
      g.code === 0 &&
      g.value === 'POLYLINE'
    ) {
      let layer = '0';
      let flags70 = 0;
      let j = i + 2;
      // Read POLYLINE header until next entity marker (0)
      for (; j < lines.length - 1; j += 2) {
        const gg = readGroup(j);
        if (!gg) continue;
        if (gg.code === 0) break;
        if (gg.code === 8) layer = gg.value || '0';
        if (gg.code === 70) flags70 = parseInt(gg.value, 10) || 0;
      }

      const vertices: DxfVector[] = [];
      // Read VERTEX entities until SEQEND
      for (; j < lines.length - 1; j += 2) {
        const eg = readGroup(j);
        if (!eg) continue;
        if (eg.code !== 0) continue;
        if (eg.value === 'VERTEX') {
          let vx: number | undefined;
          let vy: number | undefined;
          let bulge: number | undefined;
          // Read vertex groups
          for (j = j + 2; j < lines.length - 1; j += 2) {
            const vg = readGroup(j);
            if (!vg) continue;
            if (vg.code === 0) {
              j -= 2; // rewind so outer sees this marker
              break;
            }
            if (vg.code === 10) vx = parseNumber(vg.value);
            if (vg.code === 20) vy = parseNumber(vg.value);
            if (vg.code === 42) bulge = parseNumber(vg.value);
          }
          if (vx !== undefined && vy !== undefined) {
            const v: DxfVector = { x: vx, y: vy };
            if (bulge !== undefined) v.bulge = bulge;
            vertices.push(v);
          }
        } else if (eg.value === 'SEQEND') {
          break;
        } else {
          // Some other entity encountered; stop consuming polyline stream.
          break;
        }
      }

      const closed = (flags70 & 1) !== 0;
      const entity: DxfEntity = {
        type: 'LWPOLYLINE',
        layer,
        vertices,
        closed,
      };
      // dxf-parser uses `shape` as a closed indicator in some cases; set it for compatibility.
      (entity as any).shape = closed;
      (entity as any).source = 'raw-polyline';

      if (currentSection === 'BLOCKS' && currentBlockName) {
        parsedBlockEntities[currentBlockName] = parsedBlockEntities[currentBlockName] || [];
        parsedBlockEntities[currentBlockName].push(entity);
      } else {
        parsedEntities.push(entity);
      }

      // Continue from where we stopped. Ensure we don't skip a `0 <ENTITY>` marker or ENDSEC.
      i = Math.max(i, j - 2);
      continue;
    }

    // HATCH parsing (solid fills) - ENTITIES section only
    if (currentSection === 'ENTITIES' && g.code === 0 && g.value === 'HATCH') {
      let layer = '0';
      let pattern = 'SOLID';
      let loops = 0;
      let j = i + 2;

      // Read header until we hit loop definition start (92/93/72 etc) or next entity marker.
      for (; j < lines.length - 1; j += 2) {
        const hg = readGroup(j);
        if (!hg) continue;
        if (hg.code === 0) break;
        if (hg.code === 8) layer = hg.value || '0';
        if (hg.code === 2) pattern = hg.value || pattern;
        if (hg.code === 91) loops = parseInt(hg.value, 10) || 0;
        // Once we see boundary data, stop header scanning
        if (hg.code === 92 || hg.code === 93 || hg.code === 72) break;
      }

      // Only handle SOLID for now (matches current file)
      if (pattern.toUpperCase() !== 'SOLID') {
        continue;
      }

      // Parse loops (this file uses 91=1 and loop type 92=1)
      let loopsParsed = 0;
      for (; j < lines.length - 1; j += 2) {
        const lg = readGroup(j);
        if (!lg) continue;
        if (lg.code === 0) break;

        if (lg.code === 92) {
          loopsParsed++;
          // loop type ignored for now
          continue;
        }
        if (lg.code !== 93) continue;

        const edgeCount = parseInt(lg.value, 10) || 0;
        const pts: DxfVector[] = [];
        let lastEnd: DxfVector | undefined;

        // Read edgeCount edges
        for (let eidx = 0; eidx < edgeCount && j < lines.length - 1; ) {
          const tg = readGroup(j + 2);
          if (!tg) break;
          if (tg.code === 0) break;
          if (tg.code !== 72) {
            j += 2;
            continue;
          }

          const edgeType = parseInt(tg.value, 10) || 0;
          j += 2;
          if (edgeType !== 1) {
            // Unsupported edge type (arc/spline). Skip conservatively until next 72 or 0.
            for (; j < lines.length - 1; j += 2) {
              const sg = readGroup(j);
              if (!sg) continue;
              if (sg.code === 0 || sg.code === 72) {
                j -= 2;
                break;
              }
            }
            eidx++;
            continue;
          }

          // For edgeType 1, expect start 10/20 and end 11/21 (in that order)
          const p1 = readPoint(j + 2, 10);
          const p2 = readPoint(p1.nextIndex, 11);
          j = p2.nextIndex - 2;

          if (p1.point) {
            // Try to keep an ordered chain
            if (!pts.length) {
              pts.push({ x: p1.point.x, y: p1.point.y });
            } else if (lastEnd && dist2(lastEnd, p1.point) > EPS2) {
              // If edge start doesn't match previous end, still append; we'll close later.
              pts.push({ x: p1.point.x, y: p1.point.y });
            }
          }
          if (p2.point) {
            pts.push({ x: p2.point.x, y: p2.point.y });
            lastEnd = p2.point;
          }

          eidx++;
        }

        // If loop yields usable points, record as a closed LWPOLYLINE with hatch flag.
        if (pts.length >= 3) {
          const hatchPolyline: DxfEntity = {
            type: 'LWPOLYLINE',
            layer,
            vertices: pts,
            closed: true,
          };
          (hatchPolyline as any).isHatch = true;
          (hatchPolyline as any).shape = true;
          (hatchPolyline as any).source = 'raw-hatch';
          parsedEntities.push(hatchPolyline);
        }

        if (loops && loopsParsed >= loops) break;
      }

      // Continue from where we stopped. Ensure we don't skip a `0 <ENTITY>` marker or ENDSEC.
      i = Math.max(i, j - 2);
      continue;
    }
  }

  // Merge extracted block entities into parsed.blocks
  if (parsed.blocks) {
    for (const [blockName, ents] of Object.entries(parsedBlockEntities)) {
      const block = parsed.blocks[blockName];
      if (!block) continue;
      block.entities = (block.entities || []).concat(ents);
    }
  }

  // Merge extracted top-level entities
  parsed.entities = (parsed.entities || []).concat(parsedEntities);

  return parsed;
};
