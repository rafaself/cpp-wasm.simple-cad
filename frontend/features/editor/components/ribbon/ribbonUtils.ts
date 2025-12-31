import { getShortcutLabel } from '@/config/keybindings';

import { RibbonItem } from '../../ui/ribbonConfig';

// ============================================================================
// ICON SIZE TOKENS
// Standardized icon sizes for ribbon elements
// ============================================================================
export const RIBBON_ICON_SIZES = {
  /** Large buttons (20px) */
  lg: 20,
  /** Standard buttons (16px) */
  md: 16,
  /** Small/compact buttons (14px) */
  sm: 14,
} as const;

// ============================================================================
// BUTTON STYLE UTILITIES
// Centralized styling logic to avoid duplication
// ============================================================================

interface RibbonButtonStyleOptions {
  isActive: boolean;
  isStub: boolean;
  actionId?: string;
}

/**
 * Generates consistent color classes for ribbon buttons based on state.
 * Eliminates duplication between RibbonButton and RibbonLargeButton.
 */
export const getRibbonButtonColorClasses = ({
  isActive,
  isStub,
  actionId,
}: RibbonButtonStyleOptions): string => {
  if (isActive) {
    return 'bg-primary text-primary-contrast border-primary/20 shadow-sm focus-outline';
  }
  
  if (isStub) {
    return 'bg-surface2/50 text-text-muted opacity-60 cursor-not-allowed focus-outline';
  }
  
  // Default state with hover
  const hoverClass = actionId === 'delete'
    ? 'hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400'
    : 'hover:bg-surface1 hover:text-text hover:border-border/50';
  
  return `bg-surface2 text-text border border-transparent focus-outline ${hoverClass}`;
};

// Helper to map Ribbon IDs to Keybinding IDs
export const getBindingId = (item: RibbonItem): string | undefined => {
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

export const getTooltip = (item: RibbonItem): string => {
  const bindingId = getBindingId(item);
  const shortcut = bindingId ? getShortcutLabel(bindingId) : '';
  return item.status === 'stub'
    ? `${item.label} — Em breve`
    : shortcut
      ? `${item.label} (${shortcut})`
      : item.label;
};
