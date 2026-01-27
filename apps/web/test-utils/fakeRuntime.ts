import { CommandOp, type EngineCommand } from '@/engine/core/commandTypes';
import { TransformMode, type TransformState } from '@/engine/core/interactionSession';
import { SelectionMode, type EntityTransform } from '@/engine/core/protocol';

import { FakeEventBus } from './fakeEventBus';

import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';
import type { Point, ViewTransform } from '@/types';

type VectorLike = { size(): number; get(index: number): number; delete(): void };

const makeVector = (values: number[]): VectorLike => ({
  size: () => values.length,
  get: (index: number) => values[index] ?? 0,
  delete: () => undefined,
});

type MarqueeCall = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mode: SelectionMode;
  hitMode: number;
};

export class FakeRuntime {
  commands: EngineCommand[] = [];
  pickResult: PickResult = {
    id: 0,
    kind: 0,
    subIndex: 0,
    distance: 0,
    subTarget: 0,
    hitX: 0,
    hitY: 0,
  };
  lastPickArgs: Array<{ x: number; y: number; tolerance: number; mask: number }> = [];
  selection = new Set<number>();
  marqueeReturnIds: number[] = [];
  marqueeCalls: MarqueeCall[] = [];
  clearSelectionCalls = 0;
  transformSessions = {
    begun: 0,
    updates: 0,
    committed: 0,
    cancelled: 0,
    lastBegin: null as null | {
      ids: number[];
      mode: TransformMode;
      specificId: number;
      subIndex: number;
      start: { x: number; y: number };
    },
    lastUpdate: null as null | { x: number; y: number },
  };
  undoCount = 0;
  redoCount = 0;
  savedSnapshot: Uint8Array | null = null;
  loadedSnapshot: Uint8Array | null = null;
  eventBus = new FakeEventBus();
  snappedPoint: { x: number; y: number } | null = null;
  textEntities = new Set<number>();
  applyCallCount = 0;
  draftUpdateCalls = 0;
  appendDraftPointCalls = 0;
  generation = 0;
  text = {
    getTextBounds: (_id: number) => ({
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      valid: false,
    }),
  };

  viewport = {
    screenToWorldWithTransform: (point: Point, transform: ViewTransform): Point => ({
      x: (point.x - transform.x) / transform.scale,
      y: -(point.y - transform.y) / transform.scale,
    }),
    screenToWorldWithTransformInto: (
      point: Point,
      transform: ViewTransform,
      out: Point,
    ): Point => {
      out.x = (point.x - transform.x) / transform.scale;
      out.y = -(point.y - transform.y) / transform.scale;
      return out;
    },
    worldToScreenWithTransform: (point: Point, transform: ViewTransform): Point => ({
      x: point.x * transform.scale + transform.x,
      y: -point.y * transform.scale + transform.y,
    }),
    getPickingToleranceWithTransform: (
      transform: ViewTransform,
      screenTolerancePx: number = 10,
    ): number => {
      return screenTolerancePx / transform.scale;
    },
    getSnapTolerance: (screenTolerancePx: number = 8): number => {
      return screenTolerancePx;
    },
    screenToWorldDistance: (screenDistance: number): number => {
      return screenDistance;
    },
    worldToScreenDistance: (worldDistance: number): number => {
      return worldDistance;
    },
    isWithinTolerance: (
      point: Point,
      target: Point,
      screenTolerancePx: number = 10,
    ): boolean => {
      const dx = point.x - target.x;
      const dy = point.y - target.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= screenTolerancePx;
    },
  };

  engine = {
    queryMarquee: (_x1: number, _y1: number, _x2: number, _y2: number, _hitMode: number) => {
      const vec = makeVector(this.marqueeReturnIds);
      return vec;
    },
    getTextContentMeta: (id: number) => {
      const exists = this.textEntities.has(id);
      return { exists, ptr: 0, byteCount: 0 };
    },
  };

  addTextEntity(id: number): void {
    this.textEntities.add(id);
  }

  getTextEntityMeta(id: number) {
    if (!this.textEntities.has(id)) return null;
    return { id, boxMode: 0, constraintWidth: 0, rotation: 0 };
  }

  setPickResult(result: Partial<PickResult>): void {
    this.pickResult = { ...this.pickResult, ...result };
  }

  setMarqueeReturn(ids: number[]): void {
    this.marqueeReturnIds = [...ids];
  }

  apply(commands: readonly EngineCommand[]): void {
    this.applyCallCount += 1;
    this.commands.push(...commands);
    this.generation += 1;
  }

  pickExSmart(x: number, y: number, tolerance: number, pickMask: number): PickResult {
    this.lastPickArgs.push({ x, y, tolerance, mask: pickMask });
    return { ...this.pickResult };
  }

  pickSideHandle(_x: number, _y: number, _tolerance: number): PickResult {
    return { id: 0, kind: PickEntityKind.Unknown, subTarget: PickSubTarget.None, subIndex: -1, distance: Infinity };
  }

  getSelectionIds(): number[] {
    return Array.from(this.selection);
  }

  setSelection(ids: readonly number[], mode: SelectionMode): void {
    if (mode === SelectionMode.Replace) {
      this.selection = new Set(ids);
    } else if (mode === SelectionMode.Add) {
      for (const id of ids) this.selection.add(id);
    } else if (mode === SelectionMode.Remove) {
      for (const id of ids) this.selection.delete(id);
    } else if (mode === SelectionMode.Toggle) {
      for (const id of ids) {
        if (this.selection.has(id)) this.selection.delete(id);
        else this.selection.add(id);
      }
    }
  }

  clearSelection(): void {
    this.selection.clear();
    this.clearSelectionCalls += 1;
  }

  beginTransform(
    ids: readonly number[],
    mode: TransformMode,
    specificId: number,
    subIndex: number,
    screenX: number,
    screenY: number,
    _viewX: number,
    _viewY: number,
    _viewScale: number,
    _viewWidth: number,
    _viewHeight: number,
    _modifiers: number,
  ): void {
    this.transformSessions.begun += 1;
    this.transformSessions.lastBegin = {
      ids: Array.from(ids),
      mode,
      specificId,
      subIndex,
      start: { x: screenX, y: screenY },
    };
  }

  updateTransform(
    x: number,
    y: number,
    _viewX: number,
    _viewY: number,
    _viewScale: number,
    _viewWidth: number,
    _viewHeight: number,
    _modifiers: number,
  ): void {
    this.transformSessions.updates += 1;
    this.transformSessions.lastUpdate = { x, y };
  }

  commitTransform(): void {
    this.transformSessions.committed += 1;
  }

  cancelTransform(): void {
    this.transformSessions.cancelled += 1;
  }

  marqueeSelect(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    mode: SelectionMode,
    hitMode: number,
  ): void {
    this.marqueeCalls.push({ x1, y1, x2, y2, mode, hitMode });
    this.setSelection(this.marqueeReturnIds, mode);
  }

  updateDraft(x: number, y: number, _modifiers: number): void {
    this.draftUpdateCalls += 1;
    // Simulate lightweight path; no command enqueue
    this.transformSessions.lastUpdate = { x, y };
  }

  appendDraftPoint(x: number, y: number, modifiers: number): void {
    this.appendDraftPointCalls += 1;
    // Mirror command push for visibility
    this.commands.push({
      op: CommandOp.AppendDraftPoint,
      pos: { x, y, modifiers },
    } as EngineCommand);
  }

  getSnappedPoint(x: number, y: number): { x: number; y: number } {
    return this.snappedPoint ?? { x, y };
  }

  clear(): void {
    this.commands = [];
    this.selection.clear();
    this.generation += 1;
  }

  getStats() {
    return {
      generation: this.generation,
      rectCount: 0,
      lineCount: 0,
      polylineCount: 0,
      pointCount: 0,
      triangleVertexCount: 0,
      lineVertexCount: 0,
      rebuildAllGeometryCount: 0,
      lastLoadMs: 0,
      lastRebuildMs: 0,
      lastApplyMs: 0,
      lastTransformUpdateMs: 0,
      lastSnapCandidateCount: 0,
      lastSnapHitCount: 0,
    };
  }

  saveSnapshotBytes(): Uint8Array {
    // Deterministic snapshot that carries command count for assertions
    this.savedSnapshot = new Uint8Array([this.commands.length]);
    return this.savedSnapshot;
  }

  loadSnapshotBytes(bytes: Uint8Array): void {
    this.loadedSnapshot = bytes;
  }

  undo(): void {
    this.undoCount += 1;
  }

  redo(): void {
    this.redoCount += 1;
  }

  subscribe(event: string, listener: (payload: unknown) => void): () => void {
    return this.eventBus.subscribe(event, listener);
  }

  getEntityTransform(entityId: number): EntityTransform {
    return {
      posX: 0,
      posY: 0,
      width: 100,
      height: 100,
      rotationDeg: 0,
      hasRotation: 0,
      valid: 1,
    };
  }

  getSelectionBounds(): { minX: number; minY: number; maxX: number; maxY: number; valid: number } {
    return {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
      valid: 1,
    };
  }

  getOrientedHandleMeta(): {
    generation: number;
    entityId: number;
    blX: number;
    blY: number;
    brX: number;
    brY: number;
    trX: number;
    trY: number;
    tlX: number;
    tlY: number;
    southX: number;
    southY: number;
    eastX: number;
    eastY: number;
    northX: number;
    northY: number;
    westX: number;
    westY: number;
    rotateHandleX: number;
    rotateHandleY: number;
    centerX: number;
    centerY: number;
    rotationRad: number;
    hasRotateHandle: number;
    hasResizeHandles: number;
    hasSideHandles: number;
    selectionCount: number;
    isGroup: number;
    valid: number;
  } {
    // Return invalid by default - tests can override if needed
    return {
      generation: this.generation,
      entityId: 0,
      blX: 0,
      blY: 0,
      brX: 100,
      brY: 0,
      trX: 100,
      trY: 100,
      tlX: 0,
      tlY: 100,
      southX: 50,
      southY: 0,
      eastX: 100,
      eastY: 50,
      northX: 50,
      northY: 100,
      westX: 0,
      westY: 50,
      rotateHandleX: 50,
      rotateHandleY: 125,
      centerX: 50,
      centerY: 50,
      rotationRad: 0,
      hasRotateHandle: 1,
      hasResizeHandles: 1,
      hasSideHandles: 1,
      selectionCount: 1,
      isGroup: 0,
      valid: 0, // Invalid by default
    };
  }

  getTransformState(): TransformState {
    return {
      active: false,
      mode: 0,
      rotationDeltaDeg: 0,
      pivotX: 0,
      pivotY: 0,
    };
  }
}
