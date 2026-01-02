/**
 * InlinePolygonInput - Minimalist inline numeric input for polygon sides
 *
 * A sleek, compact overlay for quickly specifying polygon sides.
 * Just type a number and press Enter.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  const [value, setValue] = useState(String(initialValue));
  const [isExiting, setIsExiting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Clamp value to valid range
  const clampSides = useCallback(
    (n: number): number => Math.max(minSides, Math.min(maxSides, Math.floor(n))),
    [minSides, maxSides],
  );

  // Parse input to number, returning null if invalid
  const parseValue = useCallback(
    (v: string): number | null => {
      const trimmed = v.trim();
      if (trimmed === '') return null;
      const n = parseInt(trimmed, 10);
      if (isNaN(n)) return null;
      return clampSides(n);
    },
    [clampSides],
  );

  // Handle confirm
  const handleConfirm = useCallback(() => {
    const parsed = parseValue(value);
    if (parsed !== null) {
      setIsExiting(true);
      setTimeout(() => onConfirm(parsed), 80);
    } else {
      // Invalid - reset to initial
      setValue(String(initialValue));
    }
  }, [value, parseValue, onConfirm, initialValue]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    setIsExiting(true);
    setTimeout(onCancel, 80);
  }, [onCancel]);

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
    return () => clearTimeout(timer);
  }, []);

  // Handle keyboard events
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const current = parseValue(value) ?? initialValue;
        setValue(String(clampSides(current + 1)));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const current = parseValue(value) ?? initialValue;
        setValue(String(clampSides(current - 1)));
      }
    },
    [handleConfirm, handleCancel, value, parseValue, clampSides, initialValue],
  );

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        handleCancel();
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [handleCancel]);

  // Calculate position to keep input in viewport
  const getPosition = useCallback(() => {
    const padding = 8;
    const width = 64;
    const height = 36;

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
      `}
      style={{
        left: pos.x,
        top: pos.y,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, '');
          setValue(v);
        }}
        onKeyDown={handleKeyDown}
        className="
          w-16 h-9
          bg-surface/95 backdrop-blur-md
          border border-border/80
          rounded-lg shadow-lg
          text-center text-lg font-semibold text-text
          font-mono
          focus:outline-none focus:ring-2 focus:ring-primary/60 focus:border-primary/60
          placeholder:text-text-muted/50
          transition-all duration-100
        "
        placeholder={String(initialValue)}
      />
    </div>,
    document.body,
  );
};

export default InlinePolygonInput;
