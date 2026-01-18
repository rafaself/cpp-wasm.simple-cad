import { ChevronDown } from 'lucide-react';
import React, { useState } from 'react';
import { Popover } from './Popover';
import { Button } from './Button';

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
  placeholder = 'Select...',
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label || value || placeholder;

  return (
    <Popover
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      matchWidth
      offset={4}
      content={
        <div className="bg-surface-2 border border-border shadow-lg rounded-md overflow-hidden max-h-64 overflow-y-auto py-1 custom-scrollbar">
          {options.map((option) => (
            <div
              key={option.value}
              className={`px-3 py-2 text-xs text-text cursor-pointer transition-colors ${
                option.value === value
                  ? 'bg-primary/20 text-primary font-medium'
                  : 'hover:bg-primary/10 hover:text-text'
              }`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-muted">No options</div>
          )}
        </div>
      }
    >
      <Button
        variant="outline"
        size="sm" // Use standard small size
        className={`w-full !justify-between font-normal ${className}`}
        disabled={disabled}
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
