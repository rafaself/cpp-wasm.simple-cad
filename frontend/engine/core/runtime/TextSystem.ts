import { CadEngineInstance, WasmModule, TextEntityMeta } from '../wasm-types';

export class TextSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance
  ) {}

  public getTextContent(textId: number): string | null {
      if (!this.engine.getTextContentMeta) return null;
      const meta = this.engine.getTextContentMeta(textId);
      if (!meta.exists) return null;
      if (meta.byteCount === 0) return '';
      
      const bytes = this.module.HEAPU8.subarray(meta.ptr, meta.ptr + meta.byteCount);
      return new TextDecoder().decode(bytes);
  }

  private cache: Map<number, TextEntityMeta> = new Map();
  private lastCacheGeneration: number = -1;

  public getTextEntityMeta(textId: number): TextEntityMeta | null {
     const stats = this.engine.getStats();
     if (stats.generation !== this.lastCacheGeneration) {
         this.refreshCache(stats.generation);
     }
     return this.cache.get(textId) ?? null;
  }

  private refreshCache(generation: number) {
      this.cache.clear();
      const all = this.getAllTextMetas();
      for (const meta of all) {
          this.cache.set(meta.id, meta);
      }
      this.lastCacheGeneration = generation;
  }

  public getAllTextMetas(): TextEntityMeta[] {
      if (!this.engine.getAllTextMetas) return [];
      const vec = this.engine.getAllTextMetas();
      const count = vec.size();
      const result: TextEntityMeta[] = [];
      for (let i = 0; i < count; i++) {
          result.push(vec.get(i));
      }
      vec.delete();
      return result;
  }
}
