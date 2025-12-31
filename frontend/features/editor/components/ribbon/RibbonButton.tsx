import React from 'react';

import { RibbonItem } from '../../ui/ribbonConfig';

import { RibbonLargeButton } from './RibbonLargeButton';
import { getBindingId, getTooltip } from './ribbonUtils';



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

  const Icon = item.icon;
  const isTool = item.kind === 'tool';
  const isStub = item.status === 'stub';

  // Layout Logic (Standard/Small)
  const isGrid = layout === 'grid-2x3';
  const isStack = layout === 'stack';

  // Sizing Logic
  const widthClasses = {
    sm: 'w-14',
    md: 'w-20',
    lg: 'w-32',
    auto: 'w-auto',
  };

  let widthClass = 'w-auto';
  if (item.width) {
    widthClass = widthClasses[item.width];
  } else if (isGrid) {
    widthClass = 'w-28';
  } else if (isStack) {
    widthClass = 'w-28';
  }

  // Height Logic
  // Match --ribbon-item-height (24px) for grid/stack, 32px or 24px default otherwise?
  // Previous logic was h-8 (32px) default, h-[24px] for grid/stack.
  // With the "Compact Mode" active (24px lines), h-8 might be too tall for single row?
  // Actually ribbon-row forces 24px.
  // Let's stick to the previous conditional logic but cleaned up.
  let heightClass = 'h-8';
  if (isGrid || isStack) heightClass = 'h-[24px]';

  // Flex Structure
  const flexClass = 'flex flex-row items-center gap-2';
  const justifyClass = 'justify-start px-2.5';

  // Typography
  const textClass = 'text-xs whitespace-nowrap truncate text-left flex-1';

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

  if (!Icon) {
    return (
      <button
        onClick={() => !isStub && onClick(item)}
        className={`relative rounded transition-colors duration-200 ${widthClass} ${heightClass} ${flexClass} ${justifyClass} ${colorClass} ${textClass}`}
        title={tooltip}
        aria-disabled={isStub}
        aria-pressed={isTool ? isActive : undefined}
      >
        <span className="pointer-events-none truncate">{item.label}</span>
      </button>
    );
  }

  return (
    <button
      onClick={() => !isStub && onClick(item)}
      className={`relative rounded transition-colors duration-200 ${widthClass} ${heightClass} ${flexClass} ${justifyClass} ${colorClass} ${textClass}`}
      title={tooltip}
      aria-disabled={isStub}
      aria-pressed={isTool ? isActive : undefined}
    >
      <div className="w-5 flex items-center justify-center shrink-0">
        <Icon size={15} className="shrink-0" />
      </div>
      <span className="pointer-events-none truncate">{item.label}</span>
    </button>
  );
};
