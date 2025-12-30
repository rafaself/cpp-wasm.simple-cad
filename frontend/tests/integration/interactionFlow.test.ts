import { describe, it, expect } from 'vitest';

import { CommandOp } from '@/engine/core/commandBuffer';
import { SelectionMode } from '@/engine/core/protocol';
import { createFakeTextTool } from '@/test-utils/fakeTextTool';
import { InteractionHarness } from '@/test-utils/interactionHarness';

describe('Integration: draw → select → text → undo/redo → snapshot', () => {
  it('runs a deterministic interaction flow', () => {
    const harness = new InteractionHarness({ activeTool: 'rect' });

    // Draw rectangle
    harness.pointerDown({ x: 5, y: 5 });
    harness.pointerMove({ x: 15, y: 15 });
    harness.pointerUp({ x: 15, y: 15 });

    const draftOps = harness.getCommands().map((c) => c.op);
    expect(draftOps).toEqual([CommandOp.BeginDraft, CommandOp.CommitDraft]);

    // Select it
    harness.setTool('select');
    harness.runtime.setPickResult({ id: 100, subIndex: 0 });
    harness.pointerDown({ x: 10, y: 10 });
    harness.pointerUp({ x: 10, y: 10 });
    expect(harness.runtime.getSelectionIds()).toEqual([100]);
    expect(harness.runtime.transformSessions.committed).toBe(1);

    // Text edit
    const fakeTextTool = createFakeTextTool({
      onStateChange: () => undefined,
      onCaretUpdate: () => undefined,
      onSelectionUpdate: () => undefined,
      onEditEnd: () => undefined,
      onTextCreated: () => undefined,
      onTextUpdated: () => undefined,
      onStyleSnapshot: () => undefined,
    });
    harness.setTool('text', { textTool: fakeTextTool as any });
    harness.pointerDown({ x: 20, y: 20 });
    harness.typeText('CAD');
    expect(fakeTextTool.getContent()).toBe('CAD');

    // Undo/redo bookkeeping
    harness.runtime.undo();
    harness.runtime.redo();
    expect(harness.runtime.undoCount).toBe(1);
    expect(harness.runtime.redoCount).toBe(1);

    // Save/load snapshot
    const snapshot = harness.runtime.saveSnapshotBytes();
    expect(snapshot[0]).toBe(harness.getCommands().length);
    harness.runtime.loadSnapshotBytes(snapshot);
    expect(harness.runtime.loadedSnapshot).toBe(snapshot);

    // Selection survives unless cleared explicitly
    harness.runtime.setSelection([], SelectionMode.Replace);
    expect(harness.runtime.getSelectionIds()).toEqual([]);
  });
});
