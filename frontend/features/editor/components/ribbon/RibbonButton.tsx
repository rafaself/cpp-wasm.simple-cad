import React from 'react';

import { getShortcutLabel } from '@/config/keybindings';

import { RibbonItem } from '../../ui/ribbonConfig';

// Helper to map Ribbon IDs to Keybinding IDs
const getBindingId = (item: RibbonItem): string | undefined => {
  if (item.kind === 'tool' && item.toolId) {
    if (item.toolId === 'select') return 'tools.select';
    if (item.toolId === 'line') return 'tools.line';
    if (item.toolId === 'polyline') return 'tools.polyline';
    if (item.toolId === 'rect') return 'tools.rect';
    if (item.toolId === 'circle') return 'tools.circle';
    if (item.toolId === 'polygon') return 'tools.polygon';
    if (item.toolId === 'text') return 'tools.text';
    if (item.toolId === 'measure') return 'tools.measure';
    if (item.toolId === 'pan') return 'nav.pan';
  }
  if (item.kind === 'action' && item.actionId) {
    if (item.actionId === 'undo') return 'editor.undo';
    if (item.actionId === 'redo') return 'editor.redo';
    if (item.actionId === 'delete') return 'editor.delete';
    if (item.actionId === 'zoom-to-fit') return 'nav.zoomFit';
  }
  return undefined;
};

interface RibbonButtonProps {
  item: RibbonItem;
  layout?: 'flex-row' | 'grid-2x3' | 'stack';
  isActive: boolean;
  onClick: (item: RibbonItem) => void;
}

export const RibbonButton: React.FC<RibbonButtonProps> = ({ item, layout, isActive, onClick }) => {
  const Icon = item.icon;
  const isTool = item.kind === 'tool';
  const isStub = item.status === 'stub';

  // Layout Logic
  const isVertical = item.variant === 'large';
  const isGrid = layout === 'grid-2x3';
  const isStack = layout === 'stack';

  // Sizing Logic
  const widthClasses = {
    sm: 'w-14', // Compact
    md: 'w-20', // Standard
    lg: 'w-32', // Wide
    auto: 'w-auto', // Self-sizing
  };

  // Determine effective width
  let widthClass = 'w-auto';
  if (item.width) {
    widthClass = widthClasses[item.width];
  } else if (isVertical) {
    widthClass = 'flex-1 min-w-[4rem]'; // Flexible width, min 64px
  } else if (isGrid) {
    widthClass = 'w-28'; // Fixed width for grid items
  } else if (isStack) {
    widthClass = 'w-28';
  }

  // Height Logic
  let heightClass = 'h-8';
  if (isVertical) heightClass = 'h-full'; // Fill available height
  if (isGrid || isStack) heightClass = 'h-[24px]'; // Match --ribbon-item-height

  // Flex Structure
  const flexClass = isVertical
    ? 'flex flex-col justify-center items-center gap-1'
    : 'flex flex-row items-center gap-2';

  // Override justify for specific horizontal layouts if needed
  const justifyClass = !isVertical ? 'justify-start px-2.5' : 'justify-center px-2';

  // Typography & Text Wrapping
  const textClass = isVertical
    ? 'text-[10px] leading-tight text-center line-clamp-2 break-words max-w-full'
    : 'text-xs whitespace-nowrap truncate text-left flex-1';

  // Colors & Interaction (Design Tokens)
  // Primary: primary token for selection
  // Surface: surface2 (ribbon panel)
  let colorClass = 'bg-surface2 text-text border border-transparent focus-outline';

  if (isActive) {
    colorClass = 'bg-primary text-primary-contrast border-primary/20 shadow-sm focus-outline';
  } else if (isStub) {
    colorClass = 'bg-surface2/50 text-text-muted opacity-60 cursor-not-allowed focus-outline';
  } else {
    // Hover State
    const hoverClass =
      item.actionId === 'delete'
        ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
        : 'hover:bg-surface1 hover:text-text hover:border-border/50';
    colorClass = `${colorClass} ${hoverClass}`;
  }

  // Tooltip
  const bindingId = getBindingId(item);
  const shortcut = bindingId ? getShortcutLabel(bindingId) : '';
  const tooltip = isStub
    ? `${item.label} — Em breve`
    : shortcut
      ? `${item.label} (${shortcut})`
      : item.label;

  if (!Icon) {
    return (
      <button
        onClick={() => !isStub && onClick(item)}
        className={`relative rounded-md transition-colors duration-200 ${widthClass} ${heightClass} ${flexClass} ${justifyClass} ${colorClass} ${textClass}`}
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
      className={`relative rounded-md transition-colors duration-200 ${widthClass} ${heightClass} ${flexClass} ${justifyClass} ${colorClass} ${textClass}`}
      title={tooltip}
      aria-disabled={isStub}
      aria-pressed={isTool ? isActive : undefined}
    >
      {!isVertical ? (
        <div className="w-5 flex items-center justify-center shrink-0">
          <Icon size={15} className="shrink-0" />
        </div>
      ) : (
        <Icon size={20} className="shrink-0" />
      )}

      <span className="pointer-events-none truncate">{item.label}</span>
    </button>
  );
};
