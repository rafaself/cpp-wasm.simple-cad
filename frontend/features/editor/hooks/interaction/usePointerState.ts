import { useRef, useCallback } from 'react';
import type { ViewTransform, Point } from '@/types';
import { toWorldPoint, snapToGrid } from '../../utils/interactionHelpers';

export interface PointerState {
  isDown: boolean;
  downScreenPos: Point;
  downWorldPos: Point; // Snapped if grid is on? Usually raw world pos for logic, snapped for drawing.
  currentScreenPos: Point;
  currentWorldPos: Point;
  button: number;
}

export function usePointerState(
  viewTransform: ViewTransform,
  snapOptions: { enabled: boolean; grid: boolean },
  gridSize: number
) {
  const pointerDownRef = useRef<{ x: number; y: number; world: Point } | null>(null);

  const getPointerInfo = useCallback(
    (evt: React.PointerEvent<HTMLDivElement>) => {
      const rect = (evt.currentTarget as HTMLDivElement).getBoundingClientRect();
      const screenX = evt.clientX;
      const screenY = evt.clientY;
      
      const world = toWorldPoint(screenX, screenY, viewTransform, rect.left, rect.top);
      const snapped = (snapOptions.enabled && snapOptions.grid) 
        ? snapToGrid(world, gridSize) 
        : world;
      
      return { screen: { x: screenX - rect.left, y: screenY - rect.top }, world, snapped };
    },
    [viewTransform, snapOptions, gridSize]
  );

  return {
    pointerDownRef,
    getPointerInfo
  };
}
