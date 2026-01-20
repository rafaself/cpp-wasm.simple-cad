import React from 'react';

import { Button, ButtonVariant } from '@/components/ui/Button';
import { Icon as IconPrimitive } from '@/components/ui/Icon';
import { useRibbonTracking } from '@/utils/analytics/useRibbonTracking';

import { RibbonItem } from '../../ui/ribbonConfig';

import { isRibbonDebugEnabled } from './ribbonDebug';
import { getTooltip } from './ribbonUtils';

interface RibbonLargeButtonProps {
  item: RibbonItem;
  isActive: boolean;
  onClick: (item: RibbonItem) => void;
  tabId: string;
  groupId: string;
}

export const RibbonLargeButton: React.FC<RibbonLargeButtonProps> = ({
  item,
  isActive,
  onClick,
  tabId,
  groupId,
}) => {
  const tracking = useRibbonTracking(tabId, groupId);
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
        className={`ribbon-large-button flex-col justify-center gap-1 px-2.5 py-1 ${widthClass} ${hoverClass}${debugClass}`}
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
      >
        {Icon && <IconPrimitive icon={Icon} size="lg" />}
        <span className="ribbon-large-label">{item.label}</span>
        </Button>
    );
};
