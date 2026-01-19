import React, { forwardRef } from 'react';

import { Button, type ButtonProps } from './Button';

type IconButtonSize = 'sm' | 'md';
type IconButtonTone = 'default' | 'primary' | 'danger' | 'secondary';

export interface IconButtonProps extends Omit<
  ButtonProps,
  'children' | 'size' | 'variant' | 'leftIcon' | 'rightIcon'
> {
  icon: React.ReactNode;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  'aria-label': string;
  pressed?: boolean;
}

const toneToVariant: Record<IconButtonTone, ButtonProps['variant']> = {
  default: 'ghost',
  secondary: 'secondary',
  primary: 'primary',
  danger: 'danger',
};

const sizeToButtonSize: Record<IconButtonSize, ButtonProps['size']> = {
  sm: 'sm',
  md: 'icon',
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, tone = 'default', size = 'md', className = '', pressed, ...props },
  ref,
) {
  return (
    <Button
      ref={ref}
      variant={toneToVariant[tone]}
      size={sizeToButtonSize[size]}
      aria-pressed={pressed}
      className={`p-0 ${className}`}
      {...props}
    >
      {icon}
    </Button>
  );
});

IconButton.displayName = 'IconButton';
