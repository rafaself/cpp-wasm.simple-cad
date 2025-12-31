import React from 'react';

import { RibbonItem } from '../../ui/ribbonConfig';

import { RibbonLargeButton } from './RibbonLargeButton';
import { getTooltip, getRibbonButtonColorClasses, RIBBON_ICON_SIZES } from './ribbonUtils';

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
  } else if (isGrid || isStack) {
    widthClass = 'w-28';
  }

  // Height Logic - ribbon-row forces 24px for grid/stack
  const heightClass = isGrid || isStack ? 'h-[24px]' : 'h-8';

  // Flex Structure
  const flexClass = 'flex flex-row items-center gap-2';
  const justifyClass = 'justify-start px-2.5';

  // Typography
  const textClass = 'text-xs whitespace-nowrap truncate text-left flex-1';

  // Colors & Interaction - using centralized utility
  const colorClass = getRibbonButtonColorClasses({
    isActive,
    isStub,
    actionId: item.actionId,
  });

  const tooltip = getTooltip(item);

  const buttonClasses = `relative rounded transition-colors duration-200 ${widthClass} ${heightClass} ${flexClass} ${justifyClass} ${colorClass}`;

  if (!Icon) {
    return (
      <button
        onClick={() => !isStub && onClick(item)}
        className={`${buttonClasses} ${textClass}`}
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
      className={`${buttonClasses} ${textClass}`}
      title={tooltip}
      aria-disabled={isStub}
      aria-pressed={isTool ? isActive : undefined}
    >
      <div className="w-5 flex items-center justify-center shrink-0">
        <Icon size={RIBBON_ICON_SIZES.sm} className="shrink-0" />
      </div>
      <span className="pointer-events-none truncate">{item.label}</span>
    </button>
  );
};

