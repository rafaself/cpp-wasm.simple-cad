import { X } from 'lucide-react';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button, ButtonVariant } from './Button';

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
  activator?: (props: {
    onClick: (e: React.MouseEvent) => void;
    isOpen: boolean;
  }) => React.ReactNode;
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
  /** Accessible label if no title is provided */
  ariaLabel?: string;
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
  ariaLabel,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const activatorRef = useRef<HTMLElement | null>(null);

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

  const focusFirstElement = () => {
    const container = dialogRef.current;
    if (!container) return;
    const focusables = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    first?.focus();
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab' && dialogRef.current) {
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) {
        e.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, []);

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
      const lastFocused = document.activeElement as HTMLElement | null;
      document.body.style.overflow = 'hidden';
      focusFirstElement();
      return () => {
        document.body.style.overflow = originalOverflow;
        if (activatorRef.current) {
          activatorRef.current.focus();
        } else if (lastFocused) {
          lastFocused.focus();
        }
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
        aria-label={ariaLabel}
        className={`
          relative bg-surface1 border border-border rounded-lg shadow-card
          transform transition-all duration-200 ease-out
          animate-in fade-in zoom-in-95
          overflow-hidden flex flex-col
          ${className}
        `}
        style={{ maxWidth, width: '100%', margin: '16px', maxHeight: 'calc(100vh - 32px)' }}
        onKeyDown={handleKeyDown}
      >
        {showCloseButton && (
          <button
            onClick={close}
            className="absolute top-3 right-3 text-text-muted hover:text-text transition-colors z-10"
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
      {activator
        ? activator({
            onClick: (e) => {
              activatorRef.current = e.currentTarget as HTMLElement;
              toggle();
            },
            isOpen,
          })
        : null}
      {dialogContent ? createPortal(dialogContent, document.body) : null}
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
        <div className="px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-lg font-semibold text-text leading-none">{title}</h2>
        </div>
      )}
      <div className={`px-6 py-4 text-text flex-grow min-h-0 ${contentClassName}`}>{children}</div>
      {actions && (
        <div className="px-6 py-3 border-t border-border flex justify-end gap-2 shrink-0 bg-surface2/50">
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
  const mapVariant = (v: 'primary' | 'secondary' | 'text'): ButtonVariant => {
    switch (v) {
      case 'primary': return 'primary';
      case 'secondary': return 'secondary';
      case 'text': return 'ghost';
      default: return 'ghost';
    }
  };

  return (
    <Button
      variant={mapVariant(variant)}
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </Button>
  );
};

export default Dialog;