import { getShortcutLabel } from '@/config/keybindings';

import { RibbonItem } from '../../ui/ribbonConfig';

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
