import { useEffect, useRef, useState, useCallback } from 'react';

import { getEngineRuntime } from '@/engine/core/singleton';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { cadDebugLog } from '@/utils/dev/cadDebug';
import { screenToWorld } from '@/utils/viewportMath';

import { DraftingHandler } from './handlers/DraftingHandler';
import { IdleHandler } from './handlers/IdleHandler';
import { PanHandler } from './handlers/PanHandler';
import { SelectionHandler } from './handlers/SelectionHandler';
import { TextHandler } from './handlers/TextHandler';
import { InteractionHandler, InputEventContext, EngineRuntime } from './types';

export function useInteractionManager() {
  const activeTool = useUIStore((s) => s.activeTool);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const canvasSize = useUIStore((s) => s.canvasSize);
  const toolDefaults = useSettingsStore((s) => s.toolDefaults);

  // Runtime Ref
  const runtimeRef = useRef<EngineRuntime | null>(null);
  useEffect(() => {
    getEngineRuntime().then((rt) => {
      runtimeRef.current = rt;
    });
  }, []);

  // Current Handler
  const handlerRef = useRef<InteractionHandler>(new IdleHandler());
  // We use a dummy state to force re-render when handler wants to update UI
  const [, setTick] = useState(0);

  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  // Global Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for input focus (optional, but handlers usually handle this check or we do it globally)
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      // Special Case: Allow TextHandler to receive keys even if Proxy is focused?
      // Actually TextHandler uses Proxy, so Proxy receives keys.
      // But for other tools, we want to ignore if UI input is focused.
      // Unless it's Escape?

      if (isInput && e.key !== 'Escape') return;

      cadDebugLog('tool', 'keydown', () => ({
        key: e.key,
        code: e.code,
        target: (e.target as HTMLElement | null)?.tagName ?? null,
      }));
      handlerRef.current.onKeyDown?.(e);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      cadDebugLog('tool', 'keyup', () => ({ key: e.key, code: e.code }));
      handlerRef.current.onKeyUp?.(e);
    };

    const handleBlur = () => {
      cadDebugLog('tool', 'window-blur');
      handlerRef.current.onBlur?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Switch Handler on Tool Change (Simplified)
  useEffect(() => {
    const prev = handlerRef.current;
    if (prev.onLeave) prev.onLeave();

    let next: InteractionHandler;
    switch (activeTool) {
      case 'select':
        next = new SelectionHandler();
        break;
      case 'pan':
        next = new PanHandler();
        break;
      case 'line':
      case 'rect':
      case 'circle':
      case 'polygon': // Polygon/Polyline logic is inside DraftingHandler
      case 'polyline':
      case 'arrow':
        next = new DraftingHandler(activeTool, toolDefaults);
        break;
      case 'text':
        next = new TextHandler();
        break;
      default:
        next = new IdleHandler();
        break;
    }

    cadDebugLog('tool', 'tool-switch', () => ({
      tool: activeTool,
      from: prev.name,
      to: next.name,
    }));

    // Bind Update Listener
    if (next.setOnUpdate) {
      next.setOnUpdate(forceUpdate);
    }

    if (next.onEnter) next.onEnter();
    handlerRef.current = next;
    forceUpdate();
  }, [activeTool, toolDefaults, forceUpdate]);

  // Input Pipeline Helper
  const buildContext = (e: React.PointerEvent): InputEventContext => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = e.clientX;
    const clientY = e.clientY;
    const world = screenToWorld({ x: clientX - rect.left, y: clientY - rect.top }, viewTransform);

    // Snapping Logic (if Runtime available)
    let snapped = { x: world.x, y: world.y };
    if (runtimeRef.current && runtimeRef.current.getSnappedPoint) {
      snapped = runtimeRef.current.getSnappedPoint(world.x, world.y);
    }

    return {
      event: e,
      worldPoint: world,
      snappedPoint: snapped,
      runtime: runtimeRef.current,
      viewTransform,
      canvasSize,
    };
  };

  // Event Delegates
  const onPointerDown = (e: React.PointerEvent) => {
    const ctx = buildContext(e);
    const result = handlerRef.current.onPointerDown(ctx);
    if (result) {
      const prevName = handlerRef.current.name;
      cadDebugLog('tool', 'handler-transition', () => ({
        from: prevName,
        to: result.name,
        reason: 'pointerdown',
      }));
      if (handlerRef.current.onLeave) handlerRef.current.onLeave();
      handlerRef.current = result;
      if (result.setOnUpdate) result.setOnUpdate(forceUpdate);
      if (result.onEnter) result.onEnter();
      forceUpdate();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const ctx = buildContext(e);
    handlerRef.current.onPointerMove(ctx);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const ctx = buildContext(e);
    const result = handlerRef.current.onPointerUp(ctx);
    if (result) {
      const prevName = handlerRef.current.name;
      cadDebugLog('tool', 'handler-transition', () => ({
        from: prevName,
        to: result.name,
        reason: 'pointerup',
      }));
      if (handlerRef.current.onLeave) handlerRef.current.onLeave();
      handlerRef.current = result;
      if (result.setOnUpdate) result.setOnUpdate(forceUpdate);
      if (result.onEnter) result.onEnter();
      forceUpdate();
    }
  };

  const onDoubleClick = (e: React.PointerEvent) => {
    if (handlerRef.current.onDoubleClick) {
      const ctx = buildContext(e);
      handlerRef.current.onDoubleClick(ctx);
    }
  };

  // Render Overlay
  const overlay = handlerRef.current.renderOverlay ? handlerRef.current.renderOverlay() : null;

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onDoubleClick,
    },
    overlay,
    activeHandlerName: handlerRef.current.name,
    cursor: handlerRef.current.getCursor ? handlerRef.current.getCursor() : null,
  };
}
