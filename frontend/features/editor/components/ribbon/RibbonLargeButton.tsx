import React from 'react';

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

  let widthClass = 'min-w-[64px]'; // Default for large button
  if (item.width) {
    widthClass = widthClasses[item.width];
  }

  // Large Button Specific Styles
  const heightClass = 'h-full';
  const flexClass = 'flex flex-col justify-center items-center gap-1';
  const textClass = 'text-[10px] leading-tight text-center line-clamp-2 break-words max-w-full';

  // Colors & Interaction
  let colorClass = 'bg-surface2 text-text border border-transparent focus-outline';

  if (isActive) {
    colorClass = 'bg-primary text-primary-contrast border-primary/20 shadow-sm focus-outline';
  } else if (isStub) {
    colorClass = 'bg-surface2/50 text-text-muted opacity-60 cursor-not-allowed focus-outline';
  } else {
    const hoverClass =
      item.actionId === 'delete'
        ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
        : 'hover:bg-surface1 hover:text-text hover:border-border/50';
    colorClass = `${colorClass} ${hoverClass}`;
  }

  const tooltip = getTooltip(item);

  return (
    <button
      onClick={() => !isStub && onClick(item)}
      className={`relative rounded transition-colors duration-200 ${widthClass} ${heightClass} ${flexClass} px-2.5 ${colorClass} ${textClass}`}
      title={tooltip}
      aria-disabled={isStub}
      aria-pressed={isTool ? isActive : undefined}
    >
      {Icon && <Icon size={20} className="shrink-0" />}
      <span className="pointer-events-none truncate">{item.label}</span>
    </button>
  );
};
