import React from 'react';

import { Button, ButtonVariant } from '@/components/ui/Button';
import { useRibbonTracking } from '@/utils/analytics/useRibbonTracking';

import {
  combineClasses,
  getStateClasses,
  resolveButtonVariant,
  wrapMixedStateIcon,
  type RibbonButtonIntent,
} from './ribbonButtonState';

type RibbonIconButtonSize = 'sm' | 'md';
type RibbonIconButtonVariant = 'default' | 'danger' | 'warning' | 'primary';

interface RibbonIconButtonProps {
  /** The icon to render */
  icon: React.ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Whether the button is in active/pressed state */
  isActive?: boolean;
  /** Active styling mode */
  activeStyle?: 'mode' | 'toggle';
  /** Whether the button shows mixed state (multi-selection) */
  isMixed?: boolean;
  /** Tooltip text */
  title?: string;
  /** Size preset: sm (24px) or md (32px) - NOW ALIGNED TO PHASE 1 */
  size?: RibbonIconButtonSize;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Color variant */
  variant?: RibbonIconButtonVariant;
  /** Additional CSS classes */
  className?: string;

  // Analytics tracking (NEW in Phase 2)
  trackingId?: string;
  tabId?: string;
  groupId?: string;
}

const SIZE_MAP: Record<RibbonIconButtonSize, 'sm' | 'icon'> = {
  sm: 'sm', // Keep Button size sm for smaller icons
  md: 'icon',
};

// Phase 1 Aligned Sizes - Updated to match token standards
const SIZE_CLASSES: Record<RibbonIconButtonSize, string> = {
  sm: 'ribbon-icon-btn-sm',
  md: 'ribbon-icon-btn-md',
};

// Map RibbonIconButton specific variants to intent
const VARIANT_TO_INTENT: Record<RibbonIconButtonVariant, RibbonButtonIntent> = {
  default: 'default',
  primary: 'primary',
  danger: 'danger',
  warning: 'warning',
};

/**
 * A small icon-only button for use within ribbon toggle groups.
 * Provides consistent styling for toggle buttons like Bold, Italic, Visibility, Lock, etc.
 *
 * Phase 2 Updates:
 * - Added analytics tracking support
 * - Added mixed state support
 * - Integrated unified state system
 * - Aligned sizes to Phase 1 tokens
 */
export const RibbonIconButton: React.FC<RibbonIconButtonProps> = ({
  icon,
  onClick,
  isActive = false,
  activeStyle = 'toggle',
  isMixed = false,
  title,
  size = 'md',
  disabled = false,
  variant = 'default',
  className = '',
  trackingId,
  tabId,
  groupId,
}) => {
  // Analytics tracking (optional)
  const tracking = tabId && groupId ? useRibbonTracking(tabId, groupId) : null;

  // Resolve intent from variant
  const intent = VARIANT_TO_INTENT[variant];

  // Resolve button variant using unified state system
  const buttonVariant = resolveButtonVariant(
    isMixed ? 'mixed' : isActive ? 'active' : 'default',
    intent,
    isActive,
    activeStyle,
  );

  // Get state classes
  const stateClasses = getStateClasses({
    isActive,
    isDisabled: disabled,
    isMixed,
    intent,
    activeStyle,
  });

  // Handle click with tracking
  const handleClick = () => {
    if (tracking && trackingId) {
      tracking.trackClick(trackingId, 'action');
    }
    onClick();
  };

  // Wrap icon for mixed state
  const displayIcon = wrapMixedStateIcon(icon, isMixed);

  // Hover tracking
  const hoverEndRef = React.useRef<(() => void) | null>(null);

  return (
    <Button
      variant={buttonVariant}
      size={SIZE_MAP[size]} // sm or icon
      onClick={handleClick}
      onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
      onMouseEnter={() => {
        if (tracking && trackingId) {
          hoverEndRef.current = tracking.startHoverTimer(trackingId);
        }
      }}
      onMouseLeave={() => {
        if (hoverEndRef.current) {
          hoverEndRef.current();
          hoverEndRef.current = null;
        }
      }}
      className={combineClasses(
        'ribbon-icon-button',
        SIZE_CLASSES[size],
        'p-0',
        stateClasses,
        className,
      )}
      title={title}
      disabled={disabled}
      aria-pressed={isMixed ? 'mixed' : isActive}
      aria-label={title}
    >
      {displayIcon}
    </Button>
  );
};

export default RibbonIconButton;
