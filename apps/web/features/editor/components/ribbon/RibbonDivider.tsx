import React from 'react';

interface RibbonDividerProps {
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

/**
 * Visual divider for separating elements within the ribbon.
 * Supports both vertical (default) and horizontal orientations.
 */
export const RibbonDivider: React.FC<RibbonDividerProps> = ({
  orientation = 'vertical',
  className = '',
}) => {
  const baseClass = orientation === 'vertical' ? 'ribbon-divider-v' : 'ribbon-divider-h';

  return <div className={`${baseClass} ${className}`} aria-hidden="true" />;
};

export default RibbonDivider;
