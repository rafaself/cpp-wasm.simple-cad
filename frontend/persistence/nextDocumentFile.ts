import type { FrameSettings, Patch, SerializedProject } from '../types';

export type NextDocumentHistory = {
  past: Patch[][];
  future: Patch[][];
};

export type NextDocumentPayload = {
  worldScale: number;
  frame: FrameSettings;
  project: SerializedProject;
  history: NextDocumentHistory;
};

const MAGIC = new Uint8Array([0x45, 0x57, 0x4e, 0x44]); // "EWND"
const VERSION = 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const writeU32LE = (view: DataView, offset: number, value: number): void => {
  view.setUint32(offset, value >>> 0, true);
};

const readU32LE = (view: DataView, offset: number): number => {
  return view.getUint32(offset, true);
};

export const encodeNextDocumentFile = (payload: NextDocumentPayload): Uint8Array => {
  const projectJson = JSON.stringify(payload.project);
  const historyJson = JSON.stringify(payload.history);
  const metaJson = JSON.stringify({ worldScale: payload.worldScale, frame: payload.frame });

  const projectBytes = textEncoder.encode(projectJson);
  const historyBytes = textEncoder.encode(historyJson);
  const metaBytes = textEncoder.encode(metaJson);

  const headerBytes = 4 + 4 + 4 + 4 + 4; // magic + version + metaLen + projectLen + historyLen
  const total = headerBytes + metaBytes.byteLength + projectBytes.byteLength + historyBytes.byteLength;
  const out = new Uint8Array(total);

  out.set(MAGIC, 0);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);

  writeU32LE(view, 4, VERSION);
  writeU32LE(view, 8, metaBytes.byteLength);
  writeU32LE(view, 12, projectBytes.byteLength);
  writeU32LE(view, 16, historyBytes.byteLength);

  let o = headerBytes;
  out.set(metaBytes, o);
  o += metaBytes.byteLength;
  out.set(projectBytes, o);
  o += projectBytes.byteLength;
  out.set(historyBytes, o);

  return out;
};

export const decodeNextDocumentFile = (bytes: Uint8Array): NextDocumentPayload => {
  if (bytes.byteLength < 20) throw new Error('Invalid file: too small.');
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== MAGIC[i]) throw new Error('Invalid file: bad magic.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = readU32LE(view, 4);
  if (version !== VERSION) throw new Error(`Unsupported file version: ${version}`);

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

