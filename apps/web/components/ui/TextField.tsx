import React, { forwardRef, useId } from 'react';

import { Input, type InputProps } from './Input';

export interface TextFieldProps extends InputProps {
  label?: string;
  helperText?: string;
  errorText?: string;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, helperText, errorText, id, className = '', ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = [];
  if (errorText) {
    describedBy.push(`${inputId}-error`);
  } else if (helperText) {
    describedBy.push(`${inputId}-helper`);
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="text-xs font-medium text-text">
          {label}
        </label>
      )}
      <Input
        id={inputId}
        ref={ref}
        aria-describedby={describedBy.length ? describedBy.join(' ') : undefined}
        error={!!errorText || props.error}
        className={className}
        {...props}
      />
      {errorText ? (
        <span id={`${inputId}-error`} className="text-xs text-error">
          {errorText}
        </span>
      ) : helperText ? (
        <span id={`${inputId}-helper`} className="text-xs text-text-muted">
          {helperText}
        </span>
      ) : null}
    </div>
  );
});

TextField.displayName = 'TextField';
