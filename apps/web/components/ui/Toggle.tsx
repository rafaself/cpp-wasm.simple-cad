import React from 'react';

interface SwitchProps {
  label?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  label,
  checked,
  onChange,
  className = '',
  description,
  disabled = false,
  id,
}) => (
  <label
    className={`flex items-start gap-3 cursor-pointer select-none ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
    htmlFor={id}
  >
    <input
      id={id}
      type="checkbox"
      className="sr-only"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      aria-checked={checked}
      role="switch"
    />
    <span
      aria-hidden="true"
      className={`relative inline-flex h-5 w-10 flex-shrink-0 rounded-full border border-border/60 transition-colors duration-150 ${
        checked ? 'bg-primary border-primary' : 'bg-surface-2'
      } ${disabled ? 'opacity-70' : ''}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-150 ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </span>
    <span className="flex flex-col leading-tight">
      {label && <span className="text-sm text-text">{label}</span>}
      {description && <span className="text-xs text-text-muted">{description}</span>}
    </span>
  </label>
);

// Backward-compatible export
export const Toggle = Switch;
