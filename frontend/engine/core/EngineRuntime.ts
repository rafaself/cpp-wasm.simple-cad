// ... (imports)
import type { SelectionStyleState } from '@/engine/core/protocol';

export class EngineRuntime {
  // ... (previous members)

  // --- Style System (New) ---
  public setLayerStyle(layerId: number, sr: number, sg: number, sb: number, sa: number, fr: number, fg: number, fb: number, fa: number, strokeWidth: number): void {
    if (!this.#engine.setLayerStyle) return;
    this.#engine.setLayerStyle(layerId, sr, sg, sb, sa, fr, fg, fb, fa, strokeWidth);
  }

  public setEntityOverride(ids: EntityId[], isStroke: boolean, r: number, g: number, b: number, a: number): void {
    if (!this.#engine.setEntityOverride) return;
    const idsPtr = this.module.getPointer(new Uint32Array(ids));
    try {
        this.#engine.setEntityOverride(idsPtr, ids.length, isStroke, r, g, b, a);
    } finally {
        this.module.freePointer(idsPtr);
    }
  }

  public setFillEnabled(ids: EntityId[], enabled: boolean): void {
    if (!this.#engine.setFillEnabled) return;
    const idsPtr = this.module.getPointer(new Uint32Array(ids));
    try {
        this.#engine.setFillEnabled(idsPtr, ids.length, enabled);
    } finally {
        this.module.freePointer(idsPtr);
    }
  }

  public clearEntityOverride(ids: EntityId[], isStroke: boolean): void {
    if (!this.#engine.clearEntityOverride) return;
    const idsPtr = this.module.getPointer(new Uint32Array(ids));
    try {
        this.#engine.clearEntityOverride(idsPtr, ids.length, isStroke);
    } finally {
        this.module.freePointer(idsPtr);
    }
  }

  public getSelectionStyleState(): SelectionStyleState {
    if (!this.#engine.getSelectionStyleState) {
        return {
            strokeSource: 0,
            fillSource: 0,
            commonStrokeR: 0, commonStrokeG: 0, commonStrokeB: 0, commonStrokeA: 1,
            commonFillR: 0, commonFillG: 0, commonFillB: 0, commonFillA: 0,
            hasMixedStrokeColor: false,
            hasMixedFillColor: false
        };
    }
    return this.#engine.getSelectionStyleState();
  }

  // ... (rest of class)
}
