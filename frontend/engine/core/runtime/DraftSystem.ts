import { COMMAND_BUFFER_MAGIC, CommandOp } from '../commandBuffer';

import type { CadEngineInstance, WasmModule } from '../wasm-types';

/**
 * DraftSystem
 *
 * Hot-path drafting updates without re-encoding the entire command buffer on every pointer move.
 * Preallocates a fixed-size command buffer for UpdateDraft/AppendDraftPoint and writes coordinates in place.
 */
export class DraftSystem {
  private readonly updateBufferByteLength = 40; // 16-byte header + 16-byte cmd header + 8-byte payload
  private updateBufferPtr: number | null = null;
  private updateView: DataView | null = null;
  private appendBufferPtr: number | null = null;
  private appendView: DataView | null = null;

  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance,
  ) {}

  public dispose(): void {
    if (this.updateBufferPtr !== null) {
      this.engine.freeBytes(this.updateBufferPtr);
      this.updateBufferPtr = null;
      this.updateView = null;
    }
    if (this.appendBufferPtr !== null) {
      this.engine.freeBytes(this.appendBufferPtr);
      this.appendBufferPtr = null;
      this.appendView = null;
    }
  }

  /**
   * Update draft position using a reusable binary buffer.
   */
  public updateDraft(x: number, y: number): void {
    if (!this.ensureUpdateBuffer()) return;
    this.updateView!.setFloat32(32, x, true);
    this.updateView!.setFloat32(36, y, true);
    this.engine.applyCommandBuffer(this.updateBufferPtr!, this.updateBufferByteLength);
  }

  /**
   * Append a draft point (polyline/polygon) using the same zero-allocation path.
   */
  public appendDraftPoint(x: number, y: number): void {
    if (!this.ensureAppendBuffer()) return;
    this.appendView!.setFloat32(32, x, true);
    this.appendView!.setFloat32(36, y, true);
    this.engine.applyCommandBuffer(this.appendBufferPtr!, this.updateBufferByteLength);
  }

  private ensureUpdateBuffer(): boolean {
    if (this.updateBufferPtr !== null && this.updateView !== null) {
      return true;
    }
    if (!this.engine.allocBytes) return false;

    const ptr = this.engine.allocBytes(this.updateBufferByteLength);
    this.updateBufferPtr = ptr;
    this.updateView = new DataView(this.module.HEAPU8.buffer, ptr, this.updateBufferByteLength);
    this.writeStaticHeader(this.updateView, CommandOp.UpdateDraft);
    return true;
  }

  private ensureAppendBuffer(): boolean {
    if (this.appendBufferPtr !== null && this.appendView !== null) {
      return true;
    }
    if (!this.engine.allocBytes) return false;

    const ptr = this.engine.allocBytes(this.updateBufferByteLength);
    this.appendBufferPtr = ptr;
    this.appendView = new DataView(this.module.HEAPU8.buffer, ptr, this.updateBufferByteLength);
    this.writeStaticHeader(this.appendView, CommandOp.AppendDraftPoint);
    return true;
  }

  private writeStaticHeader(view: DataView, op: CommandOp): void {
    let o = 0;
    o = this.writeU32(view, o, COMMAND_BUFFER_MAGIC);
    o = this.writeU32(view, o, 2); // version
    o = this.writeU32(view, o, 1); // command count
    o = this.writeU32(view, o, 0); // reserved

    o = this.writeU32(view, o, op); // op
    o = this.writeU32(view, o, 0); // id unused
    o = this.writeU32(view, o, 8); // payload bytes
    o = this.writeU32(view, o, 0); // reserved

    // Payload is at offset 32 (two f32 values), initialized to zero by default.
  }

  private writeU32(view: DataView, offset: number, value: number): number {
    view.setUint32(offset, value >>> 0, true);
    return offset + 4;
  }
}
