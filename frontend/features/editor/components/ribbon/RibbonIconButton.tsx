import React from 'react';

import { BUTTON_STYLES } from '@/src/styles/recipes';

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

const SIZE_CLASSES: Record<RibbonIconButtonSize, string> = {
  sm: 'w-7',  // 28px
  md: 'w-8',  // 32px
};

const VARIANT_CLASSES: Record<RibbonIconButtonVariant, { active: string; default: string }> = {
  default: {
    active: BUTTON_STYLES.active,
    default: 'text-text-muted hover:text-text hover:bg-surface2',
  },
  primary: {
    active: BUTTON_STYLES.active,
    default: 'text-primary hover:text-primary-hover hover:bg-surface2',
  },
  danger: {
    active: 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/30',
    default: 'text-red-500 hover:text-red-400 hover:bg-surface2',
  },
  warning: {
    active: 'bg-yellow-500/20 text-yellow-500 hover:bg-yellow-500/30 border border-yellow-500/30',
    default: 'text-yellow-500 hover:text-yellow-400 hover:bg-surface2',
  },
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
  const sizeClass = SIZE_CLASSES[size];
  const variantConfig = VARIANT_CLASSES[variant];
  const stateClass = isActive ? variantConfig.active : variantConfig.default;
  
  return (
    <button
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on click
      className={`
        ${sizeClass} 
        h-full 
        flex items-center justify-center
        border border-transparent
        text-text-muted
        focus-outline 
        rounded 
        transition-colors 
        shrink-0
        ${stateClass}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `.replace(/\s+/g, ' ').trim()}
      title={title}
      disabled={disabled}
      aria-pressed={isActive}
    >
      {icon}
    </button>
  );
};

export default RibbonIconButton;
