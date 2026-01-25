import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { getEngineRuntime } from '@/engine/core/singleton';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { InteractionCore } from './interactionCore';

type PointerRect = { left: number; top: number };

export function useInteractionManager(pointerRectRef: MutableRefObject<PointerRect>) {
  const activeTool = useUIStore((s) => s.activeTool);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const toolDefaults = useSettingsStore((s) => s.toolDefaults);
  const [, setTick] = useState(0);
  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  const coreRef = useRef<InteractionCore | null>(null);
  if (!coreRef.current) {
    coreRef.current = new InteractionCore(pointerRectRef, viewTransform, canvasSize, toolDefaults);
  }

  useEffect(() => {
    getEngineRuntime().then((rt) => {
      coreRef.current?.setRuntime(rt);
    });
  }, []);

  useEffect(() => {
    coreRef.current?.setOnUpdate(forceUpdate);
  }, [forceUpdate]);

  useEffect(() => {
    coreRef.current?.setViewTransform(viewTransform);
  }, [viewTransform]);

  useEffect(() => {
    coreRef.current?.setCanvasSize(canvasSize);
  }, [canvasSize]);

  useEffect(() => {
    coreRef.current?.setToolDefaults(toolDefaults);
  }, [toolDefaults]);

  useEffect(() => {
    coreRef.current?.setActiveTool(activeTool);
  }, [activeTool]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    const handleKeyDown = (e: KeyboardEvent) => core.handleKeyDown(e);
    const handleKeyUp = (e: KeyboardEvent) => core.handleKeyUp(e);
    const handleBlur = () => core.handleBlur();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => coreRef.current?.handlePointerDown(e),
    [],
  );
  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => coreRef.current?.handlePointerMove(e),
    [],
  );
  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => coreRef.current?.handlePointerUp(e),
    [],
  );
  const onDoubleClick = useCallback(
    (e: ReactPointerEvent) => coreRef.current?.handleDoubleClick(e),
    [],
  );

  const overlay = coreRef.current?.getOverlay() ?? null;

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
      onCancel: () => coreRef.current?.handleCancel(),
    },
    overlay,
    activeHandlerName: coreRef.current?.getActiveHandlerName() ?? 'idle',
    cursor: coreRef.current?.getCursor() ?? null,
  };
}
