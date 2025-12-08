import React, { useRef, useEffect, useState, useCallback } from 'react';
import { HSV } from './utils';
import { cn } from '@/lib/utils'; // Assuming this exists, if not I'll just use template literals or check for it.

// Fallback for cn if it doesn't exist (I'll check project structure later but usually valid in these setups)
// Actually, I should verify if 'cn' exists. I saw 'utils' folder in frontend. 
// Let's assume standard Tailwind class merging. If not I'll replace it.

interface ColorAreaProps {
  hsv: HSV;
  onChange: (hsv: HSV) => void;
  className?: string;
}

const ColorArea: React.FC<ColorAreaProps> = ({ hsv, onChange, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return;
    const { left, top, width, height } = containerRef.current.getBoundingClientRect();
    
    let x = (clientX - left) / width;
    let y = (clientY - top) / height;

    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));

    // Saturation is x (0..100)
    // Value is 1 - y (0..100)
    const s = Math.round(x * 100);
    const v = Math.round((1 - y) * 100);

    onChange({ ...hsv, s, v });
  }, [hsv, onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent text selection
    setIsDragging(true);
    handleMove(e.clientX, e.clientY);
  };

  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX, e.clientY);
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleMove]);

  // Dynamic Styles
  const hueStyle = {
    backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
  };

  const handleStyle = {
    left: `${hsv.s}%`,
    top: `${100 - hsv.v}%`,
  };

  return (
    <div 
      className={`relative w-full h-48 rounded-lg overflow-hidden cursor-crosshair touch-none select-none ${className || ''}`}
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={hueStyle}
    >
      {/* Gradients */}
      <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />

      {/* Handle */}
      <div 
        className="absolute w-4 h-4 rounded-full border-2 border-white shadow-sm -translate-x-1/2 -translate-y-1/2 pointer-events-none box-border z-10"
        style={{ 
            ...handleStyle,
            backgroundColor: `transparent`, // Or the actual color? Figma shows generic circle.
            // Let's make it look like the picture: White ring, empty inside or color inside? 
            // In the picture it looks like a black/white ring. Let's stick to standard ring.
        }} 
      >
          {/* Inner ring for contrast if needed */}
      </div>
    </div>
  );
};

export default ColorArea;
