import type { ReactNode } from 'react';

import { CommandOp, EntityKind } from '@/engine/core/EngineRuntime';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import { BaseInteractionHandler } from '../BaseInteractionHandler';
import { InputEventContext, InteractionHandler, EngineRuntime } from '../types';
import { buildDraftStyle, clampPolygonSides, getArrowHeadSize, type ToolDefaults } from './drafting/draftStyle';
import { DraftingSessionController } from './drafting/DraftingSessionController';
import { PolygonModalController } from './drafting/PolygonModalController';

export class DraftingHandler extends BaseInteractionHandler {
  name = 'drafting';

  private activeTool: string;
  private toolDefaults: ToolDefaults;

  // Polygon Modal State
  private polygonModal: PolygonModalController;
  private sessionController: DraftingSessionController;

  private getActiveTool = (): string => this.activeTool;
  private getToolDefaults = (): ToolDefaults => this.toolDefaults;
  private setToolSelect = (): void => {
    useUIStore.getState().setTool('select');
  };
  private isPolygonModalOpen = (): boolean => this.polygonModal.isOpen();
  private openPolygonModal = (world: { x: number; y: number }, screen: { x: number; y: number }) => {
    this.polygonModal.openAt(world, screen);
  };

  constructor(activeTool: string, toolDefaults: ToolDefaults) {
    super();
    this.activeTool = activeTool;
    this.toolDefaults = toolDefaults;
    this.polygonModal = new PolygonModalController(
      () => this.notifyChange(),
      clampPolygonSides(toolDefaults.polygonSides ?? 3),
    );
    this.sessionController = new DraftingSessionController({
      getActiveTool: this.getActiveTool,
      getToolDefaults: this.getToolDefaults,
      syncToolDefaults: () => this.syncToolDefaults(),
      isPolygonModalOpen: this.isPolygonModalOpen,
      openPolygonModal: this.openPolygonModal,
      setToolSelect: this.setToolSelect,
    });
  }

  getCursor(): string {
    return 'crosshair';
  }

  private syncToolDefaults(): void {
    const defaults = useSettingsStore.getState().toolDefaults;
    this.toolDefaults = defaults;
    this.polygonModal.syncSides(clampPolygonSides(defaults.polygonSides ?? 3));
  }

  onPointerDown(ctx: InputEventContext): InteractionHandler | void {
    this.sessionController.onPointerDown(ctx);
  }

  onPointerMove(ctx: InputEventContext): void {
    this.sessionController.onPointerMove(ctx);
  }

  onPointerUp(ctx: InputEventContext): InteractionHandler | void {
    this.sessionController.onPointerUp(ctx);
  }

  onCancel(): void {
    this.sessionController.onCancel();
  }

  cancelDraft(runtime: EngineRuntime): void {
    this.sessionController.cancelWithRuntime(runtime);
  }

  onLeave(): void {
    this.sessionController.onLeave();
    cadDebugLog('draft', 'leave');
  }

  onKeyDown(e: KeyboardEvent): void {
    this.sessionController.onKeyDown(e);
  }

  // --- Modal Logic ---

  private commitDefaultPolygon(runtime: any) {
    const center = this.polygonModal.getCenter();
    if (!runtime || !center) return;
    this.syncToolDefaults();
    const sides = this.polygonModal.getSides();
    const r = 50;

    const style = buildDraftStyle(this.toolDefaults);
    runtime.apply([
      {
        op: CommandOp.BeginDraft,
        draft: {
          kind: EntityKind.Polygon,
          x: center.x - r,
          y: center.y - r,
          sides,
          head: 0,
          ...style,
        },
      },
      { op: CommandOp.UpdateDraft, pos: { x: center.x + r, y: center.y + r, modifiers: 0 } },
      { op: CommandOp.CommitDraft },
    ]);
    cadDebugLog('draft', 'polygon-commit', () => ({ x: center.x, y: center.y, sides }));

    this.polygonModal.close();
    useUIStore.getState().setTool('select');
  }

  // --- Polygon Modal Callbacks ---

  private handlePolygonConfirm = (sides: number) => {
    this.polygonModal.setSides(sides);
    // Persist to global toolDefaults for future polygons
    useSettingsStore.getState().setPolygonSides(sides);
    // Commit the polygon
    const runtime = this.sessionController.getRuntime();
    if (runtime) {
      this.commitDefaultPolygon(runtime);
    }
  };

  private handlePolygonCancel = () => {
    this.polygonModal.close();
    cadDebugLog('draft', 'polygon-modal-cancel');
  };

  // --- Render Overlay (Phase 1: inline numeric input) ---

  renderOverlay(): ReactNode {
    return this.polygonModal.render(this.handlePolygonConfirm, this.handlePolygonCancel);
  }
}
