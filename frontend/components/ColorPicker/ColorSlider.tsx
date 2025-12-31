import React, { useRef, useState, useEffect, useCallback } from 'react';

interface ColorSliderProps {
  value: number; // 0 to max
  max: number;
  onChange: (value: number) => void;
  background: string;
  className?: string;
  checkered?: boolean; // For alpha
}

const ColorSlider: React.FC<ColorSliderProps> = ({
  value,
  max,
  onChange,
  background,
  className,
  checkered = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const { left, width } = containerRef.current.getBoundingClientRect();

      let x = (clientX - left) / width;
      x = Math.max(0, Math.min(1, x));

      onChange(Math.round(x * max));
    },
    [max, onChange],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    handleMove(e.clientX);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, handleMove]);

  const percentage = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div
      ref={containerRef}
      className={`relative h-3 w-full rounded-full cursor-pointer select-none touch-none ${className || ''}`}
      onMouseDown={onMouseDown}
      style={{ zIndex: 1 }}
    >
      {checkered && (
        <div
          className="absolute inset-0 rounded-full"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #555 25%, transparent 25%), 
              linear-gradient(-45deg, #555 25%, transparent 25%), 
              linear-gradient(45deg, transparent 75%, #555 75%), 
              linear-gradient(-45deg, transparent 75%, #555 75%)
            `,
            backgroundSize: '6px 6px',
            backgroundColor: '#333',
          }}
        />
      )}
      <div className="absolute inset-0 rounded-full" style={{ background: background }} />

      {/* Thumb */}
      <div
        className="absolute top-1/2 w-4 h-4 bg-white border-2 border-white rounded-full shadow-lg pointer-events-none"
        style={{
          left: `${percentage}%`,
          transform: 'translate(-50%, -50%)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }}
      />
    </div>
  );
};

export default ColorSlider;
