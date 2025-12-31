import { render, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TransformMode } from '@/engine/core/interactionSession';
import { DraftingHandler } from '@/features/editor/interactions/handlers/DraftingHandler';
import { SelectionHandler } from '@/features/editor/interactions/handlers/SelectionHandler';
import { useInteractionManager } from '@/features/editor/interactions/useInteractionManager';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { FakeRuntime } from '@/test-utils/fakeRuntime';

const mockGetRuntime = vi.fn();

vi.mock('@/engine/core/singleton', () => ({
  getEngineRuntime: () => mockGetRuntime(),
}));

const Surface: React.FC = () => {
  const { handlers, activeHandlerName } = useInteractionManager();
  return (
    <div
      data-testid="surface"
      onPointerDown={handlers.onPointerDown}
      onPointerUp={handlers.onPointerUp}
      style={{ width: 300, height: 300 }}
    >
      {activeHandlerName}
    </div>
  );
};

describe('useInteractionManager', () => {
  let runtime: FakeRuntime;

  beforeEach(() => {
    runtime = new FakeRuntime();
    mockGetRuntime.mockResolvedValue(runtime);
    useUIStore.setState({
      activeTool: 'select',
      viewTransform: { x: 0, y: 0, scale: 1 },
      canvasSize: { width: 300, height: 300 },
    } as any);
    useSettingsStore.setState({ toolDefaults: { polygonSides: 3 } } as any);
  });

  it('creates the right handler per tool selection', async () => {
    const { getByTestId } = render(<Surface />);

    await waitFor(() => expect(getByTestId('surface').textContent).toBe('select'));

    await act(async () => {
      useUIStore.getState().setTool('line');
    });
    await waitFor(() => expect(getByTestId('surface').textContent).toBe('drafting'));

    await act(async () => {
      useUIStore.getState().setTool('text');
    });
    await waitFor(() => expect(getByTestId('surface').textContent).toBe('text'));
  });

  it('calls lifecycle hooks on tool switch', async () => {
    const leaveSpy = vi.spyOn(SelectionHandler.prototype, 'onLeave');
    const enterSpy = vi.spyOn(DraftingHandler.prototype, 'onEnter');

    const { getByTestId } = render(<Surface />);
    await waitFor(() => expect(getByTestId('surface').textContent).toBe('select'));

    await act(async () => {
      useUIStore.getState().setTool('line');
    });
    await waitFor(() => expect(getByTestId('surface').textContent).toBe('drafting'));

    expect(leaveSpy).toHaveBeenCalled();
    expect(enterSpy).toHaveBeenCalled();
  });

  it('cancels active transform on escape via global listener', async () => {
    runtime.setPickResult({ id: 11, subIndex: 0 });
    const { getByTestId } = render(<Surface />);
    await waitFor(() => expect(getByTestId('surface').textContent).toBe('select'));

    fireEvent.pointerDown(getByTestId('surface'), { clientX: 0, clientY: 0, button: 0 });
    expect(runtime.transformSessions.lastBegin?.mode).toBe(TransformMode.Move);

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(runtime.transformSessions.cancelled).toBe(1);
  });
});
