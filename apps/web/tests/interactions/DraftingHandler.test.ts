import { describe, it, expect, beforeEach } from 'vitest';

import { CommandOp } from '@/engine/core/commandTypes';
import { SelectionMode } from '@/engine/core/protocol';
import { InteractionHarness } from '@/test-utils/interactionHarness';

describe('DraftingHandler', () => {
  let harness: InteractionHarness;

  beforeEach(() => {
    harness = new InteractionHarness({ activeTool: 'rect' });
  });

  it('begins a draft on pointer down', () => {
    harness.pointerDown({ x: 10, y: 10 });

    expect(harness.getCommands()[0]).toMatchObject({ op: CommandOp.BeginDraft });
  });

  it('updates draft on pointer move', () => {
    harness.pointerDown({ x: 0, y: 0 });
    harness.pointerMove({ x: 5, y: 5 });

    expect(harness.runtime.draftUpdateCalls).toBe(1);
  });

  it('commits draft on pointer up', () => {
    harness.pointerDown({ x: 0, y: 0 });
    harness.pointerUp({ x: 10, y: 10 });

    const commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    expect(commits).toHaveLength(1);
  });

  it('requires a second click to commit a line', () => {
    harness.setTool('line');

    harness.pointerDown({ x: 0, y: 0 });
    harness.pointerUp({ x: 0, y: 0 });

    let commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    expect(commits).toHaveLength(0);

    harness.pointerDown({ x: 10, y: 10 });
    harness.pointerUp({ x: 10, y: 10 });

    commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    expect(commits).toHaveLength(1);
  });

  it('cancels draft via helper without affecting selection', () => {
    harness.pointerDown({ x: 0, y: 0 });
    // cancelDraft helper is exposed; using runtime stored in harness
    (harness.handler as any).cancelDraft(harness.runtime);

    const cancels = harness.getCommands().filter((c) => c.op === CommandOp.CancelDraft);
    expect(cancels).toHaveLength(1);
    expect(harness.runtime.getSelectionIds()).toEqual([]);
  });

  it('limits update calls under stress', () => {
    harness.pointerDown({ x: 0, y: 0 });
    for (let i = 0; i < 50; i += 1) {
      harness.pointerMove({ x: i, y: i });
    }
    harness.pointerUp({ x: 50, y: 50 });

    expect(harness.runtime.draftUpdateCalls).toBe(50);
    const commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    expect(commits).toHaveLength(1);
  });

  it('adds points for polyline without losing prior selection', () => {
    harness.runtime.setSelection([99], SelectionMode.Replace);
    harness.setTool('polyline');

    harness.pointerDown({ x: 1, y: 1 });
    harness.pointerUp({ x: 1, y: 1 });
    harness.pointerMove({ x: 2, y: 2 });
    harness.pointerDown({ x: 2, y: 2 });
    harness.pointerUp({ x: 2, y: 2 });

    const appendOps = harness.getCommands().filter((c) => c.op === CommandOp.AppendDraftPoint);
    expect(appendOps).toHaveLength(1);
    expect(harness.runtime.getSelectionIds()).toEqual([99]);
  });

  it('does not duplicate the first polyline point on initial click', () => {
    harness.setTool('polyline');

    harness.pointerDown({ x: 1, y: 1 });
    harness.pointerUp({ x: 1, y: 1 });

    const appendOps = harness.getCommands().filter((c) => c.op === CommandOp.AppendDraftPoint);
    expect(appendOps).toHaveLength(0);
  });

  it('commits polyline on Enter', () => {
    harness.setTool('polyline');

    harness.pointerDown({ x: 1, y: 1 });
    harness.pointerUp({ x: 2, y: 2 });
    harness.keyDown('Enter');

    const commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    expect(commits).toHaveLength(1);
  });

  it('cancels polyline on Escape', () => {
    harness.setTool('polyline');

    harness.pointerDown({ x: 1, y: 1 });
    harness.pointerUp({ x: 2, y: 2 });
    harness.keyDown('Escape');

    const cancels = harness.getCommands().filter((c) => c.op === CommandOp.CancelDraft);
    expect(cancels).toHaveLength(1);
  });

  it('commits polyline on right click', () => {
    harness.setTool('polyline');

    harness.pointerDown({ x: 1, y: 1 });
    harness.pointerUp({ x: 2, y: 2 });
    harness.pointerDown({ x: 3, y: 3, button: 2 });
    harness.pointerUp({ x: 3, y: 3, button: 2 });

    const commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    expect(commits).toHaveLength(1);
  });

  it('commits polyline on double click without adding an extra point', () => {
    harness.setTool('polyline');

    harness.pointerDown({ x: 1, y: 1, detail: 1 });
    harness.pointerUp({ x: 1, y: 1, detail: 1 });
    harness.pointerDown({ x: 10, y: 10, detail: 2 });
    harness.pointerUp({ x: 10, y: 10, detail: 2 });

    const appendOps = harness.getCommands().filter((c) => c.op === CommandOp.AppendDraftPoint);
    const commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    expect(appendOps).toHaveLength(1);
    expect(commits).toHaveLength(1);
  });

  it('commits polyline when switching tools', () => {
    harness.setTool('polyline');

    harness.pointerDown({ x: 1, y: 1 });
    harness.pointerUp({ x: 2, y: 2 });
    harness.setTool('select');

    const commits = harness.getCommands().filter((c) => c.op === CommandOp.CommitDraft);
    const cancels = harness.getCommands().filter((c) => c.op === CommandOp.CancelDraft);
    expect(commits).toHaveLength(1);
    expect(cancels).toHaveLength(0);
  });
});
