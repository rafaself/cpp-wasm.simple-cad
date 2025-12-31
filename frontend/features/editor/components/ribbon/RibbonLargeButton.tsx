import React from 'react';

import { RibbonItem } from '../../ui/ribbonConfig';

import { getTooltip, getRibbonButtonColorClasses, RIBBON_ICON_SIZES } from './ribbonUtils';

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

  // Large Button Specific Styles
  const heightClass = 'h-full';
  const flexClass = 'flex flex-col justify-center items-center gap-1';
  const textClass = 'text-[10px] leading-tight text-center line-clamp-2 break-words max-w-full';

  // Colors & Interaction - using centralized utility
  const colorClass = getRibbonButtonColorClasses({
    isActive,
    isStub,
    actionId: item.actionId,
  });

  const tooltip = getTooltip(item);

  return (
    <button
      onClick={() => !isStub && onClick(item)}
      className={`relative rounded transition-colors duration-200 ${widthClass} ${heightClass} ${flexClass} px-2.5 ${colorClass} ${textClass}`}
      title={tooltip}
      aria-disabled={isStub}
      aria-pressed={isTool ? isActive : undefined}
    >
      {Icon && <Icon size={RIBBON_ICON_SIZES.lg} className="shrink-0" />}
      <span className="pointer-events-none truncate">{item.label}</span>
    </button>
  );
};

