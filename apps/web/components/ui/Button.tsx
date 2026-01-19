import { Loader2 } from 'lucide-react';
import React, { ButtonHTMLAttributes, forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-contrast hover:bg-primary-hover shadow-sm',
  secondary: 'bg-secondary text-text hover:bg-secondary-hover shadow-sm',
  outline: 'border border-border bg-transparent hover:bg-surface-2 text-text',
  ghost: 'bg-transparent hover:bg-surface-2 text-text-muted hover:text-text',
  danger: 'bg-error text-white hover:bg-red-600 shadow-sm',
  link: 'text-primary underline-offset-4 hover:underline bg-transparent p-0 h-auto',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 text-xs',
  md: 'h-8 px-3 text-sm',
  lg: 'h-10 px-4 text-base',
  icon: 'h-8 w-8 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      type,
      ...props
    },
    ref,
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1 disabled:pointer-events-none disabled:opacity-50';

    return (
      <button
        ref={ref}
        type={type ?? 'button'}
        className={`
          ${baseStyles}
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!isLoading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';
