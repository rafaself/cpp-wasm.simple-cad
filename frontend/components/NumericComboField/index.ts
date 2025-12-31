/**
 * NumericComboField - Reusable Figma-like numeric input + dropdown
 *
 * @example
 * ```tsx
 * import { NumericComboField } from '@/components/NumericComboField';
 *
 * // Font size control
 * <NumericComboField
 *   value={16}
 *   onCommit={(val) => setFontSize(val)}
 *   presets={[8, 10, 12, 14, 16, 18, 20, 24, 32, 48]}
 *   min={1}
 *   max={256}
 *   suffix="px"
 * />
 *
 * // Stroke width control (with decimals)
 * <NumericComboField
 *   value={1.5}
 *   onCommit={(val) => setStrokeWidth(val)}
 *   presets={[0.5, 1, 1.5, 2, 3, 4, 6, 8]}
 *   decimals={1}
 *   min={0.1}
 *   max={32}
 * />
 *
 * // Mixed state (multiple selection)
 * <NumericComboField
 *   value="mixed"
 *   onCommit={(val) => applyToAll(val)}
 *   placeholder="Mixed"
 * />
 * ```
 */

export { NumericComboField, default } from './NumericComboField';
export { useNumericComboField } from './useNumericComboField';

export type {
  NumericComboFieldProps,
} from './NumericComboField';

export type {
  NumericComboValue,
  UseNumericComboFieldOptions,
  UseNumericComboFieldReturn,
} from './useNumericComboField';
