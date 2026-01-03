import { CadEngineInstance, WasmModule, TextEntityMeta } from '../wasm-types';

export class TextSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance,
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

  public initializeTextSystem(): boolean {
    return this.engine.initializeTextSystem?.() ?? false;
  }

  public loadFont(fontId: number, fontData: Uint8Array): boolean {
    return this.loadFontEx(fontId, fontData, false, false);
  }

  public loadFontEx(fontId: number, fontData: Uint8Array, bold: boolean, italic: boolean): boolean {
    const loader = this.engine.loadFontEx || this.engine.loadFont;
    if (!loader || !this.engine.allocBytes || !this.engine.freeBytes) return false;
    const ptr = this.engine.allocBytes(fontData.byteLength);
    try {
      this.module.HEAPU8.set(fontData, ptr);
      if (this.engine.loadFontEx) {
        return this.engine.loadFontEx(fontId, ptr, fontData.byteLength, bold, italic);
      }
      return this.engine.loadFont!(fontId, ptr, fontData.byteLength);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }

  public hitTestText(textId: number, localX: number, localY: number) {
    return this.engine.hitTestText?.(textId, localX, localY) ?? null;
  }

  public getTextCaretPosition(textId: number, byteIndex: number) {
    return this.engine.getTextCaretPosition?.(textId, byteIndex) ?? null;
  }

  public rebuildTextQuadBuffer(): void {
    this.engine.rebuildTextQuadBuffer?.();
  }

  public getTextQuadBufferMeta() {
    return this.engine.getTextQuadBufferMeta?.();
  }

  public getAtlasTextureMeta() {
    return this.engine.getAtlasTextureMeta?.();
  }

  public isAtlasDirty(): boolean {
    return this.engine.isAtlasDirty ? this.engine.isAtlasDirty() : false;
  }

  public clearAtlasDirty(): void {
    this.engine.clearAtlasDirty?.();
  }

  public getTextContentMeta(textId: number) {
    return this.engine.getTextContentMeta?.(textId) ?? { exists: false, ptr: 0, byteCount: 0 };
  }

  public getTextBounds(textId: number) {
    return this.engine.getTextBounds?.(textId) ?? null;
  }

  public getTextSelectionRects(textId: number, start: number, end: number) {
    return (
      this.engine.getTextSelectionRects?.(textId, start, end) ?? {
        size: () => 0,
        get: () => null as any,
        delete: () => undefined,
      }
    );
  }

  public setTextConstraintWidth(textId: number, width: number): boolean {
    return this.engine.setTextConstraintWidth?.(textId, width) ?? false;
  }

  public setTextPosition(
    textId: number,
    x: number,
    y: number,
    boxMode: number,
    constraintWidth: number,
  ): boolean {
    return this.engine.setTextPosition?.(textId, x, y, boxMode, constraintWidth) ?? false;
  }

  public getTextStyleSnapshot(textId: number) {
    return this.engine.getTextStyleSnapshot?.(textId) ?? null;
  }

  public getTextStyleSummary(textId: number) {
    return this.engine.getTextStyleSummary(textId);
  }

  public getVisualPrevCharIndex(textId: number, charIndex: number) {
    return this.engine.getVisualPrevCharIndex?.(textId, charIndex) ?? charIndex;
  }

  public getVisualNextCharIndex(textId: number, charIndex: number) {
    return this.engine.getVisualNextCharIndex?.(textId, charIndex) ?? charIndex;
  }

  public getWordLeftIndex(textId: number, charIndex: number) {
    return this.engine.getWordLeftIndex?.(textId, charIndex) ?? charIndex;
  }

  public getWordRightIndex(textId: number, charIndex: number) {
    return this.engine.getWordRightIndex?.(textId, charIndex) ?? charIndex;
  }

  public getLineStartIndex(textId: number, charIndex: number) {
    return this.engine.getLineStartIndex?.(textId, charIndex) ?? charIndex;
  }

  public getLineEndIndex(textId: number, charIndex: number) {
    return this.engine.getLineEndIndex?.(textId, charIndex) ?? charIndex;
  }

  public getLineUpIndex(textId: number, charIndex: number) {
    return this.engine.getLineUpIndex?.(textId, charIndex) ?? charIndex;
  }

  public getLineDownIndex(textId: number, charIndex: number) {
    return this.engine.getLineDownIndex?.(textId, charIndex) ?? charIndex;
  }
}
