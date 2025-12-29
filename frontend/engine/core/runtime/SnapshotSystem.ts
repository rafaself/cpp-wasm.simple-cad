import { CadEngineInstance, WasmModule } from '../wasm-types';
import { DocumentDigest } from '../protocol';

export class SnapshotSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance
  ) {}

  public loadSnapshotBytes(bytes: Uint8Array): void {
    const ptr = this.engine.allocBytes(bytes.byteLength);
    try {
      this.module.HEAPU8.set(bytes, ptr);
      this.engine.loadSnapshotFromPtr(ptr, bytes.byteLength);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }

  public saveSnapshotBytes(): Uint8Array {
    const meta =
      (typeof this.engine.saveSnapshot === 'function' ? this.engine.saveSnapshot() : null) ??
      this.engine.getSnapshotBufferMeta();
    if (!meta || meta.byteCount === 0) return new Uint8Array();
    return new Uint8Array(this.module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount));
  }

  public getFullSnapshotBytes(): Uint8Array {
    const meta = this.engine.getFullSnapshotMeta();
    if (!meta || meta.byteCount === 0) return new Uint8Array();
    return new Uint8Array(this.module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount));
  }

  public getDocumentDigest(): DocumentDigest | null {
    if (typeof this.engine.getDocumentDigest !== 'function') return null;
    return this.engine.getDocumentDigest();
  }
}
