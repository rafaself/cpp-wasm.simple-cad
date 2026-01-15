import React from 'react';

interface RibbonToggleGroupProps {
  /** The child elements (typically RibbonIconButtons) */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Width preset */
  width?: 'auto' | 'fit';
}

/**
 * A container for grouping toggle buttons with consistent styling.
 * Provides the bordered container appearance used for button groups like
 * text alignment, text styles, layer visibility/lock, etc.
 */
export const RibbonToggleGroup: React.FC<RibbonToggleGroupProps> = ({
  children,
  className = '',
  width = 'auto',
}) => {
  const widthClass = width === 'fit' ? 'w-fit' : '';

  return (
    <div
      className={`
        flex 
        bg-surface2 
        rounded 
        border 
        border-border/50 
        p-0.5 
        ribbon-fill-h 
        gap-0.5 
        items-center
        ${widthClass}
        ${className}
      `
        .replace(/\s+/g, ' ')
        .trim()}
    >
      {children}
    </div>
  );
};

export default RibbonToggleGroup;
