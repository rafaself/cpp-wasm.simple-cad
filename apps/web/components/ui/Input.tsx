import React, { forwardRef, InputHTMLAttributes } from 'react';

export type InputSize = 'sm' | 'md';
export type InputVariant = 'outline' | 'filled';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  inputSize?: InputSize;
  variant?: InputVariant;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: boolean;
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-7 text-xs px-2',
  md: 'h-9 text-sm px-3',
};

const variantStyles: Record<InputVariant, string> = {
  outline:
    'bg-transparent border border-border focus:border-primary focus:ring-1 focus:ring-primary/20',
  filled: 'bg-surface-2 border border-transparent focus:bg-surface-1 focus:border-primary',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = '',
      inputSize = 'md',
      variant = 'outline',
      leftIcon,
      rightIcon,
      error = false,
      disabled,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'flex w-full rounded-md transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-text-muted focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50';

    const errorStyles = error ? 'border-error focus:border-error focus:ring-error/20' : '';

    return (
      <div className="relative flex items-center w-full">
        {leftIcon && (
          <div className="absolute left-2 flex items-center justify-center pointer-events-none text-text-muted">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          className={`
            ${baseStyles}
            ${sizeStyles[inputSize]}
            ${variantStyles[variant]}
            ${errorStyles}
            ${leftIcon ? 'pl-8' : ''}
            ${rightIcon ? 'pr-8' : ''}
            ${className}
          `}
          disabled={disabled}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-2 flex items-center justify-center pointer-events-none text-text-muted">
            {rightIcon}
          </div>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
