import { EngineEntityFlags, EngineLayerFlags, type EntityId } from '@/engine/core/protocol';

const MAGIC_ESNP = 0x504e5345; // "ESNP"
const VERSION_ESNP = 1;

const fourCC = (s: string): number => {
  if (s.length !== 4) throw new Error(`fourCC must be 4 chars, got "${s}"`);
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>> 0
  );
};

const TAG_ENTS = fourCC('ENTS');
const TAG_LAYR = fourCC('LAYR');
const TAG_ORDR = fourCC('ORDR');
const TAG_SELC = fourCC('SELC');
const TAG_TEXT = fourCC('TEXT');
const TAG_NIDX = fourCC('NIDX');

const HEADER_BYTES = 16;
const SECTION_ENTRY_BYTES = 16;
const TEXT_RUN_BYTES = 24;
const TEXT_HEADER_BYTES = 64;

const textDecoder = new TextDecoder();

const crcTable: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const readU32 = (view: DataView, offset: number): number => view.getUint32(offset, true);
const readF32 = (view: DataView, offset: number): number => view.getFloat32(offset, true);

export type EsnpLayer = {
  id: number;
  order: number;
  flags: number;
  name: string;
};

export type EsnpRect = {
  id: number;
  layerId: number;
  flags: number;
  x: number;
  y: number;
  w: number;
  h: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  strokeR: number;
  strokeG: number;
  strokeB: number;
  strokeA: number;
  strokeEnabled: number;
  strokeWidth: number;
};

export type EsnpLine = {
  id: number;
  layerId: number;
  flags: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  r: number;
  g: number;
  b: number;
  a: number;
  enabled: number;
  strokeWidth: number;
};

export type EsnpPolyline = {
  id: number;
  layerId: number;
  flags: number;
  offset: number;
  count: number;
  r: number;
  g: number;
  b: number;
  a: number;
  sr: number;
  sg: number;
  sb: number;
  sa: number;
  enabled: number;
  strokeEnabled: number;
  strokeWidth: number;
};

export type EsnpCircle = {
  id: number;
  layerId: number;
  flags: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  sx: number;
  sy: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  strokeR: number;
  strokeG: number;
  strokeB: number;
  strokeA: number;
  strokeEnabled: number;
  strokeWidth: number;
};

export type EsnpPolygon = {
  id: number;
  layerId: number;
  flags: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rot: number;
  sx: number;
  sy: number;
  sides: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  strokeR: number;
  strokeG: number;
  strokeB: number;
  strokeA: number;
  strokeEnabled: number;
  strokeWidth: number;
};

export type EsnpArrow = {
  id: number;
  layerId: number;
  flags: number;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  head: number;
  sr: number;
  sg: number;
  sb: number;
  sa: number;
  strokeEnabled: number;
  strokeWidth: number;
};

export type EsnpTextRun = {
  startIndex: number;
  length: number;
  fontId: number;
  fontSize: number;
  colorRGBA: number;
  flags: number;
};

export type EsnpText = {
  id: number;
  layerId: number;
  flags: number;
  x: number;
  y: number;
  rotation: number;
  boxMode: number;
  align: number;
  constraintWidth: number;
  layoutWidth: number;
  layoutHeight: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  runs: EsnpTextRun[];
  content: string;
};

export type EsnpSnapshot = {
  rects: EsnpRect[];
  lines: EsnpLine[];
  polylines: EsnpPolyline[];
  points: { x: number; y: number }[];
  circles: EsnpCircle[];
  polygons: EsnpPolygon[];
  arrows: EsnpArrow[];
  layers: EsnpLayer[];
  drawOrder: EntityId[];
  selection: EntityId[];
  texts: EsnpText[];
  nextId: number;
};

const requireBytes = (offset: number, bytes: number, total: number): void => {
  if (offset + bytes > total) {
    throw new Error('ESNP section truncated.');
  }
};

export const decodeEsnpSnapshot = (bytes: Uint8Array): EsnpSnapshot => {
  if (bytes.byteLength < HEADER_BYTES) throw new Error('ESNP: file too small.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = readU32(view, 0);
  if (magic !== MAGIC_ESNP) throw new Error('ESNP: invalid magic.');
  const version = readU32(view, 4);
  if (version !== VERSION_ESNP) throw new Error(`ESNP: unsupported version ${version}.`);
  const sectionCount = readU32(view, 8);

  const tableBytes = sectionCount * SECTION_ENTRY_BYTES;
  requireBytes(HEADER_BYTES, tableBytes, bytes.byteLength);

  const sections = new Map<number, Uint8Array>();
  for (let i = 0; i < sectionCount; i++) {
    const base = HEADER_BYTES + i * SECTION_ENTRY_BYTES;
    const tag = readU32(view, base + 0);
    const offset = readU32(view, base + 4);
    const size = readU32(view, base + 8);
    const expectedCrc = readU32(view, base + 12);
    const end = offset + size;
    requireBytes(offset, size, bytes.byteLength);
    const slice = bytes.subarray(offset, end);
    if (crc32(slice) !== expectedCrc) throw new Error('ESNP: checksum mismatch.');
    if (!sections.has(tag)) sections.set(tag, slice);
  }

  const ents = sections.get(TAG_ENTS);
  const layr = sections.get(TAG_LAYR);
  const ordr = sections.get(TAG_ORDR);
  const selc = sections.get(TAG_SELC);
  const text = sections.get(TAG_TEXT);
  const nidx = sections.get(TAG_NIDX);
  if (!ents || !layr || !ordr || !selc || !text || !nidx) {
    throw new Error('ESNP: missing required sections.');
  }

  const parseView = (slice: Uint8Array) => new DataView(slice.buffer, slice.byteOffset, slice.byteLength);

  const snapshot: EsnpSnapshot = {
    rects: [],
    lines: [],
    polylines: [],
    points: [],
    circles: [],
    polygons: [],
    arrows: [],
    layers: [],
    drawOrder: [],
    selection: [],
    texts: [],
    nextId: 1,
  };

  // ENTS
  {
    const v = parseView(ents);
    let o = 0;
    requireBytes(o, 7 * 4, ents.byteLength);
    const rectCount = readU32(v, o); o += 4;
    const lineCount = readU32(v, o); o += 4;
    const polyCount = readU32(v, o); o += 4;
    const pointCount = readU32(v, o); o += 4;
    const circleCount = readU32(v, o); o += 4;
    const polygonCount = readU32(v, o); o += 4;
    const arrowCount = readU32(v, o); o += 4;

    for (let i = 0; i < rectCount; i++) {
      requireBytes(o, 68, ents.byteLength);
      snapshot.rects.push({
        id: readU32(v, o),
        layerId: readU32(v, o + 4),
        flags: readU32(v, o + 8),
        x: readF32(v, o + 12),
        y: readF32(v, o + 16),
        w: readF32(v, o + 20),
        h: readF32(v, o + 24),
        fillR: readF32(v, o + 28),
        fillG: readF32(v, o + 32),
        fillB: readF32(v, o + 36),
        fillA: readF32(v, o + 40),
        strokeR: readF32(v, o + 44),
        strokeG: readF32(v, o + 48),
        strokeB: readF32(v, o + 52),
        strokeA: readF32(v, o + 56),
        strokeEnabled: readF32(v, o + 60),
        strokeWidth: readF32(v, o + 64),
      });
      o += 68;
    }

    for (let i = 0; i < lineCount; i++) {
      requireBytes(o, 52, ents.byteLength);
      snapshot.lines.push({
        id: readU32(v, o),
        layerId: readU32(v, o + 4),
        flags: readU32(v, o + 8),
        x0: readF32(v, o + 12),
        y0: readF32(v, o + 16),
        x1: readF32(v, o + 20),
        y1: readF32(v, o + 24),
        r: readF32(v, o + 28),
        g: readF32(v, o + 32),
        b: readF32(v, o + 36),
        a: readF32(v, o + 40),
        enabled: readF32(v, o + 44),
        strokeWidth: readF32(v, o + 48),
      });
      o += 52;
    }

    for (let i = 0; i < polyCount; i++) {
      requireBytes(o, 64, ents.byteLength);
      snapshot.polylines.push({
        id: readU32(v, o),
        layerId: readU32(v, o + 4),
        flags: readU32(v, o + 8),
        offset: readU32(v, o + 12),
        count: readU32(v, o + 16),
        r: readF32(v, o + 20),
        g: readF32(v, o + 24),
        b: readF32(v, o + 28),
        a: readF32(v, o + 32),
        sr: readF32(v, o + 36),
        sg: readF32(v, o + 40),
        sb: readF32(v, o + 44),
        sa: readF32(v, o + 48),
        enabled: readF32(v, o + 52),
        strokeEnabled: readF32(v, o + 56),
        strokeWidth: readF32(v, o + 60),
      });
      o += 64;
    }

    for (let i = 0; i < pointCount; i++) {
      requireBytes(o, 8, ents.byteLength);
      snapshot.points.push({ x: readF32(v, o), y: readF32(v, o + 4) });
      o += 8;
    }

    for (let i = 0; i < circleCount; i++) {
      requireBytes(o, 80, ents.byteLength);
      snapshot.circles.push({
        id: readU32(v, o),
        layerId: readU32(v, o + 4),
        flags: readU32(v, o + 8),
        cx: readF32(v, o + 12),
        cy: readF32(v, o + 16),
        rx: readF32(v, o + 20),
        ry: readF32(v, o + 24),
        rot: readF32(v, o + 28),
        sx: readF32(v, o + 32),
        sy: readF32(v, o + 36),
        fillR: readF32(v, o + 40),
        fillG: readF32(v, o + 44),
        fillB: readF32(v, o + 48),
        fillA: readF32(v, o + 52),
        strokeR: readF32(v, o + 56),
        strokeG: readF32(v, o + 60),
        strokeB: readF32(v, o + 64),
        strokeA: readF32(v, o + 68),
        strokeEnabled: readF32(v, o + 72),
        strokeWidth: readF32(v, o + 76),
      });
      o += 80;
    }

    for (let i = 0; i < polygonCount; i++) {
      requireBytes(o, 84, ents.byteLength);
      snapshot.polygons.push({
        id: readU32(v, o),
        layerId: readU32(v, o + 4),
        flags: readU32(v, o + 8),
        cx: readF32(v, o + 12),
        cy: readF32(v, o + 16),
        rx: readF32(v, o + 20),
        ry: readF32(v, o + 24),
        rot: readF32(v, o + 28),
        sx: readF32(v, o + 32),
        sy: readF32(v, o + 36),
        sides: readU32(v, o + 40),
        fillR: readF32(v, o + 44),
        fillG: readF32(v, o + 48),
        fillB: readF32(v, o + 52),
        fillA: readF32(v, o + 56),
        strokeR: readF32(v, o + 60),
        strokeG: readF32(v, o + 64),
        strokeB: readF32(v, o + 68),
        strokeA: readF32(v, o + 72),
        strokeEnabled: readF32(v, o + 76),
        strokeWidth: readF32(v, o + 80),
      });
      o += 84;
    }

    for (let i = 0; i < arrowCount; i++) {
      requireBytes(o, 56, ents.byteLength);
      snapshot.arrows.push({
        id: readU32(v, o),
        layerId: readU32(v, o + 4),
        flags: readU32(v, o + 8),
        ax: readF32(v, o + 12),
        ay: readF32(v, o + 16),
        bx: readF32(v, o + 20),
        by: readF32(v, o + 24),
        head: readF32(v, o + 28),
        sr: readF32(v, o + 32),
        sg: readF32(v, o + 36),
        sb: readF32(v, o + 40),
        sa: readF32(v, o + 44),
        strokeEnabled: readF32(v, o + 48),
        strokeWidth: readF32(v, o + 52),
      });
      o += 56;
    }
  }

  // LAYR
  {
    const v = parseView(layr);
    let o = 0;
    requireBytes(o, 4, layr.byteLength);
    const count = readU32(v, o); o += 4;
    for (let i = 0; i < count; i++) {
      requireBytes(o, 16, layr.byteLength);
      const id = readU32(v, o); o += 4;
      const order = readU32(v, o); o += 4;
      const flags = readU32(v, o); o += 4;
      const nameLen = readU32(v, o); o += 4;
      requireBytes(o, nameLen, layr.byteLength);
      const name = nameLen ? textDecoder.decode(layr.subarray(o, o + nameLen)) : '';
      o += nameLen;
      snapshot.layers.push({ id, order, flags, name });
    }
  }

  // ORDR
  {
    const v = parseView(ordr);
    let o = 0;
    requireBytes(o, 4, ordr.byteLength);
    const count = readU32(v, o); o += 4;
    requireBytes(o, count * 4, ordr.byteLength);
    for (let i = 0; i < count; i++) {
      snapshot.drawOrder.push(readU32(v, o));
      o += 4;
    }
  }

  // SELC
  {
    const v = parseView(selc);
    let o = 0;
    requireBytes(o, 4, selc.byteLength);
    const count = readU32(v, o); o += 4;
    requireBytes(o, count * 4, selc.byteLength);
    for (let i = 0; i < count; i++) {
      snapshot.selection.push(readU32(v, o));
      o += 4;
    }
  }

  // NIDX
  {
    const v = parseView(nidx);
    requireBytes(0, 4, nidx.byteLength);
    snapshot.nextId = readU32(v, 0);
  }

  // TEXT
  {
    const v = parseView(text);
    let o = 0;
    requireBytes(o, 4, text.byteLength);
    const count = readU32(v, o); o += 4;
    for (let i = 0; i < count; i++) {
      requireBytes(o, TEXT_HEADER_BYTES, text.byteLength);
      const id = readU32(v, o); o += 4;
      const layerId = readU32(v, o); o += 4;
      const flags = readU32(v, o); o += 4;
      const x = readF32(v, o); o += 4;
      const y = readF32(v, o); o += 4;
      const rotation = readF32(v, o); o += 4;
      const boxMode = text[o];
      const align = text[o + 1];
      o += 4;
      const constraintWidth = readF32(v, o); o += 4;
      const runCount = readU32(v, o); o += 4;
      const contentLength = readU32(v, o); o += 4;
      const layoutWidth = readF32(v, o); o += 4;
      const layoutHeight = readF32(v, o); o += 4;
      const minX = readF32(v, o); o += 4;
      const minY = readF32(v, o); o += 4;
      const maxX = readF32(v, o); o += 4;
      const maxY = readF32(v, o); o += 4;

      requireBytes(o, runCount * TEXT_RUN_BYTES, text.byteLength);
      const runs: EsnpTextRun[] = [];
      for (let r = 0; r < runCount; r++) {
        runs.push({
          startIndex: readU32(v, o),
          length: readU32(v, o + 4),
          fontId: readU32(v, o + 8),
          fontSize: readF32(v, o + 12),
          colorRGBA: readU32(v, o + 16),
          flags: text[o + 20] ?? 0,
        });
        o += TEXT_RUN_BYTES;
      }

      requireBytes(o, contentLength, text.byteLength);
      const content = contentLength ? textDecoder.decode(text.subarray(o, o + contentLength)) : '';
      o += contentLength;

      snapshot.texts.push({
        id,
        layerId,
        flags,
        x,
        y,
        rotation,
        boxMode,
        align,
        constraintWidth,
        layoutWidth,
        layoutHeight,
        minX,
        minY,
        maxX,
        maxY,
        runs,
        content,
      });
    }
  }

  return snapshot;
};

export const decodeLayerFlags = (flags: number): { visible: boolean; locked: boolean } => ({
  visible: (flags & EngineLayerFlags.Visible) !== 0,
  locked: (flags & EngineLayerFlags.Locked) !== 0,
});

export const decodeEntityFlags = (flags: number): { visible: boolean; locked: boolean } => ({
  visible: (flags & EngineEntityFlags.Visible) !== 0,
  locked: (flags & EngineEntityFlags.Locked) !== 0,
});
