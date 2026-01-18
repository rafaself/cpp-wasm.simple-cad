import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Portal } from './Portal';
import { calculatePosition, Placement } from './utils/positioning';

export interface PopoverProps {
  children: React.ReactNode;
  content: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  placement?: Placement;
  offset?: number;
  className?: string;
  zIndex?: string; // Should be a token like 'z-dropdown'
  matchWidth?: boolean;
}

export const Popover: React.FC<PopoverProps> = ({
  children,
  content,
  isOpen: controlledIsOpen,
  onOpenChange,
  placement = 'bottom',
  offset = 4,
  className = '',
  zIndex = 'z-dropdown',
  matchWidth = false,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    width: undefined as number | undefined,
  });

  const isControlled = controlledIsOpen !== undefined;
  const show = isControlled ? controlledIsOpen : internalIsOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!isControlled) {
        setInternalIsOpen(open);
      }
      onOpenChange?.(open);
    },
    [isControlled, onOpenChange],
  );

  const updatePosition = useCallback(() => {
    if (triggerRef.current && contentRef.current && show) {
      const triggerRect = triggerRef.current.getBoundingClientRect();
      const contentRect = contentRef.current.getBoundingClientRect();
      const pos = calculatePosition(triggerRect, contentRect, { placement, offset });

      setPosition({
        top: pos.top,
        left: pos.left,
        width: matchWidth ? triggerRect.width : undefined,
      });
    }
  }, [show, placement, offset, matchWidth]);

  useEffect(() => {
    if (show) {
      // Initial position
      // We need a slight delay or effect to wait for content to render and have dimensions
      requestAnimationFrame(updatePosition);

      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [show, updatePosition]);

  // Click outside
  useEffect(() => {
    if (!show) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        contentRef.current &&
        !contentRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        handleOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show, handleOpenChange]);

  // Handle trigger click
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    handleOpenChange(!show);
  };

  return (
    <>
      <div ref={triggerRef} onClick={handleTriggerClick} className="inline-block w-full h-full">
        {children}
      </div>
      {show && (
        <Portal>
          <div
            ref={contentRef}
            className={`fixed ${zIndex} ${className}`}
            style={{
              top: position.top,
              left: position.left,
              width: position.width,
            }}
          >
            {content}
          </div>
        </Portal>
      )}
    </>
  );
};
