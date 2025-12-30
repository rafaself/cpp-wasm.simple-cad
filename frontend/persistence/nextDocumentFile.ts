import type { FrameSettings, Patch, SerializedProject } from '../types';

export type NextDocumentHistory = {
  past: Patch[][];
  future: Patch[][];
};

export type NextDocumentMeta = {
  worldScale: number;
  frame: FrameSettings;
};

export type NextDocumentPayload = NextDocumentMeta & {
  project?: SerializedProject;
  history?: NextDocumentHistory;
};

export type NextDocumentExtras = {
  /**
   * Optional WASM engine snapshot bytes (ESNP).
   * Required for engine-first load (PR-03).
   */
  engineSnapshot?: Uint8Array;
};

export type NextDocumentDecoded = NextDocumentPayload & NextDocumentExtras;

const MAGIC = new Uint8Array([0x45, 0x57, 0x4e, 0x44]); // "EWND"
const VERSION_V1 = 1;
const VERSION_V2 = 2;
const VERSION_V3 = 3;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const writeU32LE = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value >>> 0, true);
};

const readU32LE = (view: DataView, offset: number): number => {
  return view.getUint32(offset, true);
};

const fourCC = (s: string): number => {
  if (s.length !== 4) throw new Error(`fourCC must be 4 chars, got "${s}"`);
  return (
    (s.charCodeAt(0) |
      (s.charCodeAt(1) << 8) |
      (s.charCodeAt(2) << 16) |
      (s.charCodeAt(3) << 24)) >>>
    0
  );
};

const TAG_META = fourCC('META');
const TAG_PROJ = fourCC('PROJ');
const TAG_HIST = fourCC('HIST');
const TAG_ESNP = fourCC('ESNP'); // engine snapshot (ESNP)

const crcTable: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
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

type Section = {
  tag: number;
  bytes: Uint8Array;
};

export const encodeNextDocumentFile = (
  payload: NextDocumentPayload,
  extras?: NextDocumentExtras,
): Uint8Array => {
  if (!extras?.engineSnapshot || extras.engineSnapshot.byteLength === 0) {
    throw new Error('NextDocument V3 requires an ESNP engine snapshot.');
  }

  const metaBytes = textEncoder.encode(
    JSON.stringify({ worldScale: payload.worldScale, frame: payload.frame }),
  );

  const sections: Section[] = [
    { tag: TAG_META, bytes: metaBytes },
    { tag: TAG_ESNP, bytes: extras.engineSnapshot },
  ];

  // Header:
  // - magic[4]
  // - version[u32]
  // - sectionCount[u32]
  // - reserved[u32]
  // Table: sectionCount * 16 bytes:
  // - tag[u32]
  // - offset[u32] (from file start)
  // - byteLength[u32]
  // - crc32[u32]
  const headerBytes = 16;
  const tableBytes = sections.length * 16;
  const payloadBytes = sections.reduce((sum, s) => sum + s.bytes.byteLength, 0);
  const totalBytes = headerBytes + tableBytes + payloadBytes;

  const out = new Uint8Array(totalBytes);
  out.set(MAGIC, 0);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  writeU32LE(view, 4, VERSION_V3);
  writeU32LE(view, 8, sections.length);
  writeU32LE(view, 12, 0);

  let tableOffset = headerBytes;
  let dataOffset = headerBytes + tableBytes;

  for (const section of sections) {
    const len = section.bytes.byteLength;
    writeU32LE(view, tableOffset + 0, section.tag);
    writeU32LE(view, tableOffset + 4, dataOffset);
    writeU32LE(view, tableOffset + 8, len);
    writeU32LE(view, tableOffset + 12, crc32(section.bytes));
    out.set(section.bytes, dataOffset);
    tableOffset += 16;
    dataOffset += len;
  }

  return out;
};

const decodeV1 = (bytes: Uint8Array): NextDocumentDecoded => {
  if (bytes.byteLength < 20) throw new Error('Invalid file: too small.');
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Invalid file: bad magic.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = readU32LE(view, 4);
  if (version !== VERSION_V1) throw new Error(`Unsupported file version: ${version}`);

  const metaLen = readU32LE(view, 8);
  const projectLen = readU32LE(view, 12);
  const historyLen = readU32LE(view, 16);

  const headerBytes = 20;
  const totalExpected = headerBytes + metaLen + projectLen + historyLen;
  if (totalExpected !== bytes.byteLength) throw new Error('Invalid file: length mismatch.');

  let o = headerBytes;
  const metaJson = textDecoder.decode(bytes.subarray(o, o + metaLen));
  o += metaLen;
  const projectJson = textDecoder.decode(bytes.subarray(o, o + projectLen));
  o += projectLen;
  const historyJson = textDecoder.decode(bytes.subarray(o, o + historyLen));

  const meta = JSON.parse(metaJson) as { worldScale: number; frame: FrameSettings };
  const project = JSON.parse(projectJson) as SerializedProject;
  const history = JSON.parse(historyJson) as NextDocumentHistory;

  return {
    worldScale: meta.worldScale,
    frame: meta.frame,
    project,
    history,
  };
};

export const decodeNextDocumentFile = (bytes: Uint8Array): NextDocumentDecoded => {
  if (bytes.byteLength < 16) throw new Error('Invalid file: too small.');
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Invalid file: bad magic.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = readU32LE(view, 4);
  if (version === VERSION_V1) return decodeV1(bytes);
  if (version !== VERSION_V2 && version !== VERSION_V3)
    throw new Error(`Unsupported file version: ${version}`);

  const sectionCount = readU32LE(view, 8);
  const headerBytes = 16;
  const tableBytes = sectionCount * 16;
  const tableEnd = headerBytes + tableBytes;
  if (bytes.byteLength < tableEnd) throw new Error('Invalid file: truncated header.');

  const sectionsByTag = new Map<number, Uint8Array>();
  for (let i = 0; i < sectionCount; i++) {
    const base = headerBytes + i * 16;
    const tag = readU32LE(view, base + 0);
    const offset = readU32LE(view, base + 4);
    const byteLength = readU32LE(view, base + 8);
    const expectedCrc = readU32LE(view, base + 12);

    const end = offset + byteLength;
    if (offset < tableEnd) throw new Error('Invalid file: section overlaps header.');
    if (end > bytes.byteLength) throw new Error('Invalid file: truncated section payload.');

    const slice = bytes.subarray(offset, end);
    const actualCrc = crc32(slice);
    if (actualCrc !== expectedCrc) throw new Error('Invalid file: checksum mismatch.');

    // First occurrence wins (ignore duplicates to avoid ambiguity).
    if (!sectionsByTag.has(tag)) sectionsByTag.set(tag, slice);
  }

  const metaBytes = sectionsByTag.get(TAG_META);
  if (!metaBytes) throw new Error('Invalid file: missing META section.');

  const metaJson = textDecoder.decode(metaBytes);
  const meta = JSON.parse(metaJson) as { worldScale: number; frame: FrameSettings };

  const projectBytes = sectionsByTag.get(TAG_PROJ);
  const historyBytes = sectionsByTag.get(TAG_HIST);
  const engineSnapshot = sectionsByTag.get(TAG_ESNP);

  const project = projectBytes
    ? (JSON.parse(textDecoder.decode(projectBytes)) as SerializedProject)
    : undefined;
  const history = historyBytes
    ? (JSON.parse(textDecoder.decode(historyBytes)) as NextDocumentHistory)
    : undefined;

  if (version === VERSION_V3 && !engineSnapshot) {
    throw new Error('Invalid file: missing ESNP snapshot for V3.');
  }

  return {
    worldScale: meta.worldScale,
    frame: meta.frame,
    project,
    history,
    engineSnapshot: engineSnapshot ? new Uint8Array(engineSnapshot) : undefined,
  };
};
