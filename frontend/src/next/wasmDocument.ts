import type { SerializedProject } from '@/types';
import { decodeWorldSnapshot, encodeWorldSnapshot, snapshotFromLegacyProject, type WorldSnapshotV1 } from './worldSnapshot';

export type WasmDocumentEngine = {
  allocBytes: (byteCount: number) => number;
  freeBytes: (ptr: number) => void;
  reserveWorld: (maxRects: number, maxLines: number, maxPolylines: number, maxPoints: number) => void;
  loadSnapshotFromPtr: (ptr: number, byteCount: number) => void;
  getSnapshotBufferMeta: () => { generation: number; byteCount: number; ptr: number };
};

export type WasmDocumentModule = {
  HEAPU8: Uint8Array;
};

export type WasmDocumentImportResult = {
  snapshot: WorldSnapshotV1;
  idHashToString: Map<number, string>;
  idStringToHash: Map<string, number>;
  supportedCount: number;
  droppedByType: Record<string, number>;
};

export function importLegacyProjectIntoWasm(
  engine: WasmDocumentEngine,
  module: WasmDocumentModule,
  project: SerializedProject,
): WasmDocumentImportResult {
  const { snapshot, report } = snapshotFromLegacyProject(project);
  const bytes = encodeWorldSnapshot(snapshot);

  engine.reserveWorld(snapshot.rects.length, snapshot.lines.length, snapshot.polylines.length, snapshot.points.length);
  const ptr = engine.allocBytes(bytes.byteLength);
  module.HEAPU8.set(bytes, ptr);
  engine.loadSnapshotFromPtr(ptr, bytes.byteLength);
  engine.freeBytes(ptr);

  const meta = engine.getSnapshotBufferMeta();
  const snapBytes = module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount);
  const decoded = decodeWorldSnapshot(snapBytes);

  const idStringToHash = new Map<string, number>();
  report.idMap.forEach((v, k) => idStringToHash.set(v, k));

  return {
    snapshot: decoded,
    idHashToString: report.idMap,
    idStringToHash,
    supportedCount: report.supportedCount,
    droppedByType: report.droppedByType,
  };
}

export function exportWasmSnapshotBytes(engine: WasmDocumentEngine, module: WasmDocumentModule): Uint8Array {
  const meta = engine.getSnapshotBufferMeta();
  const view = module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount);
  // Export must be stable even if the WASM heap later changes; copy out.
  return new Uint8Array(view);
}

