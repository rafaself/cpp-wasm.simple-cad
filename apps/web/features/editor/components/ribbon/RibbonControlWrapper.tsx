import React from 'react';

interface RibbonControlWrapperProps {
  /** The child elements to wrap */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Horizontal alignment */
  align?: 'start' | 'center' | 'end';
}

/**
 * A wrapper component for ribbon controls that ensures proper vertical centering
 * and full height utilization within ribbon rows.
 */
export const RibbonControlWrapper: React.FC<RibbonControlWrapperProps> = ({
  children,
  className = '',
  align = 'start',
}) => {
  const alignClass = {
    start: '',
    center: 'items-center',
    end: 'items-end',
  }[align];

  return (
    <div className={`flex flex-col justify-center w-full h-full ${alignClass} ${className}`}>
      {children}
    </div>
  );
};

export default RibbonControlWrapper;
