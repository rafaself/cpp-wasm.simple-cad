import { useCallback } from 'react';
import type { Point, ViewTransform } from '@/types';
import { HIT_TOLERANCE } from '@/config/constants';
import { TransformMode } from '@/engine/core/interactionSession';
import { SelectionMode, SelectionModifier, type EntityId } from '@/engine/core/protocol';
import { PickSubTarget } from '@/types/picking';
import type { DragMode } from './useEngineSession';

type Runtime = Awaited<ReturnType<typeof import('@/engine/core/singleton').getEngineRuntime>>;

export interface SelectToolHandlerDeps {
  runtime: Runtime | null;
  viewTransform: ViewTransform;
  engineResizeEnabled: boolean;
  dragRef: React.MutableRefObject<DragMode>;
  marqueeArmedRef: React.MutableRefObject<boolean>;
  beginEngineSession: (
    ids: EntityId[],
    mode: TransformMode,
    specificId: EntityId,
    vertexIndex: number,
    startX: number,
    startY: number
  ) => boolean;
  setSelectionBox: (box: null) => void;
  setCursorOverride: (cursor: string | null) => void;
  setEngineSelection: (ids: EntityId[], mode: SelectionMode) => EntityId[];
  readSelectionIds: () => EntityId[];
  selectHandlePointerDown: (evt: React.PointerEvent, world: Point) => void;
  selectHandlePointerMove: (evt: React.PointerEvent, down: { x: number; y: number; world: Point }, snapped: Point) => void;
  selectHandlePointerUp: (evt: React.PointerEvent, down: { x: number; y: number; world: Point } | null) => void;
  clearEngineSelection: () => EntityId[];
  cursor: string;
}

export interface SelectToolHandlerReturn {
  handleSelectPointerDown: (evt: React.PointerEvent, world: Point, snapped: Point) => boolean;
  handleSelectPointerMove: (world: Point, snapped: Point, down: { x: number; y: number; world: Point } | null) => boolean;
  handleSelectPointerUp: (evt: React.PointerEvent, down: { x: number; y: number; world: Point } | null, clickNoDrag: boolean) => void;
}

/**
 * Extracts select tool pointer handling logic from EngineInteractionLayer.
 * Returns handlers that return `true` if the event was handled.
 */
export function useSelectToolHandler(deps: SelectToolHandlerDeps): SelectToolHandlerReturn {
  const {
    runtime,
    viewTransform,
    engineResizeEnabled,
    dragRef,
    marqueeArmedRef,
    beginEngineSession,
    setSelectionBox,
    setCursorOverride,
    setEngineSelection,
    readSelectionIds,
    selectHandlePointerDown,
    selectHandlePointerMove,
    selectHandlePointerUp,
    clearEngineSelection,
    cursor,
  } = deps;

  const selectionModifiersFromEvent = (evt: React.PointerEvent): number =>
    (evt.shiftKey ? SelectionModifier.Shift : 0) |
    (evt.ctrlKey ? SelectionModifier.Ctrl : 0) |
    (evt.metaKey ? SelectionModifier.Meta : 0);

  const handleSelectPointerDown = useCallback(
    (evt: React.PointerEvent, world: Point, snapped: Point): boolean => {
      setSelectionBox(null);
      marqueeArmedRef.current = false;

      if (!runtime) {
        marqueeArmedRef.current = true;
        selectHandlePointerDown(evt, world);
        return true;
      }

      const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
      const pickMask = engineResizeEnabled ? 15 : 7;
      const res = runtime.pickEx(world.x, world.y, tolerance, pickMask);

      if (res.id !== 0 && res.subTarget !== PickSubTarget.None) {
        const entityId = res.id;
        const modifiers = selectionModifiersFromEvent(evt);
        runtime.selectByPick(res, modifiers);
        const activeIds = readSelectionIds();

        // Resize Handle
        if (engineResizeEnabled && res.subTarget === PickSubTarget.ResizeHandle && res.subIndex >= 0) {
          setEngineSelection([entityId], SelectionMode.Replace);
          setCursorOverride(cursor);
          if (beginEngineSession([entityId], TransformMode.Resize, entityId, res.subIndex, snapped.x, snapped.y)) {
            dragRef.current = { type: 'engine_session', startWorld: snapped, vertexIndex: res.subIndex, activeId: entityId };
            return true;
          }
        }

        // Vertex Drag
        if (res.subTarget === PickSubTarget.Vertex && res.subIndex >= 0) {
          setEngineSelection([entityId], SelectionMode.Replace);
          setCursorOverride('move');
          if (beginEngineSession([entityId], TransformMode.VertexDrag, entityId, res.subIndex, snapped.x, snapped.y)) {
            dragRef.current = { type: 'engine_session', startWorld: snapped, vertexIndex: res.subIndex, activeId: entityId };
            return true;
          }
        } else if (res.subTarget === PickSubTarget.Edge || res.subTarget === PickSubTarget.Body || res.subTarget === PickSubTarget.TextBody) {
          // Move
          if (activeIds.length > 0) {
            setCursorOverride('move');
            if (beginEngineSession(activeIds, TransformMode.Move, 0, -1, snapped.x, snapped.y)) {
              dragRef.current = { type: 'engine_session', startWorld: snapped };
              return true;
            }
          }
        }
      } else if (res.id !== 0 && res.subTarget === PickSubTarget.None) {
        // Legacy fallback
        const modifiers = selectionModifiersFromEvent(evt);
        runtime.selectByPick?.(res, modifiers);
        const activeIds = readSelectionIds();
        if (activeIds.length > 0) {
          setCursorOverride('move');
          if (beginEngineSession(activeIds, TransformMode.Move, 0, -1, snapped.x, snapped.y)) {
            dragRef.current = { type: 'engine_session', startWorld: snapped };
            return true;
          }
        }
      }

      // Miss → marquee selection
      marqueeArmedRef.current = true;
      selectHandlePointerDown(evt, world);
      return true;
    },
    [
      runtime, viewTransform, engineResizeEnabled, dragRef, marqueeArmedRef,
      beginEngineSession, setSelectionBox, setCursorOverride, setEngineSelection,
      readSelectionIds, selectHandlePointerDown, cursor,
    ]
  );

  const handleSelectPointerMove = useCallback(
    (world: Point, snapped: Point, down: { x: number; y: number; world: Point } | null): boolean => {
      if (!down) {
        // Hover logic
        if (!runtime) {
          setCursorOverride(null);
          return true;
        }
        const tolerance = HIT_TOLERANCE / (viewTransform.scale || 1);
        const pickMask = engineResizeEnabled ? 15 : 3;
        const res = runtime.pickEx(world.x, world.y, tolerance, pickMask);
        if (res.id !== 0) {
          if (engineResizeEnabled && res.subTarget === PickSubTarget.ResizeHandle) {
            const cursor = res.subIndex === 0 || res.subIndex === 2 ? 'nesw-resize' : 'nwse-resize';
            setCursorOverride(cursor);
            return true;
          }
          setCursorOverride('move');
          return true;
        }
        setCursorOverride(null);
        return true;
      }

      selectHandlePointerMove({} as React.PointerEvent, down, snapped);
      return true;
    },
    [runtime, viewTransform, engineResizeEnabled, setCursorOverride, selectHandlePointerMove]
  );

  const handleSelectPointerUp = useCallback(
    (evt: React.PointerEvent, down: { x: number; y: number; world: Point } | null, clickNoDrag: boolean): void => {
      selectHandlePointerUp(evt, down);
      if (clickNoDrag && marqueeArmedRef.current) {
        clearEngineSelection();
      }
      marqueeArmedRef.current = false;
    },
    [selectHandlePointerUp, clearEngineSelection, marqueeArmedRef]
  );

  return {
    handleSelectPointerDown,
    handleSelectPointerMove,
    handleSelectPointerUp,
  };
}
