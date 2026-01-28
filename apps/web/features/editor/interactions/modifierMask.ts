import { SelectionModifier } from '@/engine/core/EngineRuntime';

export type ModifierKeyState = {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

export const buildModifierMask = (event: ModifierKeyState): number => {
  let mask = 0;
  if (event.shiftKey) mask |= SelectionModifier.Shift;
  if (event.ctrlKey) mask |= SelectionModifier.Ctrl;
  if (event.altKey) mask |= SelectionModifier.Alt;
  if (event.metaKey) mask |= SelectionModifier.Meta;
  return mask;
};
