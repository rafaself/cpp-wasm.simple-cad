import type { Shape } from '@/types';

// NOTE: These enums must match the C++ bindings in `cpp/engine/bindings.cpp`
// and the underlying engine enums in `cpp/engine/interaction/interaction_types.h`.
export enum TransformMode {
  Move = 0,
  VertexDrag = 1,
  EdgeDrag = 2,
  Resize = 3,
  Rotate = 4,
  SideResize = 5, // Constrained resize (N/E/S/W handles)
}

// NOTE: These opcodes must match `TransformOpCode` in interaction_types.h.
export enum TransformOpCode {
  MOVE = 1,
  VERTEX_SET = 2,
  RESIZE = 3,
  ROTATE = 4,
  SIDE_RESIZE = 5,
}

export const COMMIT_PAYLOAD_STRIDE = 4;

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

export type MoveCommitPayload = { dx: number; dy: number };
export type VertexSetCommitPayload = { vertexIndex: number; x: number; y: number };
export type ResizeCommitPayload = { x: number; y: number; width: number; height: number };
export type RotateCommitPayload = { rotationDeg: number };

// Transform state for UI feedback (tooltips, etc.)
// Must match TransformState in cpp/engine/interaction/interaction_types.h
export type TransformState = {
  active: boolean;
  mode: number; // TransformMode as number
  rotationDeltaDeg: number; // For Rotate mode: accumulated rotation angle
  pivotX: number; // For Rotate mode: pivot point X
  pivotY: number; // For Rotate mode: pivot point Y
};

export const decodeMovePayload = (payloads: Float32Array, i: number): MoveCommitPayload | null => {
  const o = i * COMMIT_PAYLOAD_STRIDE;
  if (o + 1 >= payloads.length) return null;
  const dx = payloads[o + 0]!;
  const dy = payloads[o + 1]!;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return { dx, dy };
};

// Contract (C++):
// - payload[0] = vertexIndex (float, but represents an integer)
// - payload[1] = x
// - payload[2] = y
// - payload[3] = reserved
export const decodeVertexSetPayload = (
  payloads: Float32Array,
  i: number,
): VertexSetCommitPayload | null => {
  const o = i * COMMIT_PAYLOAD_STRIDE;
  if (o + 2 >= payloads.length) return null;

  const rawIndex = payloads[o + 0]!;
  const x = payloads[o + 1]!;
  const y = payloads[o + 2]!;
  if (!Number.isFinite(rawIndex) || !Number.isFinite(x) || !Number.isFinite(y)) return null;

  const rounded = Math.round(rawIndex);
  const vertexIndex = Math.abs(rawIndex - rounded) < 1e-3 ? rounded : Math.trunc(rawIndex);
  return { vertexIndex, x, y };
};

// Contract (C++):
// - payload[0] = x (rect: minX, circle/polygon: cx)
// - payload[1] = y (rect: minY, circle/polygon: cy)
// - payload[2] = width  (rect: w, circle/polygon: diameterX)
// - payload[3] = height (rect: h, circle/polygon: diameterY)
export const decodeResizePayload = (
  payloads: Float32Array,
  i: number,
): ResizeCommitPayload | null => {
  const o = i * COMMIT_PAYLOAD_STRIDE;
  if (o + 3 >= payloads.length) return null;

  const x = payloads[o + 0]!;
  const y = payloads[o + 1]!;
  const width = payloads[o + 2]!;
  const height = payloads[o + 3]!;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  )
    return null;

  return { x, y, width, height };
};

// Contract (C++):
// - payload[0] = rotationDeg (rotation in degrees)
// - payload[1] = reserved
// - payload[2] = reserved
// - payload[3] = reserved
export const decodeRotatePayload = (
  payloads: Float32Array,
  i: number,
): RotateCommitPayload | null => {
  const o = i * COMMIT_PAYLOAD_STRIDE;
  if (o >= payloads.length) return null;

  const rotationDeg = payloads[o + 0]!;
  if (!Number.isFinite(rotationDeg)) return null;

  return { rotationDeg };
};

export const applyCommitOpToShape = (
  shape: Shape,
  op: TransformOpCode,
  payloads: Float32Array,
  i: number,
): Partial<Shape> | null => {
  if (op === TransformOpCode.MOVE) {
    const move = decodeMovePayload(payloads, i);
    if (!move) return null;
    const { dx, dy } = move;

    const diff: Partial<Shape> = {};

    if (shape.x !== undefined) diff.x = clampTiny((shape.x ?? 0) + dx);
    if (shape.y !== undefined) diff.y = clampTiny((shape.y ?? 0) + dy);

    if (Array.isArray(shape.points) && shape.points.length > 0) {
      diff.points = shape.points.map((pt) => ({
        x: clampTiny(pt.x + dx),
        y: clampTiny(pt.y + dy),
      }));
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }

  if (op === TransformOpCode.VERTEX_SET) {
    const vertex = decodeVertexSetPayload(payloads, i);
    if (!vertex) return null;
    if (!Array.isArray(shape.points) || shape.points.length === 0) return null;

    const { vertexIndex, x, y } = vertex;
    if (vertexIndex < 0 || vertexIndex >= shape.points.length) return null;

    const nextPoints = [...shape.points];
    nextPoints[vertexIndex] = { x: clampTiny(x), y: clampTiny(y) };
    return { points: nextPoints };
  }

  if (op === TransformOpCode.RESIZE) {
    const resize = decodeResizePayload(payloads, i);
    if (!resize) return null;

    const nextX = clampTiny(resize.x);
    const nextY = clampTiny(resize.y);
    const nextW = Math.max(1e-3, resize.width);
    const nextH = Math.max(1e-3, resize.height);

    const diff: Partial<Shape> = {};
    if (shape.x === undefined || shape.x !== nextX) diff.x = nextX;
    if (shape.y === undefined || shape.y !== nextY) diff.y = nextY;
    if (shape.width === undefined || shape.width !== nextW) diff.width = nextW;
    if (shape.height === undefined || shape.height !== nextH) diff.height = nextH;

    if ((shape.type === 'circle' || shape.type === 'polygon') && shape.radius !== undefined) {
      diff.radius = undefined;
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }

  if (op === TransformOpCode.ROTATE) {
    const rotate = decodeRotatePayload(payloads, i);
    if (!rotate) return null;

    const { rotationDeg } = rotate;
    const diff: Partial<Shape> = {};

    // Only apply rotation if shape supports it
    if (
      shape.rotation !== undefined ||
      shape.type === 'circle' ||
      shape.type === 'polygon' ||
      shape.type === 'text'
    ) {
      diff.rotation = rotationDeg;
    }

    return Object.keys(diff).length > 0 ? diff : null;
  }

  return null;
};
