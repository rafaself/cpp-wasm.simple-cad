import { describe, it, expect } from 'vitest';
import { InteractionHarness } from '@/test-utils/interactionHarness';
import { FakeRuntime } from '@/test-utils/fakeRuntime';

describe('Drafting performance', () => {
  it('does not serialize command buffer on every pointer move', () => {
    const runtime = new FakeRuntime();
    const harness = new InteractionHarness({ activeTool: 'rect', runtime });

    harness.pointerDown({ x: 0, y: 0 });
    const moves = 5000;
    for (let i = 1; i <= moves; i += 1) {
      harness.pointerMove({ x: i, y: i });
    }
    harness.pointerUp({ x: moves, y: moves });

    // Begin + Commit only; no per-move apply
    expect(runtime.applyCallCount).toBeLessThanOrEqual(3);
    expect(runtime.draftUpdateCalls).toBe(moves);
  });
});
