import { CommandOp } from '@/engine/core/EngineRuntime';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import type { EngineRuntime } from '../../types';
import type { SelectionInteractionState } from './selectionTypes';

type SelectionKeyContext = {
  runtime: EngineRuntime | null;
  state: SelectionInteractionState;
  setState: (state: SelectionInteractionState) => void;
  clearPointerDown: () => void;
  notifyChange: () => void;
};

export const handleSelectionKeyDown = (
  ctx: SelectionKeyContext,
  e: KeyboardEvent,
): void => {
  const { runtime, state, setState, clearPointerDown, notifyChange } = ctx;
  if (e.key === 'Escape') {
    if (state.kind === 'transform') {
      if (runtime?.cancelTransform) runtime.cancelTransform();
      else runtime?.apply([{ op: CommandOp.CancelDraft }]);

      cadDebugLog('transform', 'cancel');
      setState({ kind: 'none' });
      clearPointerDown();
    } else {
      if (runtime) {
        runtime.clearSelection();
      }
      cadDebugLog('selection', 'clear');
      setState({ kind: 'none' });
      clearPointerDown();
    }
    notifyChange();
    return;
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (runtime) {
      const selection = runtime.getSelectionIds();
      const commands = Array.from(selection).map((id): any => ({
        op: CommandOp.DeleteEntity,
        id,
      }));

      if (commands.length > 0) {
        runtime.apply(commands as any[]);
      }

      runtime.clearSelection();
      cadDebugLog('selection', 'delete', () => ({ count: selection.length }));
    }
  }
};

export const handleSelectionCancel = (ctx: SelectionKeyContext): void => {
  const { runtime, state, setState, clearPointerDown, notifyChange } = ctx;
  if (state.kind === 'transform' && runtime?.cancelTransform) {
    runtime.cancelTransform();
  }
  cadDebugLog('selection', 'cancel');
  setState({ kind: 'none' });
  clearPointerDown();
  notifyChange();
};
