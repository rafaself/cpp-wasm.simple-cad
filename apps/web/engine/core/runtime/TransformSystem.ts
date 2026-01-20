import { EntityId, EntityTransform, OverlayBufferMeta } from '../protocol';
import { CadEngineInstance, WasmModule } from '../wasm-types';

import type { TransformState } from '../interactionSession';

export class TransformSystem {
  constructor(
    private readonly module: WasmModule,
    private readonly engine: CadEngineInstance,
  ) {}

  public beginTransform(
    ids: EntityId[],
    mode: number,
    specificId: EntityId,
    vertexIndex: number,
    screenX: number,
    screenY: number,
    viewX: number,
    viewY: number,
    viewScale: number,
    viewWidth: number,
    viewHeight: number,
    modifiers: number,
  ): void {
    if (!this.engine.beginTransform || !this.engine.allocBytes || !this.engine.freeBytes) {
      console.warn('WASM engine does not support beginTransform');
      return;
    }

    const ptr = this.engine.allocBytes(ids.length * 4);
    try {
      const u32 = new Uint32Array(this.module.HEAPU8.buffer, ptr, ids.length);
      u32.set(ids);
      this.engine.beginTransform(
        ptr,
        ids.length,
        mode,
        specificId,
        vertexIndex,
        screenX,
        screenY,
        viewX,
        viewY,
        viewScale,
        viewWidth,
        viewHeight,
        modifiers,
      );
    } catch (e) {
      console.error(e);
    } finally {
      this.engine.freeBytes(ptr);
    }
  }

  public updateTransform(
    screenX: number,
    screenY: number,
    viewX: number,
    viewY: number,
    viewScale: number,
    viewWidth: number,
    viewHeight: number,
    modifiers: number,
  ): void {
    this.engine.updateTransform?.(
      screenX,
      screenY,
      viewX,
      viewY,
      viewScale,
      viewWidth,
      viewHeight,
      modifiers,
    );
  }

  public cancelTransform(): void {
    this.engine.cancelTransform?.();
  }

  public isInteractionActive(): boolean {
    return !!this.engine.isInteractionActive?.();
  }

  public getTransformState(): TransformState {
    if (!this.engine.getTransformState) {
      return { active: false, mode: 0, rotationDeltaDeg: 0, pivotX: 0, pivotY: 0 };
    }
    return this.engine.getTransformState();
  }

  public setTransformLogEnabled(enabled: boolean, maxEntries = 2048, maxIds = 4096): void {
    this.engine.setTransformLogEnabled(enabled, maxEntries, maxIds);
  }

  public clearTransformLog(): void {
    this.engine.clearTransformLog();
  }

  public replayTransformLog(): boolean {
    return this.engine.replayTransformLog();
  }

  public getTransformLogMeta(): {
    entryCount: number;
    entryPtr: number;
    idCount: number;
    idPtr: number;
    overflowed: boolean;
  } {
    return {
      entryCount: this.engine.getTransformLogCount(),
      entryPtr: this.engine.getTransformLogPtr(),
      idCount: this.engine.getTransformLogIdCount(),
      idPtr: this.engine.getTransformLogIdsPtr(),
      overflowed: this.engine.isTransformLogOverflowed(),
    };
  }

  public commitTransform(): {
    ids: Uint32Array;
    opCodes: Uint8Array;
    payloads: Float32Array;
  } | null {
    if (!this.engine.commitTransform) return null;

    this.engine.commitTransform();

    const count = this.engine.getCommitResultCount?.() ?? 0;
    if (count === 0) return null;

    const idsPtr = this.engine.getCommitResultIdsPtr!();
    const opCodesPtr = this.engine.getCommitResultOpCodesPtr!();
    const payloadsPtr = this.engine.getCommitResultPayloadsPtr!();

    const idsView = new Uint32Array(this.module.HEAPU8.buffer, idsPtr, count);
    const opCodesView = new Uint8Array(this.module.HEAPU8.buffer, opCodesPtr, count);
    const payloadsView = new Float32Array(this.module.HEAPU8.buffer, payloadsPtr, count * 4);

    return {
      ids: idsView.slice(),
      opCodes: opCodesView.slice(),
      payloads: payloadsView.slice(),
    };
  }

  public setSnapOptions(
    enabled: boolean,
    gridEnabled: boolean,
    gridSize: number,
    tolerancePx: number,
    endpointEnabled: boolean,
    midpointEnabled: boolean,
    centerEnabled: boolean,
    nearestEnabled: boolean,
  ): void {
    this.engine.setSnapOptions?.(
      enabled,
      gridEnabled,
      gridSize,
      tolerancePx,
      endpointEnabled,
      midpointEnabled,
      centerEnabled,
      nearestEnabled,
    );
  }

  public getSnappedPoint(x: number, y: number): { x: number; y: number } {
    if (!this.engine.getSnappedPoint) return { x, y };
    if (this.engine.getSnappedPoint) {
      try {
        const p = this.engine.getSnappedPoint(x, y);
        return { x: p[0], y: p[1] };
      } catch (e) {
        return { x, y };
      }
    }
    return { x, y };
  }

  public getSnapOverlayMeta(): OverlayBufferMeta {
    if (!this.engine.getSnapOverlayMeta) {
      throw new Error('[EngineRuntime] getSnapOverlayMeta() missing in WASM build.');
    }
    return this.engine.getSnapOverlayMeta();
  }

  // ========================================================================
  // Entity Transform Query/Mutation (for inspector panel)
  // ========================================================================

  /**
   * Get unified transform data for an entity.
   * Returns position (center of AABB), local size, and rotation.
   * @param entityId Entity ID to query
   * @returns EntityTransform with valid=0 if entity doesn't exist
   */
  public getEntityTransform(entityId: EntityId): EntityTransform {
    if (!this.engine.getEntityTransform) {
      return { posX: 0, posY: 0, width: 0, height: 0, rotationDeg: 0, hasRotation: 0, valid: 0 };
    }
    return this.engine.getEntityTransform(entityId);
  }

  /**
   * Set entity position by specifying the new center of its AABB.
   * Creates a history entry for undo/redo.
   * @param entityId Entity ID to move
   * @param x New X coordinate (center of AABB)
   * @param y New Y coordinate (center of AABB)
   */
  public setEntityPosition(entityId: EntityId, x: number, y: number): void {
    this.engine.setEntityPosition?.(entityId, x, y);
  }

  /**
   * Set entity size (local dimensions, unrotated).
   * Creates a history entry for undo/redo.
   * Supported for: Rect, Circle, Polygon
   * @param entityId Entity ID to resize
   * @param width New width (minimum 1)
   * @param height New height (minimum 1)
   */
  public setEntitySize(entityId: EntityId, width: number, height: number): void {
    this.engine.setEntitySize?.(entityId, width, height);
  }

  /**
   * Set entity rotation in degrees.
   * Creates a history entry for undo/redo.
   * Supported for: Circle, Polygon, Text
   * No-op for entities that don't support rotation.
   * @param entityId Entity ID to rotate
   * @param rotationDeg Rotation in degrees (counterclockwise positive, normalized to -180..180)
   */
  public setEntityRotation(entityId: EntityId, rotationDeg: number): void {
    this.engine.setEntityRotation?.(entityId, rotationDeg);
  }

  /**
   * Set entity length (for Line and Arrow).
   * Creates a history entry for undo/redo.
   * The length is modified while maintaining the current angle.
   * Supported for: Line, Arrow
   * No-op for entities that don't support length.
   * @param entityId Entity ID to resize
   * @param length New length (minimum 1)
   */
  public setEntityLength(entityId: EntityId, length: number): void {
    this.engine.setEntityLength?.(entityId, length);
  }

  /**
   * Set entity scale (for flip transformations).
   * Creates a history entry for undo/redo.
   * Scale values: 1 = normal, -1 = flipped
   * Supported for: Rect, Circle, Polygon
   * No-op for entities that don't support scale.
   * @param entityId Entity ID to scale
   * @param scaleX Horizontal scale (-1 or 1)
   * @param scaleY Vertical scale (-1 or 1)
   */
  public setEntityScale(entityId: EntityId, scaleX: number, scaleY: number): void {
    this.engine.setEntityScale?.(entityId, scaleX, scaleY);
  }
}
