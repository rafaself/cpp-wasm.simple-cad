import { CommandOp } from '@/engine/core/commandBuffer';
import { TransformMode } from '@/engine/core/interactionSession';
import { SelectionMode } from '@/engine/core/protocol';

import { FakeEventBus } from './fakeEventBus';

import type { EngineCommand } from '@/engine/core/commandBuffer';
import type { PickResult } from '@/types/picking';

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
    startX: number,
    startY: number,
  ): void {
    this.transformSessions.begun += 1;
    this.transformSessions.lastBegin = {
      ids: Array.from(ids),
      mode,
      specificId,
      subIndex,
      start: { x: startX, y: startY },
    };
  }

  updateTransform(x: number, y: number): void {
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

  updateDraft(x: number, y: number): void {
    this.draftUpdateCalls += 1;
    // Simulate lightweight path; no command enqueue
    this.transformSessions.lastUpdate = { x, y };
  }

  appendDraftPoint(x: number, y: number): void {
    this.appendDraftPointCalls += 1;
    // Mirror command push for visibility
    this.commands.push({ op: CommandOp.AppendDraftPoint, pos: { x, y } } as EngineCommand);
  }

  getSnappedPoint(x: number, y: number): { x: number; y: number } {
    return this.snappedPoint ?? { x, y };
  }

  clear(): void {
    this.commands = [];
    this.selection.clear();
    this.generation += 1;
  }

  getStats(): { generation: number } {
    return { generation: this.generation };
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

  emit(event: string, payload: unknown): void {
    this.eventBus.emit(event, payload);
  }
}
