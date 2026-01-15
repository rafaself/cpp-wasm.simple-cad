import React from 'react';

interface SectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Section: React.FC<SectionProps> = ({ title, children, className = '' }) => (
  <div className={`flex flex-col gap-2 mb-6 ${className}`}>
    {title && (
      <h3 className="text-xs font-bold uppercase text-text-muted mb-1 tracking-wide">{title}</h3>
    )}
    <div className="bg-surface2/50 rounded-lg p-3 border border-border flex flex-col gap-2">
      {children}
    </div>
  </div>
);
