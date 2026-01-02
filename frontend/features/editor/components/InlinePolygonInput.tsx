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
  const valRef = useRef(initialValue); // Track latest value to avoid stale closures
  const [isExiting, setIsExiting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync ref when value changes (e.g. from props)
  useEffect(() => {
    valRef.current = val;
  }, [val]);

  // Handle value change from spinner
  const handleChange = useCallback((newVal: number) => {
    setVal(newVal);
    valRef.current = newVal;
  }, []);

  // Handle confirm
  const handleConfirm = useCallback(() => {
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
      // Check if click is outside the NumberSpinner (which is inside containerRef)
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        // Confirm on outside click
        // Note: mousedown happens after input blur, ensuring value is committed
        handleConfirm();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleConfirm]);

  // Handle keyboard events at container level (for Escape)
  // Enter is handled by NumberSpinner
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
         // NumberSpinner handles Enter -> calls onChange synchronously
         // Event bubbles to here, so we just confirm with latest value
         e.preventDefault();
         handleConfirm();
      }
    },
    [handleCancel, handleConfirm],
  );

  // Calculate position to keep input in viewport
  const getPosition = useCallback(() => {
    const padding = 8;
    const width = 120; // Increased width for label + input container
    const height = 64; // Increased height for label + input

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
  }, [screenPosition]);

  const pos = getPosition();

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      className={`
        fixed z-[10000] 
        transition-all duration-100 ease-out
        ${isExiting ? 'opacity-0 scale-90' : 'opacity-100 scale-100'}
        flex flex-col gap-1.5 p-3 rounded-lg
        bg-surface-strong border border-border/50 shadow-2xl
        cursor-default select-none
      `}
      style={{
        left: pos.x,
        top: pos.y,
      }}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()} 
      onPointerDown={(e) => {
        // Critical: Stop pointer down from reaching global listeners (like interactions)
        // that might interpret this as a start of a shape creation or selection drag.
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
    >
      <label className="text-xs text-text font-medium ml-0.5 select-none">
        Número de lados
      </label>
      <div className="cursor-text">
        <NumberSpinner
          value={val}
          onChange={handleChange}
          min={minSides}
          max={maxSides}
          step={1}
          autoFocus
          selectOnFocus
          className="w-full h-8 shadow-inner bg-surface-2"
        />
      </div>
    </div>,
    document.body,
  );
};

export default InlinePolygonInput;
