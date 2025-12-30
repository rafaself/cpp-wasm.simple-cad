import React from 'react';
import { RibbonItem } from '../../ui/ribbonConfig';
import { getShortcutLabel } from '@/config/keybindings';

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

export const RibbonButton: React.FC<RibbonButtonProps> = ({
  item,
  layout,
  isActive,
  onClick,
}) => {
  const Icon = item.icon;
  const isTool = item.kind === 'tool';
  const isStub = item.status === 'stub';
  
  // Layout Logic
  const isVertical = item.variant === 'large';
  const isGrid = layout === 'grid-2x3';
  const isStack = layout === 'stack';
  
  // Sizing Logic
  const widthClasses = {
    sm: 'w-14',    // Compact
    md: 'w-20',    // Standard
    lg: 'w-32',    // Wide
    auto: 'w-auto' // Self-sizing
  };
  
  // Determine effective width
  let widthClass = 'w-auto';
  if (item.width) {
    widthClass = widthClasses[item.width];
  } else if (isVertical) {
    widthClass = 'w-16'; // Default for vertical buttons
  } else if (isGrid) {
    widthClass = 'w-full'; // Grid items fill their cell
  } else if (isStack) {
     // Stack items default to auto but might need min-width
     widthClass = 'w-full min-w-[32px]';
  }

  // Height Logic
  let heightClass = 'h-8';
  if (isVertical) heightClass = 'h-[54px]';
  if (isGrid || isStack) heightClass = 'h-[24px]'; // Match 24+24+6 = 54px container limit

  // Flex Structure
  const flexClass = isVertical 
    ? 'flex flex-col justify-center items-center gap-1' 
    : 'flex flex-row items-center justify-center gap-2';
    
  // Override justify for specific horizontal layouts if needed
  const justifyClass = (!isVertical && (isGrid || isStack)) ? 'justify-start px-2' : 'justify-center px-2';

  // Typography & Text Wrapping
  const textClass = isVertical
    ? 'text-[10px] leading-tight text-center line-clamp-2 break-words max-w-full'
    : 'text-xs whitespace-nowrap truncate';

  // Colors & Interaction (Design Tokens)
  // Primary: blue-500 (#3b82f6) for selection
  // Surface: slate-800
  // Danger: only on hover/specifics? We'll use slate-700 hover usually.
  let colorClass = 'bg-slate-800 text-slate-200 border border-transparent';
  
  if (isActive) {
    colorClass = 'bg-blue-500 text-white shadow-sm ring-1 ring-blue-400/50';
  } else if (isStub) {
    colorClass = 'bg-slate-800/50 text-slate-500 opacity-60 cursor-not-allowed';
  } else {
    // Hover State
    const hoverClass = item.actionId === 'delete' 
      ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400' 
      : 'hover:bg-slate-700 hover:text-white hover:border-slate-600/50';
    colorClass = `${colorClass} ${hoverClass}`;
  }

  // Tooltip
  const bindingId = getBindingId(item);
  const shortcut = bindingId ? getShortcutLabel(bindingId) : '';
  const tooltip = isStub 
    ? `${item.label} — Em breve` 
    : shortcut ? `${item.label} (${shortcut})` : item.label;

  return (
    <button
      onClick={() => !isStub && onClick(item)}
      className={`relative rounded-md transition-all duration-150 ${widthClass} ${heightClass} ${flexClass} ${justifyClass} ${colorClass} ${textClass}`}
      title={tooltip}
      aria-disabled={isStub}
      aria-pressed={isTool ? isActive : undefined}
    >
      <Icon size={isVertical ? 20 : 15} className="shrink-0" />
      {/* Show label unless it's an icon-only variant (if we had one) */}
      <span className="pointer-events-none">
        {item.label}
      </span>
    </button>
  );
};
