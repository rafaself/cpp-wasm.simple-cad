import { X } from 'lucide-react';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface DialogProps {
  /** Max width of the dialog (e.g., '500px', '80%') */
  maxWidth?: string;
  /** Whether clicking the overlay closes the dialog */
  persistent?: boolean;
  /** External control: is the dialog open? */
  modelValue?: boolean;
  /** Callback when dialog open state changes */
  onUpdate?: (isOpen: boolean) => void;
  /** Whether to show a close button in the top-right corner */
  showCloseButton?: boolean;
  /** The activator element (button that opens the dialog) */
  activator?: (props: { onClick: () => void; isOpen: boolean }) => React.ReactNode;
  /** The dialog content */
  children: React.ReactNode | ((props: { isOpen: boolean; close: () => void }) => React.ReactNode);
  /** Additional class for the dialog card */
  className?: string;
  /** Z-index for the dialog */
  zIndex?: number;
  /** Additional keys that close the dialog (e.g., ['F11']) */
  closeOnKeys?: string[];
  /** Close dialog when window resizes (useful for fullscreen toggle) */
  closeOnResize?: boolean;
}

const Dialog: React.FC<DialogProps> = ({
  maxWidth = '500px',
  persistent = false,
  modelValue,
  onUpdate,
  showCloseButton = false,
  activator,
  children,
  className = '',
  zIndex = 1000,
  closeOnKeys = [],
  closeOnResize = false,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Controlled or uncontrolled mode
  const isControlled = modelValue !== undefined;
  const isOpen = isControlled ? modelValue : internalOpen;

  const setIsOpen = useCallback(
    (value: boolean) => {
      if (isControlled) {
        onUpdate?.(value);
      } else {
        setInternalOpen(value);
      }
    },
    [isControlled, onUpdate],
  );

  const open = useCallback(() => setIsOpen(true), [setIsOpen]);
  const close = useCallback(() => setIsOpen(false), [setIsOpen]);
  const toggle = useCallback(() => setIsOpen(!isOpen), [setIsOpen, isOpen]);

  // Handle overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && !persistent) {
        close();
      }
    },
    [persistent, close],
  );

  // Handle ESC key and custom closeOnKeys
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !persistent) {
        close();
      }
      if (closeOnKeys.includes(e.key)) {
        close();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, persistent, close, closeOnKeys]);

  // Lock body scroll when dialog is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Close on resize (for fullscreen toggle detection)
  useEffect(() => {
    if (!isOpen || !closeOnResize) return;

    const initialWidth = window.innerWidth;
    const initialHeight = window.innerHeight;
    let timeoutId: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      // Debounce to avoid closing on minor resizes
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const widthChanged = Math.abs(window.innerWidth - initialWidth) > 100;
        const heightChanged = Math.abs(window.innerHeight - initialHeight) > 100;

        if (widthChanged || heightChanged) {
          close();
        }
      }, 50);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [isOpen, closeOnResize, close]);

  // Focus trap (basic implementation)
  useEffect(() => {
    if (isOpen && dialogRef.current) {
      dialogRef.current.focus();
    }
  }, [isOpen]);

  const renderContent = () => {
    if (typeof children === 'function') {
      return children({ isOpen, close });
    }
    return children;
  };

  const dialogContent = isOpen ? (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }}>
      {/* Overlay/Scrim */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Dialog Card */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`
          relative bg-surface-strong border border-border rounded-lg shadow-card
          transform transition-all duration-200 ease-out
          animate-in fade-in zoom-in-95
          overflow-hidden flex flex-col
          ${className}
        `}
        style={{ maxWidth, width: '100%', margin: '16px', maxHeight: 'calc(100vh - 32px)' }}
      >
        {showCloseButton && (
          <button
            onClick={close}
            className="absolute top-3 right-3 text-slate-400 hover:text-white transition-colors z-10"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
        )}
        {renderContent()}
      </div>
    </div>
  ) : null;

  return (
    <>
      {activator?.({ onClick: toggle, isOpen })}
      {createPortal(dialogContent, document.body)}
    </>
  );
};

// Sub-components for better composition
export interface DialogCardProps {
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export const DialogCard: React.FC<DialogCardProps> = ({
  title,
  children,
  actions,
  className = '',
  contentClassName = '',
}) => {
  return (
    <div className={`flex flex-col min-h-0 max-h-full ${className}`}>
      {title && (
        <div className="px-6 py-4 border-b border-slate-700 shrink-0">
          <h2 className="text-lg font-semibold text-white leading-none">{title}</h2>
        </div>
      )}
      <div className={`px-6 py-4 text-slate-300 flex-grow min-h-0 ${contentClassName}`}>
        {children}
      </div>
      {actions && (
        <div className="px-6 py-3 border-t border-slate-700 flex justify-end gap-2 shrink-0 bg-slate-800/50">
          {actions}
        </div>
      )}
    </div>
  );
};

export interface DialogButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'text';
  className?: string;
  disabled?: boolean;
}

export const DialogButton: React.FC<DialogButtonProps> = ({
  children,
  onClick,
  variant = 'text',
  className = '',
  disabled = false,
}) => {
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
    text: 'text-slate-300 hover:text-white hover:bg-slate-700/50',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-4 py-2 rounded-md text-sm font-medium transition-all
        ${variantClasses[variant]}
        ${disabled ? 'opacity-40 cursor-not-allowed grayscale-[0.5]' : 'active:scale-[0.98]'}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export default Dialog;
