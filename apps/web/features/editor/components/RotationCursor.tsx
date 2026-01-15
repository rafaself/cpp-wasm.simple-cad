import React from 'react';
import { CURSOR_DIMENSIONS } from '../config/cursor-config';

interface RotationCursorProps {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Custom rotation cursor component
 *
 * Renders a custom SVG cursor positioned at the mouse location
 * with dynamic rotation to follow the rotation gesture.
 */
export const RotationCursor: React.FC<RotationCursorProps> = ({ x, y, rotation }) => {
  const { width, height, hotspotX, hotspotY } = CURSOR_DIMENSIONS.rotate;

  // Position the SVG so that the hotspot (visual center) aligns exactly with the mouse position
  // We move the SVG left by hotspotX and up by hotspotY pixels
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
        src="/assets/cursor-rotate.svg"
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
