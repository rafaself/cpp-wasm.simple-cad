/**
 * InlinePolygonInput - Minimalist inline numeric input for polygon sides
 *
 * A sleek, compact overlay for quickly specifying polygon sides.
 * Just type a number and press Enter.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import NumberSpinner from '@/components/NumberSpinner';

interface InlinePolygonInputProps {
  /** Screen position where the input should appear */
  screenPosition: { x: number; y: number };
  /** Initial value for polygon sides */
  initialValue: number;
  /** Callback when user confirms the input */
  onConfirm: (sides: number) => void;
  /** Callback when user cancels the input */
  onCancel: () => void;
  /** Minimum sides allowed (default: 3) */
  minSides?: number;
  /** Maximum sides allowed (default: 24) */
  maxSides?: number;
}

export const InlinePolygonInput: React.FC<InlinePolygonInputProps> = ({
  screenPosition,
  initialValue,
  onConfirm,
  onCancel,
  minSides = 3,
  maxSides = 24,
}) => {
  const [val, setVal] = useState(initialValue);
  const [isValid, setIsValid] = useState(true);
  const valRef = useRef(initialValue); // Track latest value
  const isValidRef = useRef(true); // Track latest validity
  const [isExiting, setIsExiting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync ref when value changes (e.g. from props)
  useEffect(() => {
    valRef.current = val;
    // Initial validation
    const valid = val >= minSides && val <= maxSides;
    setIsValid(valid);
    isValidRef.current = valid;
  }, [val, minSides, maxSides]);

  // Handle value change from spinner
  const handleChange = useCallback(
    (newVal: number) => {
      setVal(newVal);
      valRef.current = newVal;
      const valid = newVal >= minSides && newVal <= maxSides;
      setIsValid(valid);
      isValidRef.current = valid;
    },
    [minSides, maxSides],
  );

  // Handle raw text change for immediate feedback
  const handleRawChange = useCallback(
    (raw: string) => {
      const n = parseFloat(raw);
      let valid = true;
      if (isNaN(n)) {
        valid = false;
      } else {
        valid = n >= minSides && n <= maxSides;
      }
      setIsValid(valid);
      isValidRef.current = valid;

      // If valid number, update valRef to allow confirmation to pick it up immediately
      // even if NumberSpinner hasn't committed it yet.
      if (!isNaN(n)) {
        valRef.current = n;
      }
    },
    [minSides, maxSides],
  );

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (!isValidRef.current) return;
    setIsExiting(true);
    setTimeout(() => onConfirm(Math.floor(valRef.current)), 80);
  }, [onConfirm]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setIsExiting(true);
    setTimeout(onCancel, 80);
  }, [onCancel]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // If valid, confirm; otherwise cancel
        if (isValidRef.current) {
          handleConfirm();
        } else {
          handleCancel();
        }
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleConfirm, handleCancel]);

  // Handle keyboard events at container level
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (isValidRef.current) {
          handleConfirm();
        }
      }
    },
    [handleCancel, handleConfirm],
  );

  // Calculate position to keep input in viewport
  const getPosition = useCallback(() => {
    const padding = 8;
    const width = 120;
    const height = isValid ? 64 : 84; // Adjust height for error message

    let x = screenPosition.x - width / 2;
    let y = screenPosition.y + 16;

    if (typeof window !== 'undefined') {
      if (x + width + padding > window.innerWidth) {
        x = window.innerWidth - width - padding;
      }
      if (y + height + padding > window.innerHeight) {
        y = screenPosition.y - height - 8;
      }
      x = Math.max(padding, x);
      y = Math.max(padding, y);
    }

    return { x, y };
  }, [screenPosition, isValid]);

  const pos = getPosition();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      className={`
        fixed z-toast 
        transition-all duration-100 ease-out
        ${isExiting ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}
        flex flex-col gap-1.5 p-3 rounded-lg
        bg-surface-2 border shadow-2xl
        cursor-default select-none
        ${isValid ? 'border-border/50' : 'border-red-500/80 ring-1 ring-red-500/20'}
      `}
      style={{
        left: pos.x,
        top: pos.y,
      }}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <label
        className={`text-xs font-medium ml-0.5 select-none ${isValid ? 'text-text' : 'text-red-400'}`}
      >
        Número de lados
      </label>
      <div className="cursor-text">
        <NumberSpinner
          value={val}
          onChange={handleChange}
          min={0} // Allow typing freely to validate
          max={99} // Allow typing freely to validate
          step={1}
          autoFocus
          selectOnFocus
          onRawChange={handleRawChange}
          className={`w-full h-8 shadow-inner bg-surface-2 ${!isValid ? 'border-red-500/50' : ''}`}
        />
      </div>
      {!isValid && (
        <div className="text-[10px] text-red-400 leading-tight px-0.5 -mt-0.5">
          Valor deve ser entre {minSides} e {maxSides}
        </div>
      )}
    </div>,
    document.body,
  );
};

export default InlinePolygonInput;
