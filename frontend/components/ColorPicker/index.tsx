import React, { useState, useEffect } from 'react';
import { X, Plus, Pipette, Box, Grid, Monitor, Image as ImageIcon, Play, Droplet, Moon } from 'lucide-react';
import { HSV, hexToRgb, rgbToHsv, hsvToRgb, rgbToHex } from './utils';
import ColorArea from './ColorArea';
import ColorSlider from './ColorSlider';
import ColorInputs from './ColorInputs';
import Swatches from './Swatches';

interface ColorPickerProps {
  color?: string; // Hex
  onChange?: (color: string) => void;
  onClose?: () => void;
  className?: string;
}

const ColorPicker: React.FC<ColorPickerProps> = ({ 
  color = '#FFFFFF', 
  onChange, 
  onClose,
  className 
}) => {
  const [hsv, setHsv] = useState<HSV>({ h: 0, s: 0, v: 100, a: 1 });

  // Init from prop
  useEffect(() => {
    const rgb = hexToRgb(color);
    if (rgb) {
      setHsv(rgbToHsv(rgb));
    }
  }, [color]);

  const handleHsvChange = (newHsv: HSV) => {
    setHsv(newHsv);
    if (onChange) {
      const rgb = hsvToRgb(newHsv);
      onChange(rgbToHex(rgb));
    }
  };

  const handleDragHue = (h: number) => handleHsvChange({ ...hsv, h });
  const handleDragAlpha = (a: number) => handleHsvChange({ ...hsv, a: a / 100 });

  return (
    <div className={`w-[260px] bg-[#1E1E1E] rounded-xl shadow-2xl border border-slate-700/50 flex flex-col font-sans select-none overflow-hidden ${className || ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
        <div className="flex gap-4">
          <button className="text-xs font-semibold text-white bg-slate-700/50 px-2 py-1 rounded">Custom</button>
          <button className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">Libraries</button>
        </div>
        <div className="flex gap-2 text-slate-400">
          <Plus size={16} className="hover:text-white cursor-pointer" />
          <X size={16} className="hover:text-white cursor-pointer" onClick={onClose} />
        </div>
      </div>

      {/* Tool Icons (Visual mock based on screenshot) */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50 text-slate-400">
        <div className="flex gap-3">
             <Box size={14} className="hover:text-white cursor-pointer" />
             <Grid size={14} className="hover:text-white cursor-pointer" />
             <Monitor size={14} className="hover:text-white cursor-pointer" />
             <ImageIcon size={14} className="hover:text-white cursor-pointer" />
             <Play size={14} className="hover:text-white cursor-pointer" />
        </div>
        <div className="flex gap-3 border-l border-slate-700 pl-3">
             <Droplet size={14} className="hover:text-white cursor-pointer" />
             <Moon size={14} className="hover:text-white cursor-pointer" />
        </div>
      </div>

      {/* Main Content */}
      <div className="p-3">
        
        <ColorArea hsv={hsv} onChange={handleHsvChange} className="mb-3" />

        <div className="flex items-center gap-3 mb-3">
            {/* Eyedropper */}
            <button className="text-slate-400 hover:text-white transition-colors" title="Pick Color">
                <Pipette size={16} />
            </button>

            {/* Sliders */}
            <div className="flex-grow flex flex-col gap-2">
                <ColorSlider 
                    value={hsv.h} 
                    max={360} 
                    onChange={handleDragHue} 
                    background="linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)"
                />
                 <ColorSlider 
                    value={hsv.a * 100} 
                    max={100} 
                    onChange={handleDragAlpha} 
                    checkered
                    background={`linear-gradient(to right, transparent, hsl(${hsv.h}, 100%, 50%))`}
                />
            </div>
            
            {/* Current Color Indicator (Circle) */}
             <div className="w-6 h-6 rounded-full border border-slate-600 shadow-sm relative overflow-hidden shrink-0">
                 {/* Checkered bg for alpha preview */}
                 <div className="absolute inset-0 z-0 opacity-50"
                      style={{
                        backgroundImage: `linear-gradient(45deg, #999 25%, transparent 25%), linear-gradient(-45deg, #999 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #999 75%), linear-gradient(-45deg, transparent 75%, #999 75%)`,
                        backgroundSize: '8px 8px'
                      }} 
                 />
                 <div className="absolute inset-0 z-10" style={{ backgroundColor: rgbToHex(hsvToRgb(hsv)), opacity: hsv.a }} />
             </div>
        </div>

        <ColorInputs hsv={hsv} onChange={handleHsvChange} />
        
        <Swatches onSelect={handleHsvChange} />

      </div>
    </div>
  );
};

export default ColorPicker;
