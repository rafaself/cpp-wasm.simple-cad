import React from 'react';

import { Button, ButtonVariant } from '@/components/ui/Button';
import { Icon as IconPrimitive } from '@/components/ui/Icon';

import { RibbonItem } from '../../ui/ribbonConfig';

import { isRibbonDebugEnabled } from './ribbonDebug';
import { RibbonLargeButton } from './RibbonLargeButton';
import { RibbonSmallButton } from './RibbonSmallButton';
import { getTooltip } from './ribbonUtils';

interface RibbonButtonProps {
  item: RibbonItem;
  layout?: 'flex-row' | 'grid-2x3' | 'stack';
  isActive: boolean;
  onClick: (item: RibbonItem) => void;
}

export const RibbonButton: React.FC<RibbonButtonProps> = ({ item, layout, isActive, onClick }) => {
  // Delegate to RibbonLargeButton if variant is large
  if (item.variant === 'large') {
    return <RibbonLargeButton item={item} isActive={isActive} onClick={onClick} />;
  }

  // Layout Logic
  const isGrid = layout === 'grid-2x3';
  const isStack = layout === 'stack';

  // Delegate to RibbonSmallButton for dense layouts
  if (isGrid || isStack) {
    return <RibbonSmallButton item={item} isActive={isActive} onClick={onClick} />;
  }

  // Standard Button (Flex Row / Default) - h-8 (32px)
  const Icon = item.icon;
  const isTool = item.kind === 'tool';
  const isStub = item.status === 'stub';

  const widthClasses = {
    sm: 'w-14',
    md: 'w-20',
    lg: 'w-32',
    auto: 'w-auto',
  };

  const widthClass = item.hideLabel ? 'w-9' : item.width ? widthClasses[item.width] : 'w-auto';

  const tooltip = getTooltip(item);

  // Variant Mapping
  let variant: ButtonVariant = 'secondary';
  if (isActive) {
    variant = 'primary';
  } else if (item.actionId === 'delete') {
    // Custom handling for delete if needed, or stick to secondary with hover override
    // Button primitive doesn't support 'hover-danger' on secondary easily without className override
    // We can use className for specific hover effect
  }

  const hoverClass =
    !isActive && item.actionId === 'delete'
      ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
      : '';

  const debugClass = isRibbonDebugEnabled() ? ' ribbon-debug-control' : '';

  const justifyClass = item.hideLabel ? 'justify-center px-0' : 'justify-start px-2.5';

  return (
    <Button
      variant={variant}
      size="md"
      className={`${widthClass} ${justifyClass} ${hoverClass}${debugClass}`}
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
