import React from 'react';

import { Button, ButtonVariant } from '@/components/ui/Button';
import { Icon as IconPrimitive } from '@/components/ui/Icon';

import { RibbonItem } from '../../ui/ribbonConfig';

import { getTooltip } from './ribbonUtils';

interface RibbonSmallButtonProps {
  item: RibbonItem;
  isActive: boolean;
  onClick: (item: RibbonItem) => void;
  width?: string; // Optional width override
}

/**
 * A standardized small button for the ribbon (height 24px).
 * Used in Grids, Stacks, or dense layouts.
 */
export const RibbonSmallButton: React.FC<RibbonSmallButtonProps> = ({
  item,
  isActive,
  onClick,
  width = 'w-28', // Default width for grid/stack items
}) => {
  const Icon = item.icon;
  const isTool = item.kind === 'tool';
  const isStub = item.status === 'stub';

  // Variant Mapping
  let variant: ButtonVariant = 'secondary';
  if (isActive) {
    variant = 'primary';
  }

  const tooltip = getTooltip(item);

  const hoverClass =
    !isActive && item.actionId === 'delete'
      ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
      : '';

  const buttonWidth = item.hideLabel ? 'w-9' : width;
  const justifyClass = item.hideLabel ? 'justify-center px-0' : 'justify-start px-2.5';

  return (
    <Button
      variant={variant}
      size="sm"
      className={`${buttonWidth} !h-[24px] ${justifyClass} ${hoverClass}`}
      disabled={isStub}
      onClick={() => onClick(item)}
      title={tooltip}
      aria-pressed={isTool ? isActive : undefined}
      leftIcon={!item.hideLabel && Icon ? <IconPrimitive icon={Icon} size="sm" /> : undefined}
    >
      {item.hideLabel && Icon ? (
        <IconPrimitive icon={Icon} size="sm" />
      ) : (
        <span className="truncate flex-1 text-left">{item.label}</span>
      )}
    </Button>
  );
};