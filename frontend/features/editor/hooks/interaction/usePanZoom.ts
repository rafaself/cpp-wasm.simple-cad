import { useRef, useCallback } from 'react';

import { useUIStore } from '@/stores/useUIStore';
import { screenToWorld } from '@/utils/viewportMath';
import { calculateZoomTransform } from '@/utils/zoomHelper';

import type { ViewTransform } from '@/types';

/**
 * Hook for handling pan and zoom interactions.
 * Extracts pan/zoom logic from EngineInteractionLayer for better modularity.
 */
export function usePanZoom() {
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const transformStartRef = useRef<{ x: number; y: number; scale: number } | null>(null);

  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const viewTransform = useUIStore((s) => s.viewTransform);

  const beginPan = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      isPanningRef.current = true;
      panStartRef.current = { x: evt.clientX, y: evt.clientY };
      transformStartRef.current = { ...viewTransform };
    },
    [viewTransform],
  );

  const updatePan = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      if (!isPanningRef.current || !transformStartRef.current) return;
      const dx = evt.clientX - panStartRef.current.x;
      const dy = evt.clientY - panStartRef.current.y;
      setViewTransform({
        x: transformStartRef.current.x + dx,
        y: transformStartRef.current.y + dy,
        scale: transformStartRef.current.scale,
      });
    },
    [setViewTransform],
  );

  const endPan = useCallback(() => {
    isPanningRef.current = false;
    transformStartRef.current = null;
  }, []);

  const handleWheel = useCallback(
    (evt: React.WheelEvent<HTMLDivElement>) => {
      evt.preventDefault();
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const mouse = { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
      setViewTransform((prev: ViewTransform) =>
        calculateZoomTransform(prev, mouse, evt.deltaY, screenToWorld),
      );
    },
    [setViewTransform],
  );

  return {
    isPanningRef,
    beginPan,
    updatePan,
    endPan,
    handleWheel,
  };
}
