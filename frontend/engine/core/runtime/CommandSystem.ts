import type { EngineCommand } from '../commandBuffer';
import { encodeCommandBuffer } from '../commandBuffer';
import { CadEngineInstance, WasmModule } from '../wasm-types';

export class CommandSystem {
  private static readonly INITIAL_BUFFER_SIZE = 64 * 1024; // 64KB
  private commandBufferPtr: number = 0;
  private commandBufferCapacity: number = 0;

  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance
  ) {}

  public apply(commands: readonly EngineCommand[]): void {
    if (commands.length === 0) return;

    const bytes = encodeCommandBuffer(commands);
    const ptr = this.ensureCommandBuffer(bytes.byteLength);
    this.module.HEAPU8.set(bytes, ptr);
    this.engine.applyCommandBuffer(ptr, bytes.byteLength);
    // Buffer is NOT freed — reused on next apply()
  }

  public dispose(): void {
    if (this.commandBufferPtr !== 0) {
      this.engine.freeBytes(this.commandBufferPtr);
      this.commandBufferPtr = 0;
      this.commandBufferCapacity = 0;
    }
  }

  private ensureCommandBuffer(size: number): number {
    if (size <= this.commandBufferCapacity) {
      return this.commandBufferPtr;
    }
    // Free old buffer if exists
    if (this.commandBufferPtr !== 0) {
      this.engine.freeBytes(this.commandBufferPtr);
    }
    // Allocate with headroom
    const newCapacity = Math.max(size, CommandSystem.INITIAL_BUFFER_SIZE);
    this.commandBufferPtr = this.engine.allocBytes(newCapacity);
    this.commandBufferCapacity = newCapacity;
    return this.commandBufferPtr;
  }
}
