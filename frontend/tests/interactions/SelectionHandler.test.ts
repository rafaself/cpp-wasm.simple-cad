import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionMode } from '@/engine/core/protocol';
import { TransformMode } from '@/engine/core/interactionSession';
import { InteractionHarness } from '@/test-utils/interactionHarness';

describe('SelectionHandler', () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = new InteractionHarness({ activeTool: 'select' });
  });

  it('selects a single entity on click and commits transform', () => {
    harness.runtime.setPickResult({ id: 42, subIndex: 0 });

    harness.pointerDown({ x: 10, y: 10 });
    harness.pointerUp({ x: 10, y: 10 });

    expect(harness.runtime.getSelectionIds()).toEqual([42]);
    expect(harness.runtime.transformSessions.begun).toBe(1);
    expect(harness.runtime.transformSessions.lastBegin?.mode).toBe(TransformMode.Move);
    expect(harness.runtime.transformSessions.committed).toBe(1);
  });

  it('uses add mode when dragging marquee with shift held', () => {
    harness.runtime.setSelection([1], SelectionMode.Replace);
    harness.runtime.setMarqueeReturn([2, 3]);

    harness.pointerDown({ x: 0, y: 0, shiftKey: true });
    harness.pointerMove({ x: 10, y: 0, shiftKey: true });
    harness.pointerUp({ x: 10, y: 0, shiftKey: true });

    expect(harness.runtime.marqueeCalls[0].mode).toBe(SelectionMode.Add);
    expect(new Set(harness.runtime.getSelectionIds())).toEqual(new Set([1, 2, 3]));
  });

  it('clears selection on click with no hit and below drag threshold', () => {
    harness.runtime.setSelection([7], SelectionMode.Replace);

    harness.pointerDown({ x: 0, y: 0 });
    harness.pointerUp({ x: 1, y: 1 });

    expect(harness.runtime.clearSelectionCalls).toBe(1);
    expect(harness.runtime.getSelectionIds()).toEqual([]);
  });

  it('marquee selection selects multiple ids', () => {
    harness.runtime.setMarqueeReturn([5, 6]);
    harness.pointerDown({ x: 0, y: 0 });
    harness.pointerMove({ x: 5, y: 5 });
    harness.pointerUp({ x: 5, y: 5 });

    expect(harness.runtime.marqueeCalls).toHaveLength(1);
    expect(new Set(harness.runtime.getSelectionIds())).toEqual(new Set([5, 6]));
  });

  it('escape cancels active transform and resets state', () => {
    harness.runtime.setPickResult({ id: 9, subIndex: 0 });
    harness.pointerDown({ x: 2, y: 2 });

    harness.keyDown('Escape');

    expect(harness.runtime.transformSessions.cancelled).toBe(1);
    expect(harness.runtime.getSelectionIds()).toEqual([9]);
  });
});
