import React from 'react';
import { CURSOR_DIMENSIONS } from '../config/cursor-config';

interface ResizeCursorProps {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Custom resize cursor component
 *
 * Renders a custom SVG cursor positioned at the mouse location
 * with dynamic rotation to indicate the resize direction.
 *
 * Similar to RotationCursor but uses the resize SVG asset.
 */
export const ResizeCursor: React.FC<ResizeCursorProps> = ({ x, y, rotation }) => {
  const { width, height, hotspotX, hotspotY } = CURSOR_DIMENSIONS.resize;

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
        src="/assets/cursor-resize.svg"
        alt=""
        style={{
          transform: `translate(${-hotspotX}px, ${-hotspotY}px) rotate(${rotation}deg)`,
          transformOrigin: `${hotspotX}px ${hotspotY}px`,
          width: `${width}px`,
          height: `${height}px`,
          display: 'block',
        }}
      />
    </div>
  );
};
