import React from 'react';

interface RibbonToggleGroupProps {
  /** The child elements (typically RibbonIconButtons) */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Width preset */
  width?: 'auto' | 'fit';
  /** Styling variant */
  variant?: 'default' | 'segmented';
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
  variant = 'default',
}) => {
  const widthClass = width === 'fit' ? 'w-fit' : '';
  const isSegmented = variant === 'segmented';

  const baseClasses = `
    ribbon-cluster
    ribbon-fill-h
    ${widthClass}
  `;

  const defaultClasses = '';

  const segmentedClasses = 'ribbon-cluster--segmented';

  return (
    <div
      className={`
        ${baseClasses}
        ${isSegmented ? segmentedClasses : defaultClasses}
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
