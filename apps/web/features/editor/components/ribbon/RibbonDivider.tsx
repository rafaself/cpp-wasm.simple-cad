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
  const baseClass =
    orientation === 'vertical'
      ? 'self-stretch w-px bg-border/50 mx-0.5 my-1'
      : 'w-full h-px bg-border/50 my-1';

  return <div className={`${baseClass} ${className}`} aria-hidden="true" />;
};

export default RibbonDivider;
