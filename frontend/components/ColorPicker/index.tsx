import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { X, Pipette, GripHorizontal } from 'lucide-react';
import { HSV, hexToRgb, rgbToHsv, hsvToRgb, rgbToHex } from './utils';
import ColorArea from './ColorArea';
import ColorSlider from './ColorSlider';
import ColorInputs from './ColorInputs';
import Swatches from './Swatches';
import { LABELS } from '@/i18n/labels';

interface ColorPickerProps {
  color?: string; // Hex
  onChange?: (color: string) => void;
  onClose?: () => void;
  className?: string;
  initialPosition?: { top: number; left: number };
}

const ColorPicker: React.FC<ColorPickerProps> = ({ 
  color = '#FFFFFF', 
  onChange, 
  onClose,
  className,
  initialPosition
}) => {
  // Initialize HSV from the prop color
  const [hsv, setHsv] = useState<HSV>(() => {
    const rgb = hexToRgb(color);
    if (rgb) {
      return rgbToHsv(rgb);
    }
    return { h: 0, s: 0, v: 100, a: 1 };
  });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isPositioned, setIsPositioned] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Calculate initial position clamped to viewport
  useEffect(() => {
    if (!containerRef.current || isPositioned) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const padding = 10;

    // Start from initial position or center of screen
    let x = initialPosition?.left ?? (viewportWidth - rect.width) / 2;
    let y = initialPosition?.top ?? (viewportHeight - rect.height) / 2;

    // Clamp to viewport
    x = Math.max(padding, Math.min(x, viewportWidth - rect.width - padding));
    y = Math.max(padding, Math.min(y, viewportHeight - rect.height - padding));

    setPosition({ x, y });
    setIsPositioned(true);
  }, [initialPosition, isPositioned]);

  // Track internal changes to avoid re-syncing and losing hue
  const isInternalChange = useRef(false);
  const lastExternalColor = useRef(color);

  // Init color from prop - only when it's an external change
  useEffect(() => {
    // Skip if this is an internal change (we already have the correct HSV)
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    
    // Only sync if color actually changed from external source
    if (color !== lastExternalColor.current) {
      lastExternalColor.current = color;
      const rgb = hexToRgb(color);
      if (rgb) {
        const newHsv = rgbToHsv(rgb);
        // Preserve hue if new color is black or grayscale (where hue is undefined)
        if (newHsv.v === 0 || newHsv.s === 0) {
          setHsv(prev => ({ ...newHsv, h: prev.h }));
        } else {
          setHsv(newHsv);
        }
      }
    }
  }, [color]);


  const handleHsvChange = (newHsv: HSV) => {
    setHsv(newHsv);
    if (onChange) {
      isInternalChange.current = true;
      const rgb = hsvToRgb(newHsv);
      // Return rgba if alpha < 1, otherwise hex
      if (rgb.a < 1) {
        onChange(`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${rgb.a.toFixed(2)})`);
      } else {
        onChange(`#${rgbToHex(rgb)}`);
      }
    }
  };

  const handleDragHue = (h: number) => handleHsvChange({ ...hsv, h });
  const handleDragAlpha = (a: number) => handleHsvChange({ ...hsv, a: a / 100 });

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    setIsDragging(true);
    
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 10;

      let newX = e.clientX - dragOffset.current.x;
      let newY = e.clientY - dragOffset.current.y;

      // Clamp to viewport
      newX = Math.max(padding, Math.min(newX, viewportWidth - rect.width - padding));
      newY = Math.max(padding, Math.min(newY, viewportHeight - rect.height - padding));

      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const currentColorHex = `#${rgbToHex(hsvToRgb(hsv))}`;

  const pickerContent = (
    <div 
      ref={containerRef}
      className={`w-[300px] bg-[#2D2D2D] rounded-lg shadow-2xl border border-slate-600/50 flex flex-col font-sans select-none overflow-hidden ${className || ''}`}
      style={{
        position: 'fixed',
        left: isPositioned ? position.x : -9999,
        top: isPositioned ? position.y : -9999,
        zIndex: 2147483647
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header with Title */}
      <div 
        className={`flex items-center justify-between px-3 py-2 border-b border-slate-600/50 bg-[#252525] ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={14} className="text-slate-500" />
          <span className="text-xs font-medium text-slate-300">{LABELS.colorPicker.title}</span>
        </div>
        <X 
          size={16} 
          className="text-slate-400 hover:text-white cursor-pointer transition-colors" 
          onClick={onClose} 
          onMouseDown={(e) => e.stopPropagation()} 
        />
      </div>

      {/* Main Content */}
      <div className="p-3">
        
        <ColorArea hsv={hsv} onChange={handleHsvChange} className="mb-3 rounded-md" />

        {/* Row 1: Eyedropper + Hue Slider + Color Preview */}
        <div className="flex items-center gap-3 mb-2">
            {/* Eyedropper */}
            <button className="text-slate-400 hover:text-white transition-colors shrink-0" title={LABELS.colorPicker.eyedropper}>
                <Pipette size={16} />
            </button>

            {/* Hue Slider */}
            <div className="flex-grow">
                <ColorSlider 
                    value={hsv.h} 
                    max={360} 
                    onChange={handleDragHue} 
                    background="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
                />
            </div>
            
            {/* Current Color Indicator (Circle) */}
            <div 
              className="w-7 h-7 rounded-full border-2 border-slate-500 shadow-sm relative overflow-hidden shrink-0"
              style={{ backgroundColor: currentColorHex }}
              title={currentColorHex}
            >
              {hsv.a < 1 && (
                <div className="absolute inset-0 -z-10"
                    style={{
                      backgroundImage: `linear-gradient(45deg, #666 25%, transparent 25%), linear-gradient(-45deg, #666 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #666 75%), linear-gradient(-45deg, transparent 75%, #666 75%)`,
                      backgroundSize: '6px 6px'
                    }} 
                />
              )}
            </div>
        </div>

        {/* Row 2: Alpha Slider (full width under hue) */}
        <div className="flex items-center gap-3 mb-3">
            <div className="w-4 shrink-0" />
            <div className="flex-grow">
                <ColorSlider 
                    value={Math.round(hsv.a * 100)} 
                    max={100} 
                    onChange={handleDragAlpha} 
                    checkered
                    background={`linear-gradient(to right, transparent, ${currentColorHex})`}
                />
            </div>
            <div className="w-7 shrink-0" />
        </div>

        <ColorInputs hsv={hsv} onChange={handleHsvChange} />
        
        <Swatches onSelect={handleHsvChange} />

      </div>
    </div>
  );

  // Render using Portal to escape any stacking context
  return ReactDOM.createPortal(pickerContent, document.body);
};

export default ColorPicker;
