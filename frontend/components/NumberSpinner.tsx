import { ChevronUp, ChevronDown } from 'lucide-react';
import React, { useState, useEffect } from 'react';

interface NumberSpinnerProps {
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  className?: string;
  suffix?: string;
  autoFocus?: boolean;
  onBlur?: () => void;
}

const NumberSpinner: React.FC<NumberSpinnerProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  className,
  suffix,
  autoFocus,
  onBlur,
}) => {
  const [tempValue, setTempValue] = useState(value.toString());
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) setTempValue(value.toString());
  }, [value, isFocused]);

  const handleCommit = () => {
    let val = parseFloat(tempValue);
    if (isNaN(val)) val = value;
    val = Math.max(min, Math.min(val, max));
    onChange(val);
    setTempValue(val.toString());
    onBlur?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommit();
      (e.target as HTMLElement).blur();
    }
  };

  const increment = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(Math.min(value + step, max));
  };

  const decrement = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(Math.max(value - step, min));
  };

  return (
    <div
      className={`flex items-center bg-slate-800/60 border ${isFocused ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-slate-700/50'} rounded ${className || 'w-[60px]'} relative overflow-hidden transition-all group`}
    >
      <input
        type="text"
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={() => {
          setIsFocused(false);
          handleCommit();
        }}
        onFocus={() => setIsFocused(true)}
        onKeyDown={handleKeyDown}
        autoFocus={autoFocus}
        className="w-full h-full bg-transparent text-[10px] text-center text-slate-200 font-mono focus:outline-none px-1 pl-2"
      />
      {label && (
        <span className="absolute right-5 pointer-events-none text-[8px] text-slate-500 pt-0.5">
          {label}
        </span>
      )}
      {suffix && !isFocused && (
        <span className="absolute right-5 pointer-events-none text-[10px] text-slate-300 pt-0.5">
          {suffix}
        </span>
      )}

      <div className="flex flex-col h-full border-l border-slate-700/50 w-4 bg-slate-800/80 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={increment}
          className="flex-1 flex items-center justify-center hover:bg-slate-700 active:bg-blue-600/50 text-slate-400 hover:text-white transition-colors border-b border-slate-700/50"
          tabIndex={-1}
        >
          <ChevronUp size={8} strokeWidth={3} />
        </button>
        <button
          onClick={decrement}
          className="flex-1 flex items-center justify-center hover:bg-slate-700 active:bg-blue-600/50 text-slate-400 hover:text-white transition-colors"
          tabIndex={-1}
        >
          <ChevronDown size={8} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

export default NumberSpinner;
