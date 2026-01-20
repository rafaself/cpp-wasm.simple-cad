import React from 'react';

import { Button, ButtonVariant } from '@/components/ui/Button';
import { Icon as IconPrimitive } from '@/components/ui/Icon';
import { useRibbonTracking } from '@/utils/analytics/useRibbonTracking';

import { RibbonItem } from '../../ui/ribbonConfig';

import { isRibbonDebugEnabled } from './ribbonDebug';
import { getTooltip } from './ribbonUtils';

interface RibbonSmallButtonProps {
  item: RibbonItem;
  isActive: boolean;
  onClick: (item: RibbonItem) => void;
  width?: string; // Optional width override
  tabId: string;
  groupId: string;
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
  tabId,
  groupId,
}) => {
  const tracking = useRibbonTracking(tabId, groupId);
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

  const debugClass = isRibbonDebugEnabled() ? ' ribbon-debug-control' : '';

  const handleClick = () => {
    const itemType = item.kind === 'custom' ? 'custom' : item.kind;
    const itemId = item.toolId || item.actionId || item.id;
    tracking.trackClick(itemId, itemType);
    onClick(item);
  };

  const hoverEndRef = React.useRef<(() => void) | null>(null);

  return (
      <Button
        variant={variant}
        size="sm"
        className={`${buttonWidth} ${justifyClass} ${hoverClass}${debugClass} h-full`}
        disabled={isStub}
        onClick={handleClick}
        onMouseEnter={() => {
          hoverEndRef.current = tracking.startHoverTimer(item.toolId || item.actionId || item.id);
        }}
        onMouseLeave={() => {
          if (hoverEndRef.current) {
            hoverEndRef.current();
            hoverEndRef.current = null;
          }
        }}
        title={tooltip}
        aria-pressed={isTool ? isActive : undefined}
        aria-label={item.hideLabel ? item.label : undefined}
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
