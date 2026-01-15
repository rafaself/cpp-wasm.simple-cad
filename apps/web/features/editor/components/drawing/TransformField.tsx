/**
 * TransformField - Numeric input field for entity transform properties
 *
 * Wraps NumericComboField with draft/commit pattern for inspector panels.
 * Handles:
 * - Draft state during editing (prevents engine updates from clobbering input)
 * - Enter/Blur commits
 * - Escape reverts
 * - Suffix display (px or °)
 * - Disabled state with tooltip
 */

import React, { useState, useRef, useEffect } from 'react';

import { NumericComboField } from '@/components/NumericComboField/NumericComboField';

export interface TransformFieldProps {
  /** Field label (e.g., "X", "Y", "L", "A", "Rotação") */
  label: string;
  /** Current value from engine (or null if not available) */
  value: number | null;
  /** Callback when value is committed (Enter/Blur) */
  onCommit: (value: number) => void;
  /** Unit suffix (e.g., "px", "°") */
  suffix?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Tooltip for disabled state */
  title?: string;
  /** Decimal places (default: 2) */
  decimals?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Increment step (default: 1) */
  step?: number;
  /** Large increment step for Shift (default: 10) */
  stepLarge?: number;
}

export const TransformField: React.FC<TransformFieldProps> = ({
  label,
  value,
  onCommit,
  suffix,
  disabled = false,
  title,
  decimals = 2,
  min,
  max,
  step = 1,
  stepLarge = 10,
}) => {
  const [frozenValue, setFrozenValue] = useState<number | null>(null);
  const isEditing = useRef(false);

  // Sync from engine value only when not editing
  useEffect(() => {
    if (!isEditing.current && value !== null) {
      setFrozenValue(value);
    }
  }, [value]);

  const handleFocus = () => {
    isEditing.current = true;
    // Freeze current value to prevent engine updates from changing it
    if (value !== null) {
      setFrozenValue(value);
    }
  };

  const handleBlur = () => {
    isEditing.current = false;
  };

  const handleCommit = (newValue: number) => {
    onCommit(newValue);
  };

  // Use frozen value while editing, live value when not
  const displayValue = isEditing.current ? frozenValue : value;

  return (
    <div className="flex flex-col gap-1" title={disabled ? title : undefined}>
      <label className="text-[10px] font-medium text-text-muted uppercase tracking-wide">
        {label}
      </label>
      <div onFocusCapture={handleFocus} onBlurCapture={handleBlur}>
        <NumericComboField
          value={displayValue}
          onCommit={handleCommit}
          suffix={suffix}
          disabled={disabled}
          decimals={decimals}
          min={min}
          max={max}
          step={step}
          stepLarge={stepLarge}
          size="small"
          allowDropdown={false}
          placeholder="—"
        />
      </div>
    </div>
  );
};
