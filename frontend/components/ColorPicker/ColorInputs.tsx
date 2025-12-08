import React, { useState, useEffect } from 'react';
import { HSV, hsvToRgb, rgbToHex, hexToRgb, rgbToHsv, RGB } from './utils';
import { ChevronDown } from 'lucide-react';

interface ColorInputsProps {
  hsv: HSV;
  onChange: (hsv: HSV) => void;
}

type ColorMode = 'hex' | 'rgb';

const ColorInputs: React.FC<ColorInputsProps> = ({ hsv, onChange }) => {
  const [mode, setMode] = useState<ColorMode>('hex');
  const [hexValue, setHexValue] = useState('');
  const [rgbValues, setRgbValues] = useState({ r: '0', g: '0', b: '0' });
  const [alphaValue, setAlphaValue] = useState('100');
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Sync from HSV prop
  useEffect(() => {
    const rgb = hsvToRgb(hsv);
    const hex = rgbToHex(rgb);
    setHexValue(hex);
    setRgbValues({ 
      r: rgb.r.toString(), 
      g: rgb.g.toString(), 
      b: rgb.b.toString() 
    });
    setAlphaValue(Math.round(hsv.a * 100).toString());
  }, [hsv]);

  // HEX handlers
  const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
    setHexValue(val);
    
    if (val.length === 6) {
      const rgb = hexToRgb(val);
      if (rgb) {
        const newHsv = rgbToHsv({ ...rgb, a: hsv.a });
        onChange(newHsv);
      }
    }
  };

  const handleHexBlur = () => {
    const rgb = hsvToRgb(hsv);
    setHexValue(rgbToHex(rgb));
  };

  // RGB handlers
  const handleRgbChange = (channel: 'r' | 'g' | 'b', value: string) => {
    const numVal = value.replace(/[^0-9]/g, '');
    setRgbValues(prev => ({ ...prev, [channel]: numVal }));
    
    const num = parseInt(numVal, 10);
    if (!isNaN(num)) {
      const clamped = Math.max(0, Math.min(255, num));
      const currentRgb = hsvToRgb(hsv);
      const newRgb: RGB = { 
        ...currentRgb, 
        [channel]: clamped 
      };
      const newHsv = rgbToHsv(newRgb);
      onChange(newHsv);
    }
  };

  const handleRgbBlur = (channel: 'r' | 'g' | 'b') => {
    const rgb = hsvToRgb(hsv);
    setRgbValues({ 
      r: rgb.r.toString(), 
      g: rgb.g.toString(), 
      b: rgb.b.toString() 
    });
  };

  // Alpha handler
  const handleAlphaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
    setAlphaValue(val);

    const intVal = parseInt(val, 10);
    if (!isNaN(intVal)) {
      const clamped = Math.max(0, Math.min(100, intVal));
      onChange({ ...hsv, a: clamped / 100 });
    }
  };

  const handleAlphaBlur = () => {
    setAlphaValue(Math.round(hsv.a * 100).toString());
  };

  const inputClass = "w-full bg-transparent border-none outline-none text-slate-200 text-xs py-1.5 font-mono";

  return (
    <div className="flex gap-2 items-center">
      {/* Mode Select Dropdown */}
      <div className="relative">
        <div 
          className="flex items-center gap-1 bg-[#3D3D3D] text-slate-300 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-[#4D4D4D] transition-colors border border-slate-600/50 shrink-0"
          onClick={() => setShowModeDropdown(!showModeDropdown)}
        >
          <span className="font-medium uppercase">{mode}</span>
          <ChevronDown size={12} />
        </div>
        
        {showModeDropdown && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowModeDropdown(false)} />
            <div className="absolute top-full left-0 mt-1 bg-[#3D3D3D] border border-slate-600/50 rounded shadow-lg z-20 overflow-hidden">
              <div 
                className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-[#4D4D4D] ${mode === 'hex' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                onClick={() => { setMode('hex'); setShowModeDropdown(false); }}
              >
                HEX
              </div>
              <div 
                className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-[#4D4D4D] ${mode === 'rgb' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                onClick={() => { setMode('rgb'); setShowModeDropdown(false); }}
              >
                RGB
              </div>
            </div>
          </>
        )}
      </div>

      {/* Color Values Input */}
      {mode === 'hex' ? (
        <div className="flex-grow bg-[#3D3D3D] rounded border border-slate-600/50 flex items-center px-2">
           <input 
              type="text" 
              value={hexValue}
              onChange={handleHexChange}
              onBlur={handleHexBlur}
              className={`${inputClass} uppercase`}
              placeholder="000000"
           />
        </div>
      ) : (
        <div className="flex-grow flex gap-1">
          <div className="flex-1 bg-[#3D3D3D] rounded border border-slate-600/50 flex items-center px-1.5">
            <span className="text-slate-500 text-[10px] mr-1">R</span>
            <input 
              type="text" 
              value={rgbValues.r}
              onChange={(e) => handleRgbChange('r', e.target.value)}
              onBlur={() => handleRgbBlur('r')}
              className={`${inputClass} text-center`}
              maxLength={3}
            />
          </div>
          <div className="flex-1 bg-[#3D3D3D] rounded border border-slate-600/50 flex items-center px-1.5">
            <span className="text-slate-500 text-[10px] mr-1">G</span>
            <input 
              type="text" 
              value={rgbValues.g}
              onChange={(e) => handleRgbChange('g', e.target.value)}
              onBlur={() => handleRgbBlur('g')}
              className={`${inputClass} text-center`}
              maxLength={3}
            />
          </div>
          <div className="flex-1 bg-[#3D3D3D] rounded border border-slate-600/50 flex items-center px-1.5">
            <span className="text-slate-500 text-[10px] mr-1">B</span>
            <input 
              type="text" 
              value={rgbValues.b}
              onChange={(e) => handleRgbChange('b', e.target.value)}
              onBlur={() => handleRgbBlur('b')}
              className={`${inputClass} text-center`}
              maxLength={3}
            />
          </div>
        </div>
      )}

      {/* Alpha/Opacity Input */}
      <div className="w-14 bg-[#3D3D3D] rounded border border-slate-600/50 flex items-center px-2 shrink-0">
         <input 
            type="text" 
            value={alphaValue}
            onChange={handleAlphaChange}
            onBlur={handleAlphaBlur}
            className={`${inputClass} text-right`}
            maxLength={3}
         />
         <span className="text-slate-400 text-xs ml-0.5">%</span>
      </div>
    </div>
  );
};

export default ColorInputs;
