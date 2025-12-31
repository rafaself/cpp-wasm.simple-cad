/**
 * NumericComboField - Figma-like numeric input with dropdown presets
 *
 * Reusable component for numeric input with:
 * - Direct number input
 * - Dropdown with preset values
 * - Keyboard navigation (ArrowUp/Down with Shift acceleration)
 * - Draft/Commit pattern (Enter/Blur commits, Esc cancels)
 * - Mixed state placeholder
 * - Full accessibility support
 */

import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useId, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { useNumericComboField, type NumericComboValue } from './useNumericComboField';

export interface NumericComboFieldProps {
  /** Current value (controlled) */
  value: NumericComboValue;
  /** Callback when value is committed */
  onCommit: (value: number) => void;
  /** Optional callback for draft changes */
  onChangeDraft?: (raw: string) => void;
  /** Preset values for dropdown */
  presets?: number[];
  /** Placeholder when mixed or empty */
  placeholder?: string;
  /** Allow custom values not in presets (default: true) */
  allowCustom?: boolean;
  /** Show dropdown button (default: true) */
  allowDropdown?: boolean;
  /** Enable arrow key stepping (default: true) */
  allowArrowStep?: boolean;
  /** Enable scroll wheel stepping (default: false) */
  allowScrollWheel?: boolean;
  /** Commit on blur (default: true) */
  commitOnBlur?: boolean;
  /** Commit on enter (default: true) */
  commitOnEnter?: boolean;
  /** Cancel on escape (default: true) */
  cancelOnEsc?: boolean;
  /** Increment step (default: 1) */
  step?: number;
  /** Large increment step for Shift (default: 10) */
  stepLarge?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Clamp values to min/max on commit (default: true) */
  clamp?: boolean;
  /** Decimal places (default: 0 for integers) */
  decimals?: number;
  /** Disabled state */
  disabled?: boolean;
  /** Aria label for accessibility */
  ariaLabel?: string;
  /** Test ID for testing */
  testId?: string;
  /** Additional CSS class */
  className?: string;
  /** Optional suffix (e.g., "px", "%") */
  suffix?: string;
  /** Dropdown max height: 'auto' (no limit), number (fixed px), or undefined (default ~256px) */
  dropdownMaxHeight?: 'auto' | number;
  /** Size preset (controls height and font size) */
  size?: 'x-small' | 'small' | 'medium' | 'large' | 'x-large' | 'auto';
}

const CONTAINER_SIZE_CLASSES = {
  'x-small': 'h-6',
  small: 'h-7',
  medium: 'h-8',
  large: 'h-10',
  'x-large': 'h-12',
  auto: '',
};

const INPUT_TEXT_CLASSES = {
  'x-small': 'text-[10px]',
  small: 'text-xs',
  medium: 'text-sm',
  large: 'text-base',
  'x-large': 'text-lg',
  auto: 'text-[10px]',
};

const FONT_SIZE_PRESETS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 32, 48, 64, 96];

export const NumericComboField: React.FC<NumericComboFieldProps> = ({
  value,
  onCommit,
  onChangeDraft,
  presets = FONT_SIZE_PRESETS,
  placeholder = '—',
  allowCustom = true,
  allowDropdown = true,
  allowArrowStep = true,
  allowScrollWheel = false,
  commitOnBlur = true,
  commitOnEnter = true,
  cancelOnEsc = true,
  step = 1,
  stepLarge = 10,
  min,
  max,
  clamp = true,
  decimals = 0,
  disabled = false,
  ariaLabel,
  testId,
  className = '',
  suffix,
  dropdownMaxHeight,
  size,
}) => {
  const uniqueId = useId();
  const listboxId = `numeric-combo-listbox-${uniqueId}`;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = React.useState({ top: 0, left: 0, width: 0 });

  const {
    draftValue,
    setDraftValue,
    isFocused,
    isDropdownOpen,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    highlightedIndex,
    setHighlightedIndex,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleWheel,
    selectPreset,
    increment,
    decrement,
    inputRef,
    isMixed,
  } = useNumericComboField({
    value,
    onCommit,
    onChangeDraft,
    presets,
    step,
    stepLarge,
    min,
    max,
    clamp,
    decimals,
    commitOnBlur,
    commitOnEnter,
    cancelOnEsc,
    allowArrowStep,
    allowScrollWheel,
  });

  // Update dropdown position when opened
  const updateDropdownPosition = React.useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 80),
      });
    }
  }, []);

  useEffect(() => {
    if (isDropdownOpen) {
      updateDropdownPosition();
      window.addEventListener('scroll', updateDropdownPosition, true);
      window.addEventListener('resize', updateDropdownPosition);
      return () => {
        window.removeEventListener('scroll', updateDropdownPosition, true);
        window.removeEventListener('resize', updateDropdownPosition);
      };
    }
  }, [isDropdownOpen, updateDropdownPosition]);

  // Click outside to close
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (inputRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      closeDropdown();
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen, closeDropdown, inputRef]);

  // Scroll highlighted option into view
  useEffect(() => {
    if (isDropdownOpen && highlightedIndex >= 0 && dropdownRef.current) {
      const option = dropdownRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
      // Guard for jsdom which doesn't have scrollIntoView
      if (option && typeof option.scrollIntoView === 'function') {
        option.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isDropdownOpen, highlightedIndex]);

  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      if (!isDropdownOpen) updateDropdownPosition();
      toggleDropdown();
    }
  };

  const handleSpinnerClick = (direction: 'up' | 'down', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    if (direction === 'up') {
      increment(e.shiftKey);
    } else {
      decrement(e.shiftKey);
    }
  };

  const handleOptionClick = (preset: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    selectPreset(preset);
  };

  // Determine if current value matches a preset
  const numericValue = typeof value === 'number' ? value : null;
  const currentInPresets = numericValue !== null && presets.includes(numericValue);

  return (
    <div
      className={`relative flex items-center bg-surface-strong/60 border ${
        isFocused ? 'border-primary/50' : 'border-border/50'
      } rounded overflow-hidden transition-colors duration-200 group ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${size ? CONTAINER_SIZE_CLASSES[size] : ''} ${className}`}
      data-testid={testId}
      onWheel={handleWheel}
    >
      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={isFocused ? draftValue : isMixed ? '' : draftValue}
        onChange={(e) => setDraftValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={isMixed ? placeholder : undefined}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isDropdownOpen}
        aria-controls={isDropdownOpen ? listboxId : undefined}
        aria-activedescendant={
          isDropdownOpen && highlightedIndex >= 0
            ? `${listboxId}-option-${highlightedIndex}`
            : undefined
        }
        aria-autocomplete="list"
        className={`flex-1 h-full bg-transparent text-center text-text font-mono focus:outline-none px-1 min-w-0 placeholder:text-text-muted ${
          size ? INPUT_TEXT_CLASSES[size] : 'text-[10px]'
        }`}
      />

      {/* Suffix */}
      {suffix && !isFocused && (
        <span className="text-[9px] text-text-muted pr-1 pointer-events-none">{suffix}</span>
      )}

      {/* Spinner buttons */}
      {allowArrowStep && (
        <div className="flex flex-col h-full border-l border-border/50 w-4 bg-surface-strong/80 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => handleSpinnerClick('up', e)}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            disabled={disabled}
            className="flex-1 flex items-center justify-center hover:bg-surface2 active:bg-primary/50 text-text-muted hover:text-text transition-colors border-b border-border/50 focus:outline-none"
            aria-label="Increment"
          >
            <ChevronUp size={8} strokeWidth={3} />
          </button>
          <button
            type="button"
            onClick={(e) => handleSpinnerClick('down', e)}
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={-1}
            disabled={disabled}
            className="flex-1 flex items-center justify-center hover:bg-surface2 active:bg-primary/50 text-text-muted hover:text-text transition-colors focus:outline-none"
            aria-label="Decrement"
          >
            <ChevronDown size={8} strokeWidth={3} />
          </button>
        </div>
      )}

      {/* Dropdown toggle */}
      {allowDropdown && (
        <button
          ref={buttonRef}
          type="button"
          onClick={handleDropdownToggle}
          onMouseDown={(e) => e.preventDefault()}
          tabIndex={-1}
          disabled={disabled}
          className="flex items-center justify-center h-full w-5 border-l border-border/50 bg-surface-strong/80 hover:bg-surface2 transition-colors focus:outline-none"
          aria-label="Open presets"
          aria-haspopup="listbox"
        >
          <ChevronDown
            size={10}
            className={`text-text-muted transition-transform duration-200 ${
              isDropdownOpen ? 'rotate-180' : ''
            }`}
          />
        </button>
      )}

      {/* Dropdown portal */}
      {isDropdownOpen &&
        allowDropdown &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel ? `${ariaLabel} presets` : 'Presets'}
            className={`fixed bg-surface-strong border border-border shadow-xl rounded-lg z-[9999] overflow-y-auto animate-in fade-in zoom-in-95 duration-100 ease-out py-1 custom-scrollbar ${dropdownMaxHeight === 'auto' ? '' : dropdownMaxHeight === undefined ? 'max-h-64' : ''}`}
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              minWidth: dropdownPos.width,
              ...(typeof dropdownMaxHeight === 'number' ? { maxHeight: dropdownMaxHeight } : {}),
            }}
          >
            {presets.map((preset, index) => {
              const isHighlighted = index === highlightedIndex;
              const isSelected = numericValue === preset;

              return (
                <div
                  key={preset}
                  id={`${listboxId}-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  onClick={(e) => handleOptionClick(preset, e)}
                  className={`px-3 py-2 text-xs text-text cursor-pointer transition-colors font-mono select-none ${
                    isSelected && isHighlighted
                      ? 'bg-primary/35'
                      : isSelected
                        ? 'bg-primary/25'
                        : isHighlighted
                          ? 'bg-primary/10'
                          : 'hover:bg-primary/10'
                  }`}
                >
                  {decimals > 0 ? preset.toFixed(decimals) : preset}
                  {suffix && <span className="text-text-muted ml-1">{suffix}</span>}
                </div>
              );
            })}
            {!allowCustom && presets.length === 0 && (
              <div className="px-3 py-2 text-xs text-text-muted">No presets available</div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
};

export default NumericComboField;

// Re-export hook and types for convenience
export { useNumericComboField } from './useNumericComboField';
export type { NumericComboValue, UseNumericComboFieldOptions } from './useNumericComboField';
