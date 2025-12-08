import React from 'react';
import { HSV, hexToRgb, rgbToHsv } from './utils';
import { ChevronDown } from 'lucide-react';

interface SwatchesProps {
  onSelect: (hsv: HSV) => void;
  className?: string;
}

const DEFAULT_COLORS = [
  '#FFFFFF', '#94A3B8', '#64748B', '#475569', '#F8FAFC', '#000000', '#F97316', '#E2E8F0', '#1E293B',
  '#FFFFFF', '#3B82F6', '#2563EB', '#1D4ED8', '#6366F1', '#4F46E5', '#4338CA', '#F8FAFC', '#E2E8F0',
  '#F59E0B', '#3B82F6', '#6366F1', '#4F46E5', '#1E1B4B', '#000000', '#1e293b'
];

const Swatches: React.FC<SwatchesProps> = ({ onSelect, className }) => {
  
  const handleSelect = (hex: string) => {
    const rgb = hexToRgb(hex);
    if (rgb) {
        onSelect(rgbToHsv(rgb));
    }
  };

  return (
    <div className={`mt-4 border-t border-slate-700 pt-2 ${className || ''}`}>
      <div className="flex items-center justify-between mb-2 cursor-pointer hover:bg-slate-800 p-1 rounded">
        <span className="text-xs text-slate-300 font-medium ml-1">On this page</span>
        <ChevronDown size={14} className="text-slate-400" />
      </div>

      <div className="grid grid-cols-9 gap-1.5">
        {DEFAULT_COLORS.map((hex, i) => (
            <button
                key={i}
                className="w-6 h-6 rounded-md hover:scale-110 transition-transform shadow-sm border border-slate-600/50 relative overflow-hidden group"
                style={{ backgroundColor: hex }}
                onClick={() => handleSelect(hex)}
                title={hex}
            >
                {/* Checkered pattern background for transparent colors logic if we supported rgba swatches, 
                    but here we just use hex so it's opaque. */}
                {hex.toLowerCase() === '#ffffff' && (
                    <div className="absolute inset-0 border border-slate-200/50 rounded-md pointer-events-none" />
                )}
            </button>
        ))}
      </div>
    </div>
  );
};

export default Swatches;
