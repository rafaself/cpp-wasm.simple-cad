import React from 'react';

import { Button, ButtonVariant } from '@/components/ui/Button';
import { Icon as IconPrimitive } from '@/components/ui/Icon';

import { RibbonItem } from '../../ui/ribbonConfig';

import { getTooltip } from './ribbonUtils';

interface RibbonLargeButtonProps {
  item: RibbonItem;
  isActive: boolean;
  onClick: (item: RibbonItem) => void;
}

export const RibbonLargeButton: React.FC<RibbonLargeButtonProps> = ({
  item,
  isActive,
  onClick,
}) => {
  const Icon = item.icon;
  const isTool = item.kind === 'tool';
  const isStub = item.status === 'stub';

  // Sizing Logic
  const widthClasses = {
    sm: 'w-14',
    md: 'w-20',
    lg: 'w-32',
    auto: 'w-auto',
  };

  const widthClass = item.width ? widthClasses[item.width] : 'min-w-[64px]';

  // Variant Mapping
  let variant: ButtonVariant = 'ghost'; // Default for large buttons usually (or secondary)
  // Legacy used 'bg-surface-2' which is secondary.
  variant = 'secondary';
  
  if (isActive) {
    variant = 'primary';
  }

  const tooltip = getTooltip(item);

  const hoverClass =
    !isActive && item.actionId === 'delete'
      ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
      : '';

  return (
    <Button
      variant={variant}
      className={`h-[52px] flex-col justify-center gap-1 px-2.5 py-1 ${widthClass} ${hoverClass}`}
      disabled={isStub}
      onClick={() => onClick(item)}
      title={tooltip}
      aria-pressed={isTool ? isActive : undefined}
    >
      {Icon && <IconPrimitive icon={Icon} size="lg" />}
      <span className="text-[10px] leading-tight text-center line-clamp-2 break-words max-w-full pointer-events-none">
        {item.label}
      </span>
    </Button>
  );
};
