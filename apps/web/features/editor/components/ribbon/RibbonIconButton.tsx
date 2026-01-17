import React from 'react';

import { Button, ButtonVariant } from '@/components/ui/Button';

type RibbonIconButtonSize = 'sm' | 'md';
type RibbonIconButtonVariant = 'default' | 'danger' | 'warning' | 'primary';

interface RibbonIconButtonProps {
  /** The icon to render */
  icon: React.ReactNode;
  /** Click handler */
  onClick: () => void;
  /** Whether the button is in active/pressed state */
  isActive?: boolean;
  /** Tooltip text */
  title?: string;
  /** Size preset: sm (28px) or md (32px) */
  size?: RibbonIconButtonSize;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Color variant */
  variant?: RibbonIconButtonVariant;
  /** Additional CSS classes */
  className?: string;
}

const SIZE_MAP: Record<RibbonIconButtonSize, 'sm' | 'icon'> = {
  sm: 'sm', // Keep Button size sm for smaller icons
  md: 'icon',
};

const SIZE_CLASSES: Record<RibbonIconButtonSize, string> = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
};

// Map RibbonIconButton specific variants to Button primitives
const VARIANT_MAP: Record<RibbonIconButtonVariant, ButtonVariant> = {
  default: 'ghost',
  primary: 'primary',
  danger: 'danger',
  warning: 'secondary', // Mapping warning to secondary as there is no warning variant yet
};

/**
 * A small icon-only button for use within ribbon toggle groups.
 * Provides consistent styling for toggle buttons like Bold, Italic, Visibility, Lock, etc.
 */
export const RibbonIconButton: React.FC<RibbonIconButtonProps> = ({
  icon,
  onClick,
  isActive = false,
  title,
  size = 'md',
  disabled = false,
  variant = 'default',
  className = '',
}) => {
  // If active, usually becomes primary
  const finalVariant = isActive ? 'primary' : VARIANT_MAP[variant];

  return (
    <Button
      variant={finalVariant}
      size={SIZE_MAP[size]} // sm or icon
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
      className={`${SIZE_CLASSES[size]} p-0 ${className}`}
      title={title}
      disabled={disabled}
      aria-pressed={isActive}
    >
      {icon}
    </Button>
  );
};

export default RibbonIconButton;
