/**
 * Ribbon Components - Barrel Export
 *
 * This file exports all ribbon-related components for easy importing.
 *
 * Usage:
 * import { RibbonButton, RibbonIconButton, RibbonToggleGroup } from '@/features/editor/components/ribbon';
 *
 * Phase 2 Updates:
 * - Added RibbonSplitButton component
 * - Added ribbonButtonState utilities
 * - Added mixed state support
 */

// Main Button Components
export { RibbonButton } from './RibbonButton';
export { RibbonLargeButton } from './RibbonLargeButton';
export { RibbonSmallButton } from './RibbonSmallButton';
export { RibbonIconButton } from './RibbonIconButton';
export { RibbonSplitButton } from './RibbonSplitButton'; // NEW in Phase 2

// Layout Components
export { RibbonGroup } from './RibbonGroup';
export { RibbonToggleGroup } from './RibbonToggleGroup';
export { RibbonDivider } from './RibbonDivider';
export { RibbonControlWrapper } from './RibbonControlWrapper';

// Custom Control Groups
export { LayerRibbonControls } from './LayerRibbonControls';
export { TextFormattingControls } from './TextFormattingControls';
export { SelectionControls } from './SelectionControls';

// Utilities
export { getTooltip, getBindingId, RIBBON_ICON_SIZES } from './ribbonUtils';

// State Management Utilities (NEW in Phase 2)
export {
  resolveButtonState,
  resolveButtonVariant,
  getStateClasses,
  getSizeClasses,
  combineClasses,
  isButtonInteractable,
  getCursorClass,
  getAriaPressed,
  wrapMixedStateIcon,
  validateStateConfig,
  type RibbonButtonState,
  type RibbonButtonIntent,
  type RibbonButtonSize,
  type RibbonButtonStateConfig,
} from './ribbonButtonState';
