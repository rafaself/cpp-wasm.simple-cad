import { act, fireEvent, render } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useKeyboardShortcuts } from '@/features/editor/hooks/useKeyboardShortcuts';
import { useUIStore } from '@/stores/useUIStore';

const Harness: React.FC = () => {
  useKeyboardShortcuts();
  return null;
};

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    useUIStore.setState({
      activeTool: 'select',
      viewTransform: { x: 0, y: 0, scale: 1 },
      canvasSize: { width: 100, height: 100 },
      engineTextEditState: {
        active: false,
        textId: null,
        editGeneration: 0,
        caretPosition: null,
      },
    } as any);
  });

  it('suppresses tool shortcuts while engine text editing is active', () => {
    render(<Harness />);

    fireEvent.keyDown(window, { key: 'c', code: 'KeyC' });
    expect(useUIStore.getState().activeTool).toBe('circle');

    act(() => {
      useUIStore.getState().setTool('select');
      useUIStore.getState().setEngineTextEditActive(true, 99);
    });

    fireEvent.keyDown(window, { key: 'c', code: 'KeyC' });
    expect(useUIStore.getState().activeTool).toBe('select');
  });
});
