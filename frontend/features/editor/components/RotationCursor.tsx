import React from 'react';

interface RotationCursorProps {
  x: number;
  y: number;
  rotation: number;
}

export const RotationCursor: React.FC<RotationCursorProps> = ({ x, y, rotation }) => {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        transform: `translate(${x}px, ${y}px)`,
        pointerEvents: 'none',
        zIndex: 9999, // Ensure it's above everything
      }}
    >
      <img
        src="/assets/cursor-rotate.svg"
        alt=""
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'center',
          width: '24px',
          height: '24px',
          marginLeft: '-12px',
          marginTop: '-12px',
          display: 'block',
        }}
      />
    </div>
  );
};
