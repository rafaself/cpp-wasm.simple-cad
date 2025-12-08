import React, { useRef, useEffect, useState, useCallback } from 'react';
import { HSV } from './utils';

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

    // Preserve the current hue - only change S and V
    onChange({ h: hsv.h, s, v, a: hsv.a });
  }, [hsv.h, hsv.a, onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    handleMove(e.clientX, e.clientY);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleMove]);

  // Dynamic Styles
  const hueStyle = {
    backgroundColor: `hsl(${hsv.h}, 100%, 50%)`,
  };

  return (
    <div 
      className={`relative w-full h-44 rounded-lg overflow-hidden cursor-crosshair touch-none select-none ${className || ''}`}
      ref={containerRef}
      onMouseDown={onMouseDown}
      style={hueStyle}
    >
      {/* Saturation gradient (white to transparent) */}
      <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
      {/* Value gradient (transparent to black) */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black" />

      {/* Handle/Selector */}
      <div 
        className="absolute w-4 h-4 rounded-full border-2 border-white pointer-events-none"
        style={{ 
          left: `${hsv.s}%`,
          top: `${100 - hsv.v}%`,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.3)'
        }} 
      />
    </div>
  );
};

export default ColorArea;
