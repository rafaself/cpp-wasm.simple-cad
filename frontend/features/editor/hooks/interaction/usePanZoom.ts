import { useRef, useCallback } from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { calculateZoomTransform } from '@/utils/zoomHelper';
import { screenToWorld } from '@/utils/geometry';
import type { ViewTransform } from '@/types';

export function usePanZoom() {
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformStartRef = useRef<{ x: number; y: number; scale: number } | null>(null);

  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const viewTransform = useUIStore((s) => s.viewTransform);

  const beginPan = useCallback((evt: React.PointerEvent<HTMLDivElement>) => {
    isPanningRef.current = true;
    panStartRef.current = { x: evt.clientX, y: evt.clientY };
    transformStartRef.current = { ...viewTransform };
  }, [viewTransform]);

  const updatePan = useCallback((evt: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanningRef.current || !transformStartRef.current) return;
    const dx = evt.clientX - panStartRef.current.x;
    const dy = evt.clientY - panStartRef.current.y;
    setViewTransform({
      x: transformStartRef.current.x + dx,
      y: transformStartRef.current.y + dy,
      scale: transformStartRef.current.scale,
    });
  }, [setViewTransform]);

  const endPan = useCallback(() => {
    isPanningRef.current = false;
    transformStartRef.current = null;
  }, []);

  const handleWheel = useCallback((evt: React.WheelEvent<HTMLDivElement>) => {
    evt.preventDefault();
    const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
    const mouse = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
    // Use setState callback to ensure fresh state if needed, but calculateZoomTransform takes prev.
    // Here we use the store setter which might accept a callback or value.
    // The original code used: setViewTransform((prev) => ...);
    setViewTransform((prev: ViewTransform) => calculateZoomTransform(prev, mouse, evt.deltaY, screenToWorld));
  }, [setViewTransform]);

  return {
    isPanningRef,
    beginPan,
    updatePan,
    endPan,
    handleWheel
  };
}
