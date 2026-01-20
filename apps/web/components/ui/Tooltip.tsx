import React, { useState, useRef, useEffect } from 'react';

import { Portal } from './Portal';
import { calculatePosition, Placement } from './utils/positioning';

export interface TooltipProps {
  children: React.ReactNode;
  content: string | React.ReactNode;
  placement?: Placement;
  delay?: number;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  children,
  content,
  placement = 'top',
  delay = 300,
  className = '',
}) => {
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePosition = () => {
    if (triggerRef.current && contentRef.current) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const contentRect = contentRef.current.getBoundingClientRect();
      const pos = calculatePosition(triggerRect, contentRect, { placement, offset: 8 });
      setPosition(pos);
    }
  };

  useEffect(() => {
    if (show) {
      requestAnimationFrame(updatePosition);
    }
  }, [show]);

  const handleMouseEnter = () => {
    timerRef.current = setTimeout(() => {
      setShow(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setShow(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      {show && (
        <Portal>
          <div
            ref={contentRef}
            role="tooltip"
            className={`fixed z-tooltip px-2 py-1 text-xs font-medium text-white bg-surface-2 border border-border/50 rounded shadow-md pointer-events-none animate-in fade-in duration-150 ${className}`}
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  );
};
