import React from 'react';
import { HSV, hexToRgb, rgbToHsv } from './utils';

interface SwatchesProps {
  onSelect: (hsv: HSV) => void;
  className?: string;
}

// Common colors - 2 rows with AutoCAD grays and popular colors
const COMMON_COLORS = [
  // Row 1: Grays (including AutoCAD 253, 254, 8, 9) + Black/White + Primary
  '#FFFFFF', '#FDFDFD', '#F9F9F9', '#C8C8C8', '#808080', '#404040', '#000000', '#FF0000', '#00FF00',
  // Row 2: Blues, Cyan, Yellow, Orange, Magenta, Purple
  '#0000FF', '#00FFFF', '#FFFF00', '#FF8000', '#FF00FF', '#8000FF', '#0080FF', '#00FF80', '#FF0080',
];

const Swatches: React.FC<SwatchesProps> = ({ onSelect, className }) => {
  
  const handleSelect = (hex: string) => {
    const rgb = hexToRgb(hex);
    if (rgb) {
        onSelect(rgbToHsv(rgb));
    }
  };

  return (
    <div className={`mt-3 border-t border-slate-600/50 pt-3 ${className || ''}`}>
      <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide mb-2 block">Cores Comuns</span>

      <div className="grid grid-cols-9 gap-1.5">
        {COMMON_COLORS.map((hex, i) => (
            <button
                key={i}
                className="w-6 h-6 rounded hover:scale-110 transition-transform shadow-sm border border-slate-600/50 relative overflow-hidden"
                style={{ backgroundColor: hex }}
                onClick={() => handleSelect(hex)}
                title={hex}
            >
                {/* Border for white colors */}
                {(hex === '#FFFFFF' || hex === '#FDFDFD' || hex === '#F9F9F9') && (
                    <div className="absolute inset-0 border border-slate-400/30 rounded pointer-events-none" />
                )}
            </button>
        ))}
      </div>
    </div>
  );
};

export default Swatches;
