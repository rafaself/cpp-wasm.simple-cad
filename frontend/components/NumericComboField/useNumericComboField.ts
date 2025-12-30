/**
 * useNumericComboField - Hook for Figma-like numeric input + dropdown
 *
 * Features:
 * - Draft editing (live string) with commit/cancel
 * - Keyboard navigation (ArrowUp/Down, Shift+Arrow, Enter, Esc, Tab)
 * - Preset support with custom value allowance
 * - Mixed state handling
 * - Validation, clamping, and decimal support
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export type NumericComboValue = number | null | 'mixed';

export interface UseNumericComboFieldOptions {
  /** Current committed value (controlled) */
  value: NumericComboValue;
  /** Callback when a new value is committed */
  onCommit: (value: number) => void;
  /** Optional callback for draft changes */
  onChangeDraft?: (raw: string) => void;
  /** Preset values for dropdown */
  presets?: number[];
  /** Step for arrow key increment (default: 1) */
  step?: number;
  /** Large step for Shift+Arrow (default: 10) */
  stepLarge?: number;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Whether to clamp values on commit (default: true) */
  clamp?: boolean;
  /** Number of decimal places (default: 0 for integers) */
  decimals?: number;
  /** Allow empty values (default: false) */
  allowEmpty?: boolean;
  /** Commit on blur (default: true) */
  commitOnBlur?: boolean;
  /** Commit on enter (default: true) */
  commitOnEnter?: boolean;
  /** Cancel on escape (default: true) */
  cancelOnEsc?: boolean;
  /** Enable arrow key stepping (default: true) */
  allowArrowStep?: boolean;
  /** Enable scroll wheel stepping (default: false) */
  allowScrollWheel?: boolean;
}

export interface UseNumericComboFieldReturn {
  /** Current draft string value */
  draftValue: string;
  /** Set draft value */
  setDraftValue: (val: string) => void;
  /** Whether input is focused */
  isFocused: boolean;
  /** Whether dropdown is open */
  isDropdownOpen: boolean;
  /** Open dropdown */
  openDropdown: () => void;
  /** Close dropdown */
  closeDropdown: () => void;
  /** Toggle dropdown */
  toggleDropdown: () => void;
  /** Currently highlighted preset index in dropdown */
  highlightedIndex: number;
  /** Set highlighted index */
  setHighlightedIndex: (idx: number) => void;
  /** Commit current draft */
  commit: () => void;
  /** Cancel editing and revert */
  cancel: () => void;
  /** Handle input focus */
  handleFocus: () => void;
  /** Handle input blur */
  handleBlur: () => void;
  /** Handle key down */
  handleKeyDown: (e: React.KeyboardEvent) => void;
  /** Handle wheel event */
  handleWheel: (e: React.WheelEvent) => void;
  /** Select preset by value */
  selectPreset: (preset: number) => void;
  /** Increment value by step */
  increment: (large?: boolean) => void;
  /** Decrement value by step */
  decrement: (large?: boolean) => void;
  /** Ref for input element */
  inputRef: React.RefObject<HTMLInputElement>;
  /** Display value (for showing in input when not focused) */
  displayValue: string;
  /** Whether the current state is mixed */
  isMixed: boolean;
}

/**
 * Format number for display based on decimals
 */
const formatNumber = (num: number, decimals: number): string => {
  return decimals > 0 ? num.toFixed(decimals) : Math.round(num).toString();
};

/**
 * Parse string to number, handling edge cases
 */
const parseNumber = (str: string, decimals: number): number | null => {
  const trimmed = str.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '.') return null;

  const parsed = parseFloat(trimmed);
  if (isNaN(parsed)) return null;

  // Round to the specified decimal places
  if (decimals > 0) {
    const factor = Math.pow(10, decimals);
    return Math.round(parsed * factor) / factor;
  }
  return Math.round(parsed);
};

export function useNumericComboField(
  options: UseNumericComboFieldOptions,
): UseNumericComboFieldReturn {
  const {
    value,
    onCommit,
    onChangeDraft,
    presets = [],
    step = 1,
    stepLarge = 10,
    min,
    max,
    clamp = true,
    decimals = 0,
    allowEmpty = false,
    commitOnBlur = true,
    commitOnEnter = true,
    cancelOnEsc = true,
    allowArrowStep = true,
    allowScrollWheel = false,
  } = options;

  // Derive display value from controlled value
  const isMixed = value === 'mixed';
  const numericValue = typeof value === 'number' ? value : null;
  const displayValue = isMixed ? '' : numericValue !== null ? formatNumber(numericValue, decimals) : '';

  // Internal state
  const [draftValue, setDraftValueInternal] = useState(displayValue);
  const [isFocused, setIsFocused] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommittedValue = useRef(numericValue);

  // Sync draft with value when not focused
  useEffect(() => {
    if (!isFocused) {
      setDraftValueInternal(displayValue);
      lastCommittedValue.current = numericValue;
    }
  }, [value, displayValue, numericValue, isFocused]);

  // Clamp helper
  const clampValue = useCallback(
    (val: number): number => {
      if (!clamp) return val;
      let clamped = val;
      if (min !== undefined) clamped = Math.max(min, clamped);
      if (max !== undefined) clamped = Math.min(max, clamped);
      return clamped;
    },
    [clamp, min, max],
  );

  // Set draft with optional callback
  const setDraftValue = useCallback(
    (val: string) => {
      setDraftValueInternal(val);
      onChangeDraft?.(val);
    },
    [onChangeDraft],
  );

  // Commit current draft
  const commit = useCallback(() => {
    const parsed = parseNumber(draftValue, decimals);

    if (parsed === null) {
      // Invalid input - revert to last committed value
      if (allowEmpty && draftValue.trim() === '') {
        // Allow empty if configured
        return;
      }
      if (lastCommittedValue.current !== null) {
        setDraftValueInternal(formatNumber(lastCommittedValue.current, decimals));
      }
      return;
    }

    const finalValue = clampValue(parsed);
    lastCommittedValue.current = finalValue;
    setDraftValueInternal(formatNumber(finalValue, decimals));
    onCommit(finalValue);
  }, [draftValue, decimals, clampValue, allowEmpty, onCommit]);

  // Cancel editing
  const cancel = useCallback(() => {
    if (lastCommittedValue.current !== null) {
      setDraftValueInternal(formatNumber(lastCommittedValue.current, decimals));
    } else if (isMixed) {
      setDraftValueInternal('');
    }
    setIsDropdownOpen(false);
  }, [decimals, isMixed]);

  // Increment/Decrement
  const adjustValue = useCallback(
    (delta: number) => {
      const baseValue = parseNumber(draftValue, decimals) ?? lastCommittedValue.current ?? 0;
      const newValue = clampValue(baseValue + delta);
      lastCommittedValue.current = newValue;
      setDraftValueInternal(formatNumber(newValue, decimals));
      onCommit(newValue);
    },
    [draftValue, decimals, clampValue, onCommit],
  );

  const increment = useCallback(
    (large = false) => adjustValue(large ? stepLarge : step),
    [adjustValue, step, stepLarge],
  );

  const decrement = useCallback(
    (large = false) => adjustValue(-(large ? stepLarge : step)),
    [adjustValue, step, stepLarge],
  );

  // Dropdown controls
  const openDropdown = useCallback(() => {
    setIsDropdownOpen(true);
    // Highlight current value if in presets
    if (numericValue !== null) {
      const idx = presets.indexOf(numericValue);
      setHighlightedIndex(idx >= 0 ? idx : -1);
    }
  }, [numericValue, presets]);

  const closeDropdown = useCallback(() => {
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  }, []);

  const toggleDropdown = useCallback(() => {
    if (isDropdownOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }, [isDropdownOpen, openDropdown, closeDropdown]);

  // Select preset
  const selectPreset = useCallback(
    (preset: number) => {
      const finalValue = clampValue(preset);
      lastCommittedValue.current = finalValue;
      setDraftValueInternal(formatNumber(finalValue, decimals));
      onCommit(finalValue);
      closeDropdown();
      inputRef.current?.focus();
    },
    [clampValue, decimals, onCommit, closeDropdown],
  );

  // Event handlers
  const handleFocus = useCallback(() => {
    setIsFocused(true);
    // Select all text on focus
    setTimeout(() => inputRef.current?.select(), 0);
  }, []);

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (commitOnBlur) {
      commit();
    }
    // Delay closing dropdown to allow click on options
    setTimeout(() => {
      if (!inputRef.current?.contains(document.activeElement)) {
        closeDropdown();
      }
    }, 150);
  }, [commitOnBlur, commit, closeDropdown]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'Enter':
          if (isDropdownOpen && highlightedIndex >= 0 && highlightedIndex < presets.length) {
            e.preventDefault();
            selectPreset(presets[highlightedIndex]);
          } else if (commitOnEnter) {
            e.preventDefault();
            commit();
            inputRef.current?.blur();
          }
          break;

        case 'Escape':
          if (cancelOnEsc) {
            e.preventDefault();
            cancel();
            inputRef.current?.blur();
          }
          break;

        case 'Tab':
          // Commit before moving to next field
          commit();
          closeDropdown();
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (isDropdownOpen && presets.length > 0) {
            // Navigate dropdown
            setHighlightedIndex((prev) => (prev <= 0 ? presets.length - 1 : prev - 1));
          } else if (allowArrowStep) {
            increment(e.shiftKey);
          }
          break;

        case 'ArrowDown':
          e.preventDefault();
          if (isDropdownOpen && presets.length > 0) {
            // Navigate dropdown
            setHighlightedIndex((prev) => (prev >= presets.length - 1 ? 0 : prev + 1));
          } else if (allowArrowStep) {
            decrement(e.shiftKey);
          }
          break;

        default:
          break;
      }
    },
    [
      isDropdownOpen,
      highlightedIndex,
      presets,
      commitOnEnter,
      cancelOnEsc,
      allowArrowStep,
      commit,
      cancel,
      increment,
      decrement,
      selectPreset,
      openDropdown,
      closeDropdown,
    ],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!allowScrollWheel || !isFocused) return;
      e.preventDefault();
      if (e.deltaY < 0) {
        increment(e.shiftKey);
      } else {
        decrement(e.shiftKey);
      }
    },
    [allowScrollWheel, isFocused, increment, decrement],
  );

  return {
    draftValue,
    setDraftValue,
    isFocused,
    isDropdownOpen,
    openDropdown,
    closeDropdown,
    toggleDropdown,
    highlightedIndex,
    setHighlightedIndex,
    commit,
    cancel,
    handleFocus,
    handleBlur,
    handleKeyDown,
    handleWheel,
    selectPreset,
    increment,
    decrement,
    inputRef,
    displayValue,
    isMixed,
  };
}
