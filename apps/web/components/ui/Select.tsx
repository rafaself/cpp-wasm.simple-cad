import { ChevronDown } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { LABELS } from '@/i18n/labels';

import { Button } from './Button';
import { Popover } from './Popover';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const Select: React.FC<SelectProps> = ({
  value,
  onChange,
  options,
  placeholder = LABELS.common.selectPlaceholder,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<number>(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useMemo(() => `select-list-${Math.random().toString(36).slice(2)}`, []);

  const selectedLabel = options.find((o) => o.value === value)?.label || placeholder;

  const close = () => {
    setIsOpen(false);
    setHighlighted(-1);
  };

  // Keyboard navigation on trigger
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!isOpen && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
      e.preventDefault();
      setIsOpen(true);
      setHighlighted(
        Math.max(
          0,
          options.findIndex((o) => o.value === value),
        ),
      );
      return;
    }
    if (!isOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((prev) => {
        const next = prev + 1;
        return next >= options.length ? 0 : next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((prev) => {
        const next = prev - 1;
        return next < 0 ? options.length - 1 : next;
      });
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (highlighted >= 0 && options[highlighted]) {
        onChange(options[highlighted].value);
      }
      close();
    }
  };

  // Reset highlight when options change
  useEffect(() => {
    if (!isOpen) setHighlighted(-1);
  }, [isOpen, options.length]);

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setHighlighted(-1);
      }}
      matchWidth
      offset={4}
      content={
        <div
          id={listId}
          role="listbox"
          className="bg-surface-2 border border-border shadow-lg rounded-md overflow-hidden max-h-64 overflow-y-auto py-1 custom-scrollbar"
        >
          {options.map((option, idx) => {
            const isSelected = option.value === value;
            const isActive = idx === highlighted;
            return (
              <div
                key={option.value}
                role="option"
                aria-selected={isSelected}
                id={`${listId}-option-${idx}`}
                className={`px-3 py-2 text-xs text-text cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/20 text-primary font-medium hover:bg-primary/25'
                    : 'hover:bg-primary/10 hover:text-text'
                } ${isActive ? 'bg-primary/15' : ''}`}
                onMouseEnter={() => setHighlighted(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  close();
                }}
              >
                {option.label}
              </div>
            );
          })}
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">Nenhuma opção</div>
          )}
        </div>
      }
    >
      <Button
        ref={triggerRef}
        variant="outline"
        size="sm"
        className={`w-full !justify-between font-normal ${className}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={
          isOpen && highlighted >= 0 ? `${listId}-option-${highlighted}` : undefined
        }
        onKeyDown={handleKeyDown}
        onClick={() => (disabled ? undefined : setIsOpen((o) => !o))}
        rightIcon={
          <ChevronDown
            size={14}
            className={`text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        }
      >
        <span className="truncate">{selectedLabel}</span>
      </Button>
    </Popover>
  );
};
