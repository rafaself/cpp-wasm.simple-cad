import { useCallback, useRef } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import type { EntityId } from '@/engine/core/protocol';
import type { TransformMode } from '@/engine/core/interactionSession';
import type { Point } from '@/types';

/**
 * Internal drag mode state for engine-first interaction.
 */
export type DragMode =
  | { type: 'none' }
  | { type: 'engine_session'; startWorld: Point; vertexIndex?: number; activeId?: EntityId };

export interface EngineSessionDeps {
  runtime: Awaited<ReturnType<typeof import('@/engine/core/singleton').getEngineRuntime>> | null;
  layerRef: React.RefObject<HTMLDivElement | null>;
  capturedPointerIdRef: React.MutableRefObject<number | null>;
  pointerDownRef: React.MutableRefObject<{ x: number; y: number; world: Point } | null>;
  setSelectionBox: (box: null) => void;
  setCursorOverride: (cursor: string | null) => void;
}

export interface UseEngineSessionReturn {
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
  cancelActiveEngineSession: (reason: string) => boolean;
  commitEngineSession: () => void;
  isEngineSessionActive: () => boolean;
}

/**
 * Hook to manage engine transform sessions (move, resize, vertex drag).
 * Centralizes drag state and session lifecycle.
 */
export function useEngineSession(deps: EngineSessionDeps): UseEngineSessionReturn {
  const {
    runtime,
    layerRef,
    capturedPointerIdRef,
    pointerDownRef,
    setSelectionBox,
    setCursorOverride,
  } = deps;

  const setEngineInteractionActive = useUIStore((s) => s.setEngineInteractionActive);
  const setInteractionDragActive = useUIStore((s) => s.setInteractionDragActive);

  const dragRef = useRef<DragMode>({ type: 'none' });
  const marqueeArmedRef = useRef(false);

  const beginEngineSession = useCallback(
    (
      ids: EntityId[],
      mode: TransformMode,
      specificId: EntityId,
      vertexIndex: number,
      startX: number,
      startY: number
    ): boolean => {
      if (!runtime) return false;
      if (typeof runtime.engine?.beginTransform !== 'function') return false;

      setEngineInteractionActive(true);
      runtime.beginTransform(ids, mode, specificId, vertexIndex, startX, startY);
      return true;
    },
    [runtime, setEngineInteractionActive]
  );

  const cancelActiveEngineSession = useCallback(
    (reason: string): boolean => {
      const interactionActive =
        !!runtime?.isInteractionActive?.() || dragRef.current.type === 'engine_session';
      if (!interactionActive) return false;

      if (import.meta.env.DEV && localStorage.getItem('DEV_TRACE_INTERACTION') === '1') {
        console.log(`[useEngineSession] cancelActiveEngineSession reason=${reason}`);
      }

      runtime?.cancelTransform?.();

      // Best-effort: release pointer capture if we still hold it.
      try {
        const el = layerRef.current;
        const pid = capturedPointerIdRef.current;
        if (el && pid !== null) {
          el.releasePointerCapture(pid);
        }
      } catch {
        // ignore
      }

      capturedPointerIdRef.current = null;
      pointerDownRef.current = null;
      dragRef.current = { type: 'none' };
      marqueeArmedRef.current = false;
      setSelectionBox(null);
      setCursorOverride(null);
      setEngineInteractionActive(false);
      setInteractionDragActive(false);
      return true;
    },
    [
      runtime,
      layerRef,
      capturedPointerIdRef,
      pointerDownRef,
      setSelectionBox,
      setCursorOverride,
      setEngineInteractionActive,
      setInteractionDragActive,
    ]
  );

  const commitEngineSession = useCallback(() => {
    if (dragRef.current.type === 'engine_session') {
      runtime?.commitTransform();
      dragRef.current = { type: 'none' };
      pointerDownRef.current = null;
      setEngineInteractionActive(false);
    }
  }, [runtime, pointerDownRef, setEngineInteractionActive]);

  const isEngineSessionActive = useCallback(() => {
    return dragRef.current.type === 'engine_session';
  }, []);

  return {
    dragRef,
    marqueeArmedRef,
    beginEngineSession,
    cancelActiveEngineSession,
    commitEngineSession,
    isEngineSessionActive,
  };
}
