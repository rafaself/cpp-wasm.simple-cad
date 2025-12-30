import { useSettingsStore } from '@/stores/useSettingsStore';
import { getPickCache } from '@/utils/pickResultCache';

import { initCadEngineModule } from '../bridge/getCadEngineFactory';

import { supportsEngineResize, type EngineCapability } from './capabilities';
import { EngineCommand } from './commandBuffer';
import {
  validateProtocolOrThrow,
  type ProtocolInfo,
  type EntityId,
  type SelectionMode,
  type ReorderAction,
  type DocumentDigest,
  type EngineEvent,
  type OverlayBufferMeta,
  type EntityAabb,
  type HistoryMeta,
} from './protocol';

// Re-export types moved to wasm-types to maintain compatibility
export type {
  BufferMeta,
  TextEntityMeta,
  SnapshotBufferMeta,
  CadEngineInstance,
  WasmModule,
} from './wasm-types';

// Import subsystems
import { CommandSystem } from './runtime/CommandSystem';
import { DraftSystem } from './runtime/DraftSystem';
import { EntitySystem } from './runtime/EntitySystem';
import { EventSystem } from './runtime/EventSystem';
import { HistorySystem } from './runtime/HistorySystem';
import { LayerSystem } from './runtime/LayerSystem';
import { PickSystem } from './runtime/PickSystem';
import { RenderSystem } from './runtime/RenderSystem';
import { SelectionSystem } from './runtime/SelectionSystem';
import { SnapshotSystem } from './runtime/SnapshotSystem';
import { StatsSystem } from './runtime/StatsSystem';
import { TextSystem } from './runtime/TextSystem';
import { TransformSystem } from './runtime/TransformSystem';

import type { WasmModule, CadEngineInstance, TextEntityMeta } from './wasm-types';
import type { PickResult } from '@/types/picking';
import type {
  TextHitResult,
  TextCaretPosition,
  TextQuadBufferMeta,
  TextureBufferMeta,
} from '@/types/text';

export class EngineRuntime {
  // Subsystems
  public readonly text: TextSystem;
  public readonly pick: PickSystem;
  public readonly draft: DraftSystem;
  public readonly transform: TransformSystem;
  public readonly io: SnapshotSystem;
  public readonly render: RenderSystem;
  public readonly stats: StatsSystem;
  #engine: CadEngineInstance;
  private commandSystem: CommandSystem;
  private eventSystem: EventSystem;
  private pickSystem: PickSystem;
  private selectionSystem: SelectionSystem;
  private transformSystem: TransformSystem;
  private snapshotSystem: SnapshotSystem;
  private historySystem: HistorySystem;
  private textSystem: TextSystem;
  private layerSystem: LayerSystem;
  private entitySystem: EntitySystem;
  private draftSystem: DraftSystem;
  private renderSystem: RenderSystem;
  private statsSystem: StatsSystem;

  public readonly capabilitiesMask: number;

  public static async create(): Promise<EngineRuntime> {
    const module = await initCadEngineModule<WasmModule>();
    const engine = new module.CadEngine();

    if (typeof engine.getProtocolInfo !== 'function') {
      throw new Error(
        '[EngineRuntime] Missing getProtocolInfo() in WASM. Rebuild engine to match frontend.',
      );
    }
    const protocolInfo = engine.getProtocolInfo();
    validateProtocolOrThrow(protocolInfo);

    // Validate essential APIs presence (Fail Fast)
    const essentialMethods = [
      'pollEvents',
      'ackResync',
      'getFullSnapshotMeta',
      'allocateEntityId',
      'getSelectionOutlineMeta',
      'getSelectionHandleMeta',
      'getEntityAabb',
      'getHistoryMeta',
      'canUndo',
      'canRedo',
      'undo',
      'redo',
    ];

    for (const method of essentialMethods) {
      if (typeof (engine as any)[method] !== 'function') {
        throw new Error(
          `[EngineRuntime] Missing ${method}() in WASM. Rebuild engine to match frontend.`,
        );
      }
    }

    const runtime = new EngineRuntime(module, engine);
    runtime.applyCapabilityGuards();
    return runtime;
  }

  private constructor(
    public readonly module: WasmModule,
    engine: CadEngineInstance,
  ) {
    this.#engine = engine;
    this.capabilitiesMask = EngineRuntime.readCapabilities(engine);

    // Initialize subsystems
    this.commandSystem = new CommandSystem(module, engine);
    this.eventSystem = new EventSystem(module, engine);
    this.pickSystem = new PickSystem(module, engine);
    this.selectionSystem = new SelectionSystem(module, engine);
    this.transformSystem = new TransformSystem(module, engine);
    this.snapshotSystem = new SnapshotSystem(module, engine);
    this.historySystem = new HistorySystem(engine);
    this.textSystem = new TextSystem(module, engine);
    this.layerSystem = new LayerSystem(module, engine);
    this.entitySystem = new EntitySystem(module, engine);
    this.draftSystem = new DraftSystem(module, engine);
    this.renderSystem = new RenderSystem(engine);
    this.statsSystem = new StatsSystem(engine);

    // Public facades (typed subsystems)
    this.text = this.textSystem;
    this.pick = this.pickSystem;
    this.draft = this.draftSystem;
    this.transform = this.transformSystem;
    this.io = this.snapshotSystem;
    this.render = this.renderSystem;
    this.stats = this.statsSystem;
  }

  public resetIds(): void {
    // No-op: IDs are now fully managed by Engine (C++)
  }

  public hasCapability(capability: EngineCapability): boolean {
    return (this.capabilitiesMask & capability) !== 0;
  }

  public clear(): void {
    this.#engine.clear();
  }

  public dispose(): void {
    this.commandSystem.dispose();
    this.draftSystem.dispose();
  }

  // ========================================================================
  // Facade Methods - Delegating to Subsystems
  // ========================================================================

  // --- Command System ---
  public apply(commands: readonly EngineCommand[]): void {
    this.commandSystem.apply(commands);
  }

  // --- Draft System (hot path) ---
  public updateDraft(x: number, y: number): void {
    this.draftSystem.updateDraft(x, y);
  }

  public appendDraftPoint(x: number, y: number): void {
    this.draftSystem.appendDraftPoint(x, y);
  }

  // --- Event System ---
  public pollEvents(maxEvents: number): { generation: number; events: EngineEvent[] } {
    return this.eventSystem.pollEvents(maxEvents);
  }

  public hasPendingEvents(): boolean {
    return this.eventSystem.hasPendingEvents();
  }

  public ackResync(resyncGeneration: number): void {
    this.eventSystem.ackResync(resyncGeneration);
  }

  // --- Snapshot System ---
  public loadSnapshotBytes(bytes: Uint8Array): void {
    this.snapshotSystem.loadSnapshotBytes(bytes);
  }

  public saveSnapshotBytes(): Uint8Array {
    return this.snapshotSystem.saveSnapshotBytes();
  }

  public getFullSnapshotBytes(): Uint8Array {
    return this.snapshotSystem.getFullSnapshotBytes();
  }

  public getDocumentDigest(): DocumentDigest | null {
    return this.snapshotSystem.getDocumentDigest();
  }

  // --- History System ---
  public getHistoryMeta(): HistoryMeta {
    return this.historySystem.getHistoryMeta();
  }

  public canUndo(): boolean {
    return this.historySystem.canUndo();
  }

  public canRedo(): boolean {
    return this.historySystem.canRedo();
  }

  public undo(): void {
    this.historySystem.undo();
  }

  public redo(): void {
    this.historySystem.redo();
  }

  // --- Pick System ---
  public pickEx(x: number, y: number, tolerance: number, pickMask: number): PickResult {
    return this.pickSystem.pickEx(x, y, tolerance, pickMask);
  }

  public pickExSmart(x: number, y: number, tolerance: number, pickMask: number): PickResult {
    return this.pickSystem.pickExSmart(x, y, tolerance, pickMask);
  }

  public pickExCached(
    x: number,
    y: number,
    tolerance: number,
    pickMask: number,
    useCache: boolean = true,
  ): PickResult {
    if (!useCache) {
      return this.pickSystem.pickExSmart(x, y, tolerance, pickMask);
    }
    const cache = getPickCache(this);
    return cache.getOrCompute(x, y, tolerance, pickMask, () =>
      this.pickSystem.pickExSmart(x, y, tolerance, pickMask),
    );
  }

  public getEntityAabb(entityId: EntityId): EntityAabb {
    return this.pickSystem.getEntityAabb(entityId);
  }

  public quickBoundsCheck(x: number, y: number, tolerance: number): boolean {
    return this.pickSystem.quickBoundsCheck(x, y, tolerance);
  }

  // --- Selection System ---
  public getSelectionIds(): Uint32Array {
    return this.selectionSystem.getSelectionIds();
  }

  public clearSelection(): void {
    this.selectionSystem.clearSelection();
  }

  public setSelection(ids: EntityId[], mode: SelectionMode): void {
    this.selectionSystem.setSelection(ids, mode);
  }

  public selectByPick(pick: PickResult, modifiers: number): void {
    this.selectionSystem.selectByPick(pick, modifiers);
  }

  public marqueeSelect(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    mode: SelectionMode,
    hitMode: number,
  ): void {
    this.selectionSystem.marqueeSelect(minX, minY, maxX, maxY, mode, hitMode);
  }

  public queryMarquee(
    minX: number,
    minY: number,
    maxX: number,
    maxY: number,
    hitMode: number,
  ): number[] {
    return this.selectionSystem.queryMarquee(minX, minY, maxX, maxY, hitMode);
  }

  public getSelectionOutlineMeta(): OverlayBufferMeta {
    return this.selectionSystem.getSelectionOutlineMeta();
  }

  public getSelectionHandleMeta(): OverlayBufferMeta {
    return this.selectionSystem.getSelectionHandleMeta();
  }

  // --- Transform System ---
  public beginTransform(
    ids: EntityId[],
    mode: number,
    specificId: EntityId = 0,
    vertexIndex: number = -1,
    startX: number = 0,
    startY: number = 0,
  ): void {
    this.transformSystem.beginTransform(ids, mode, specificId, vertexIndex, startX, startY);
  }

  public updateTransform(worldX: number, worldY: number): void {
    this.transformSystem.updateTransform(worldX, worldY);
  }

  public commitTransform(): {
    ids: Uint32Array;
    opCodes: Uint8Array;
    payloads: Float32Array;
  } | null {
    return this.transformSystem.commitTransform();
  }

  public cancelTransform(): void {
    this.transformSystem.cancelTransform();
  }

  public isInteractionActive(): boolean {
    return this.transformSystem.isInteractionActive();
  }

  public setSnapOptions(enabled: boolean, gridEnabled: boolean, gridSize: number): void {
    this.transformSystem.setSnapOptions(enabled, gridEnabled, gridSize);
  }

  public getSnappedPoint(x: number, y: number): { x: number; y: number } {
    return this.transformSystem.getSnappedPoint(x, y);
  }

  // --- Render System ---
  public getPositionBufferMeta() {
    return this.renderSystem.getPositionBufferMeta();
  }

  public getLineBufferMeta() {
    return this.renderSystem.getLineBufferMeta();
  }

  public isTextQuadsDirty(): boolean {
    return this.renderSystem.isTextQuadsDirty();
  }

  public rebuildTextQuadBuffer(): void {
    this.renderSystem.rebuildTextQuadBuffer();
  }

  public getTextQuadBufferMeta() {
    return this.renderSystem.getTextQuadBufferMeta();
  }

  public getAtlasTextureMeta() {
    return this.renderSystem.getAtlasTextureMeta();
  }

  // --- Stats System ---
  public getStats() {
    return this.statsSystem.getStats();
  }

  // --- Text System ---
  public getTextContent(textId: number): string | null {
    return this.textSystem.getTextContent(textId);
  }

  public getTextEntityMeta(textId: number): TextEntityMeta | null {
    return this.textSystem.getTextEntityMeta(textId);
  }

  public getAllTextMetas(): TextEntityMeta[] {
    return this.textSystem.getAllTextMetas();
  }

  // --- Layer System ---
  public allocateLayerId(): number {
    return this.layerSystem.allocateLayerId();
  }

  public getLayersSnapshot(): import('./protocol').LayerRecord[] {
    return this.layerSystem.getLayersSnapshot();
  }

  public getLayerName(layerId: number): string {
    return this.layerSystem.getLayerName(layerId);
  }

  public setLayerProps(layerId: number, propsMask: number, flagsValue: number, name: string): void {
    this.layerSystem.setLayerProps(layerId, propsMask, flagsValue, name);
  }

  public deleteLayer(layerId: number): boolean {
    return this.layerSystem.deleteLayer(layerId);
  }

  // --- Entity System ---
  public allocateEntityId(): EntityId {
    return this.entitySystem.allocateEntityId();
  }

  public getEntityFlags(entityId: EntityId): number {
    return this.entitySystem.getEntityFlags(entityId);
  }

  public setEntityFlags(entityId: EntityId, flagsMask: number, flagsValue: number): void {
    this.entitySystem.setEntityFlags(entityId, flagsMask, flagsValue);
  }

  public setEntityLayer(entityId: EntityId, layerId: number): void {
    this.entitySystem.setEntityLayer(entityId, layerId);
  }

  public getEntityLayer(entityId: EntityId): number {
    return this.entitySystem.getEntityLayer(entityId);
  }

  public getDrawOrderSnapshot(): Uint32Array {
    return this.entitySystem.getDrawOrderSnapshot();
  }

  public reorderEntities(ids: EntityId[], action: ReorderAction, refId = 0): void {
    this.entitySystem.reorderEntities(ids, action, refId);
  }

  // --- Shared / Core Wrapper ---
  private static readCapabilities(engine: CadEngineInstance): number {
    if (typeof engine.getCapabilities === 'function') {
      return engine.getCapabilities();
    }
    if (import.meta.env.DEV) {
      console.warn('[EngineRuntime] getCapabilities not found; assuming legacy WASM.');
    }
    return 0;
  }

  private applyCapabilityGuards(): void {
    const store = useSettingsStore.getState();
    store.setEngineCapabilitiesMask(this.capabilitiesMask);

    const supportsResize = supportsEngineResize(this.capabilitiesMask);
    if (!supportsResize) {
      const wasEnabled = store.featureFlags.enableEngineResize;
      store.setEngineResizeEnabled(false);
      if (wasEnabled && import.meta.env.DEV) {
        console.warn('[EngineRuntime] Engine resize disabled: WASM lacks resize capabilities.');
      }
    }
  }
}
