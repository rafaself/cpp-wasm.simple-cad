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
  checkered = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const { left, width } = containerRef.current.getBoundingClientRect();
    
    let x = (clientX - left) / width;
    x = Math.max(0, Math.min(1, x));
    
    onChange(Math.round(x * max));
  }, [max, onChange]);

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    handleMove(e.clientX);
  };

  useEffect(() => {
    const onMouseUp = () => setIsDragging(false);
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) handleMove(e.clientX);
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

  const percentage = (value / max) * 100;

  return (
    <div className={`relative h-3 w-full rounded-full cursor-pointer select-none ${className || ''}`} onMouseDown={onMouseDown}>
      {checkered && (
        <div 
          className="absolute inset-0 rounded-full z-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #ccc 25%, transparent 25%), 
              linear-gradient(-45deg, #ccc 25%, transparent 25%), 
              linear-gradient(45deg, transparent 75%, #ccc 75%), 
              linear-gradient(-45deg, transparent 75%, #ccc 75%)
            `,
            backgroundSize: '8px 8px',
            backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
            backgroundColor: 'white'
          }}
        />
      )}
      <div 
        className="absolute inset-0 rounded-full z-10" 
        style={{ background: background }}
      />
      
      {/* Thumb */}
      <div 
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-slate-200 rounded-full shadow-md z-20 pointer-events-none"
        style={{ 
          left: `clamp(0px, ${percentage}%, 100%)`,
          transform: `translate(-50%, -50%)`
        }}
      />
    </div>
  );
};

export default ColorSlider;
