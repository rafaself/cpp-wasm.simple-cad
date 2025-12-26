import type { Shape } from '@/types';

// NOTE: These enums must match the C++ bindings in `cpp/engine/bindings.cpp`
// and the underlying engine enums in `cpp/engine/engine.h`.
export enum TransformMode {
  Move = 0,
  VertexDrag = 1,
  EdgeDrag = 2,
  Resize = 3,
}

// NOTE: These opcodes must match `CadEngine::TransformOpCode` in C++.
export enum TransformOpCode {
  MOVE = 1,
  VERTEX_SET = 2,
  RESIZE = 3,
}

export const COMMIT_PAYLOAD_STRIDE = 4;

const clampTiny = (v: number): number => (Math.abs(v) < 1e-6 ? 0 : v);

export type MoveCommitPayload = { dx: number; dy: number };
export type VertexSetCommitPayload = { vertexIndex: number; x: number; y: number };

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
export const decodeVertexSetPayload = (payloads: Float32Array, i: number): VertexSetCommitPayload | null => {
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

export const applyCommitOpToShape = (shape: Shape, op: TransformOpCode, payloads: Float32Array, i: number): Partial<Shape> | null => {
  if (op === TransformOpCode.MOVE) {
    const move = decodeMovePayload(payloads, i);
    if (!move) return null;
    const { dx, dy } = move;

    const diff: Partial<Shape> = {};

    if (shape.x !== undefined) diff.x = clampTiny((shape.x ?? 0) + dx);
    if (shape.y !== undefined) diff.y = clampTiny((shape.y ?? 0) + dy);

    if (Array.isArray(shape.points) && shape.points.length > 0) {
      diff.points = shape.points.map((pt) => ({ x: clampTiny(pt.x + dx), y: clampTiny(pt.y + dy) }));
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

  return null;
};

