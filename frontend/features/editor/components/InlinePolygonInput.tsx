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
  const [isExiting, setIsExiting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onConfirm(Math.floor(val)), 80);
  }, [val, onConfirm]);

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
        // We consider clicking outside as a confirm or cancel?
        // Typically sticky inputs confirm on blur/outside click in this app style?
        // Or cancel? The previous code cancelled.
        // Let's stick to cancel to be safe, or confirm if that's preferred.
        // User asked for "simple input box pattern".
        // Let's keep cancel for now to avoid accidental commits.
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

  // Handle keyboard events at container level (for Escape)
  // Enter is handled by NumberSpinner
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleCancel();
      } else if (e.key === 'Enter') {
         // NumberSpinner handles Enter -> onBlur -> handleConfirm
         // But explicit Enter handling here can be safer
         e.preventDefault();
         handleConfirm();
      }
    },
    [handleCancel, handleConfirm],
  );

  // Calculate position to keep input in viewport
  const getPosition = useCallback(() => {
    const padding = 8;
    const width = 80;
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
      onKeyDown={handleKeyDown}
    >
      <NumberSpinner
        value={val}
        onChange={setVal}
        min={minSides}
        max={maxSides}
        step={1}
        autoFocus
        className="w-24 h-10 shadow-xl border-primary/30"
        onBlur={handleConfirm} 
      />
    </div>,
    document.body,
  );
};

export default InlinePolygonInput;
