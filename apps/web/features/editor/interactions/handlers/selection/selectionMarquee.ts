import { MarqueeMode, SelectionMode } from '@/engine/core/EngineRuntime';
import { isDrag } from '@/features/editor/utils/interactionHelpers';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import type { InputEventContext } from '../../types';
import type { SelectionInteractionState, SelectionPointerDown } from './selectionTypes';

export const handleMarqueePointerUp = (
  ctx: InputEventContext,
  state: SelectionInteractionState,
  pointerDown: SelectionPointerDown,
): void => {
  const { runtime, event } = ctx;
  if (!runtime || state.kind !== 'marquee') return;

  if (
    pointerDown &&
    isDrag(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  ) {
    const { start, current, direction } = state.box;
    const x1 = Math.min(start.x, current.x);
    const y1 = Math.min(start.y, current.y);
    const x2 = Math.max(start.x, current.x);
    const y2 = Math.max(start.y, current.y);

    const hitMode = direction === 'LTR' ? MarqueeMode.Window : MarqueeMode.Crossing;

    let mode = SelectionMode.Add;
    if (event.shiftKey) mode = SelectionMode.Toggle;

    if (runtime.marqueeSelect) {
      runtime.marqueeSelect(x1, y1, x2, y2, mode, hitMode);
    } else {
      const selected = runtime.queryMarquee(x1, y1, x2, y2, hitMode);
      runtime.setSelection?.(selected, mode);
    }
    cadDebugLog('selection', 'marquee-commit', () => ({
      mode,
      hitMode,
      x1,
      y1,
      x2,
      y2,
      ids: Array.from(runtime.getSelectionIds()),
    }));
    return;
  }

  if (!event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
    runtime.clearSelection();
    cadDebugLog('selection', 'clear');
  }
};
