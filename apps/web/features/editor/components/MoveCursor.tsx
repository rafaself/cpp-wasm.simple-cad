import React from 'react';

import { CURSOR_DIMENSIONS } from '../config/cursor-config';

interface MoveCursorProps {
  x: number;
  y: number;
}

/**
 * Custom move cursor component
 *
 * Renders a custom SVG cursor positioned at the mouse location.
 * Unlike resize/rotate cursors, this is static (no rotation).
 *
 * Used when hovering over or dragging selected entities.
 */
export const MoveCursor: React.FC<MoveCursorProps> = ({ x, y }) => {
  const { width, height, hotspotX, hotspotY } = CURSOR_DIMENSIONS.move;

  // Position the SVG so that the hotspot (visual center) aligns exactly with the mouse position
  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        pointerEvents: 'none',
        zIndex: 9999,
        willChange: 'transform',
      }}
    >
      <img
        src="/assets/cursor-move.svg"
        alt=""
        style={{
          transform: `translate(${-hotspotX}px, ${-hotspotY}px)`,
          width: `${width}px`,
          height: `${height}px`,
          display: 'block',
        }}
      />
    </div>
  );
};
