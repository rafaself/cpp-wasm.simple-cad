import React, { useState, useEffect } from 'react';
import { HSV, hsvToRgb, rgbToHex, hexToRgb, rgbToHsv } from './utils';
import { ChevronDown } from 'lucide-react';

interface ColorInputsProps {
  hsv: HSV;
  onChange: (hsv: HSV) => void;
}

const ColorInputs: React.FC<ColorInputsProps> = ({ hsv, onChange }) => {
  const [hexValue, setHexValue] = useState('');
  const [alphaValue, setAlphaValue] = useState('');

  // Sync internal state with props when props change (and not editing? No, just sync on blur or effect)
  // Actually, we want 2-way binding but allow typing without jumpiness.
  
  useEffect(() => {
    // When hsv changes from outside (drag), update inputs if not focused?
    // Simplified: Just update always for now, might annoy if typing fast but standard for these inputs.
    // Better: Helper to convert HSV to Hex string
    const rgb = hsvToRgb(hsv);
    const hex = rgbToHex(rgb);
    setHexValue(hex);
    setAlphaValue(Math.round(hsv.a * 100).toString());
  }, [hsv]);

  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHexValue(val);
    
    // Attempt parse
    const rgb = hexToRgb(val);
    if (rgb) {
        const newHsv = rgbToHsv({ ...rgb, a: hsv.a }); // Keep alpha
        onChange(newHsv);
    }
  };

  const handleAlphaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    // Allow numbers only
    if (!/^\d*$/.test(val)) return;
    
    setAlphaValue(val);

    const intVal = parseInt(val, 10);
    if (!isNaN(intVal)) {
        const clammped = Math.max(0, Math.min(100, intVal));
        onChange({ ...hsv, a: clammped / 100 });
    }
  };

  const handleAlphaBlur = () => {
     // Force valid format on blur
     setAlphaValue(Math.round(hsv.a * 100).toString());
  };

  const handleHexBlur = () => {
    const rgb = hsvToRgb(hsv);
    setHexValue(rgbToHex(rgb));
  }; 

  return (
    <div className="flex gap-2 items-center mt-3">
      {/* Mode Select (Visual only for now, hardcoded to Hex) */}
      <div className="flex items-center gap-1 bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs cursor-pointer hover:bg-slate-700 transition-colors border border-slate-700">
        <span>Hex</span>
        <ChevronDown size={12} />
      </div>

      {/* Hex Input */}
      <div className="flex-grow bg-slate-800 rounded border border-slate-700 flex items-center px-2">
         <span className="text-slate-500 text-xs select-none">#</span>
         <input 
            type="text" 
            value={hexValue}
            onChange={handleHexChange}
            onBlur={handleHexBlur}
            className="w-full bg-transparent border-none outline-none text-slate-200 text-xs py-1.5 px-1 uppercase font-mono"
         />
      </div>

      {/* Alpha Input */}
      <div className="w-16 bg-slate-800 rounded border border-slate-700 flex items-center px-2">
         <input 
            type="text" 
            value={alphaValue}
            onChange={handleAlphaChange}
            onBlur={handleAlphaBlur}
            className="w-full bg-transparent border-none outline-none text-slate-200 text-xs py-1.5 text-right font-mono"
         />
         <span className="text-slate-500 text-xs select-none ml-1">%</span>
      </div>
    </div>
  );
};

export default ColorInputs;
