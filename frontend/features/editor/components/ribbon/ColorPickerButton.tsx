import { Link, Unlock, Slash, HelpCircle } from 'lucide-react';
import React, { useRef, useState } from 'react';

import { StyleSource } from '@/engine/core/protocol';
import { useClickOutside } from '@/features/editor/hooks/useClickOutside';

// Simple Color Picker Popover (Placeholder for now, or minimal impl)
// We will use a simple list of preset colors for MVP.

interface ColorPickerProps {
  color: { r: number; g: number; b: number; a: number };
  onChange: (r: number, g: number, b: number, a: number) => void;
  onClose: () => void;
  showTransparentToggle?: boolean;
  onTransparentToggle?: () => void;
  isTransparent?: boolean;
}

const PRESET_COLORS = [
  { r: 0, g: 0, b: 0, a: 1, name: 'Preto' },
  { r: 1, g: 0, b: 0, a: 1, name: 'Vermelho' },
  { r: 0, g: 1, b: 0, a: 1, name: 'Verde' },
  { r: 0, g: 0, b: 1, a: 1, name: 'Azul' },
  { r: 1, g: 1, b: 0, a: 1, name: 'Amarelo' },
  { r: 0, g: 1, b: 1, a: 1, name: 'Ciano' },
  { r: 1, g: 0, b: 1, a: 1, name: 'Magenta' },
  { r: 1, g: 1, b: 1, a: 1, name: 'Branco' },
];

const ColorPickerPopover: React.FC<ColorPickerProps> = ({ onChange, onClose, showTransparentToggle, onTransparentToggle, isTransparent }) => {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  return (
    <div ref={ref} className="absolute top-full left-0 mt-1 p-2 bg-surface-strong border border-border rounded shadow-lg z-50 w-48">
      <div className="grid grid-cols-4 gap-2">
        {PRESET_COLORS.map((c, i) => (
          <button
            key={i}
            className="w-8 h-8 rounded-sm border border-border hover:scale-110 transition-transform"
            style={{ backgroundColor: `rgba(${c.r*255}, ${c.g*255}, ${c.b*255}, ${c.a})` }}
            onClick={() => {
              onChange(c.r, c.g, c.b, c.a);
              onClose();
            }}
            title={c.name}
          />
        ))}
      </div>
      {showTransparentToggle && (
        <button
          className={`mt-2 w-full px-2 py-1 text-xs border rounded flex items-center justify-center gap-2 ${isTransparent ? 'bg-primary text-white border-primary' : 'bg-surface2 text-text border-border'}`}
          onClick={() => {
            onTransparentToggle?.();
            onClose();
          }}
        >
          <Slash size={12} />
          Sem preenchimento
        </button>
      )}
    </div>
  );
};

interface ColorPickerButtonProps {
  label: string;
  source: StyleSource;
  r: number;
  g: number;
  b: number;
  a: number;
  hasMixedColor: boolean;
  onChange: (r: number, g: number, b: number, a: number) => void;
  onSetNone?: () => void;
  canBeNone?: boolean;
}

export const ColorPickerButton: React.FC<ColorPickerButtonProps> = ({
  label,
  source,
  r,
  g,
  b,
  a,
  hasMixedColor,
  onChange,
  onSetNone,
  canBeNone
}) => {
  const [isOpen, setIsOpen] = useState(false);

  let icon = null;
  let tooltip = "";

  // Resolve State Icon & Tooltip
  if (hasMixedColor) {
      icon = <HelpCircle size={14} className="text-text-muted" />;
      tooltip = "Múltiplos valores";
  } else {
      switch (source) {
          case StyleSource.ByLayer:
              icon = <Link size={14} className="text-text-muted" />;
              tooltip = "Cor herdada da camada";
              break;
          case StyleSource.Override:
              icon = <Unlock size={14} className="text-primary" />;
              tooltip = "Cor personalizada do elemento";
              break;
          case StyleSource.None:
              icon = <Slash size={14} className="text-danger" />;
              tooltip = "Sem preenchimento";
              break;
      }
  }

  const bgStyle = (source === StyleSource.None || hasMixedColor)
    ? {}
    : { backgroundColor: `rgba(${r*255}, ${g*255}, ${b*255}, ${a})` };

  return (
    <div className="relative flex flex-col items-center gap-1">
      <span className="text-[10px] text-text-muted uppercase tracking-wider">{label}</span>
      <button
        className="w-12 h-8 rounded border border-border flex items-center justify-center bg-surface1 hover:bg-surface2 focus-outline relative overflow-hidden"
        onClick={() => setIsOpen(!isOpen)}
        title={tooltip}
      >
        {/* Color Swatch Background */}
        {!hasMixedColor && source !== StyleSource.None && (
            <div className="absolute inset-0 opacity-50" style={bgStyle} />
        )}

        {/* Icon Overlay */}
        <div className="relative z-10 drop-shadow-md">
            {icon}
        </div>
      </button>

      {isOpen && (
        <ColorPickerPopover
            color={{r,g,b,a}}
            onChange={onChange}
            onClose={() => setIsOpen(false)}
            showTransparentToggle={canBeNone}
            onTransparentToggle={onSetNone}
            isTransparent={source === StyleSource.None}
        />
      )}
    </div>
  );
};
