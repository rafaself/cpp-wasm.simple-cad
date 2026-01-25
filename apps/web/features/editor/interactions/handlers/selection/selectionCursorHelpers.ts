import {
  getRotationCursorAngleForHandle,
  getResizeCursorAngleForHandle,
} from '@/features/editor/config/cursor-config';

import type { InputEventContext, EngineRuntime } from '../../types';
import type { SelectionCursorState } from './SelectionCursorState';

export const updateRotationCursor = (
  cursorState: SelectionCursorState,
  hoverSubIndex: number,
  runtime: EngineRuntime,
  ctx: InputEventContext,
): void => {
  const selection = runtime.getSelectionIds();
  if (selection.length !== 1) return;

  const transform = runtime.getEntityTransform(selection[0]);
  const rotationDeg = transform.valid ? transform.rotationDeg : 0;

  const angle = getRotationCursorAngleForHandle(hoverSubIndex, rotationDeg);
  cursorState.showRotationAt(ctx.screenPoint, angle);
};

export const updateResizeCursor = (
  cursorState: SelectionCursorState,
  hoverSubIndex: number,
  runtime: EngineRuntime,
  ctx: InputEventContext,
): void => {
  const selection = runtime.getSelectionIds();
  if (selection.length !== 1) return;

  const transform = runtime.getEntityTransform(selection[0]);
  const rotationDeg = transform.valid ? transform.rotationDeg : 0;

  const angle = getResizeCursorAngleForHandle(hoverSubIndex, rotationDeg);
  cursorState.showResizeAt(ctx.screenPoint, angle);
};
