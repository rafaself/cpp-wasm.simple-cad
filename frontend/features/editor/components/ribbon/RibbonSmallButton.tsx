import React from 'react';

import { RibbonItem } from '../../ui/ribbonConfig';

import { getTooltip, getRibbonButtonColorClasses, RIBBON_ICON_SIZES } from './ribbonUtils';

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

  // Fixed height for small buttons, forced to override defaults
  const heightClass = '!h-[24px] min-h-[24px] max-h-[24px]';
  
  // Flex layout
  const flexClass = 'flex flex-row items-center gap-2';
  const justifyClass = 'justify-start px-2.5';
  
  // Typography
  const textClass = 'text-xs whitespace-nowrap truncate text-left flex-1';

  // Colors
  const colorClass = getRibbonButtonColorClasses({
    isActive,
    isStub,
    actionId: item.actionId,
  });

  const tooltip = getTooltip(item);
  const buttonClasses = `relative rounded transition-colors duration-200 ${width} ${heightClass} ${flexClass} ${justifyClass} ${colorClass}`;

  return (
    <button
      onClick={() => !isStub && onClick(item)}
      className={`${buttonClasses} ${textClass}`}
      title={tooltip}
      aria-disabled={isStub}
      aria-pressed={isTool ? isActive : undefined}
    >
      {Icon && (
        <div className="w-4 flex items-center justify-center shrink-0">
          <Icon size={RIBBON_ICON_SIZES.sm} className="shrink-0" />
        </div>
      )}
      <span className="pointer-events-none truncate">{item.label}</span>
      {/* Optional: Add shortcut badge here if needed */}
    </button>
  );
};
