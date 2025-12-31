import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TextBridge } from '@/engine/bridge/textBridge';
import { EngineRuntime } from '@/engine/core/EngineRuntime';
import { TextBoxMode, TextStyleFlags } from '@/types/text';

import {
  TextInputCoordinator,
  type CoordinatorCallbacks,
  type StyleDefaults,
} from './TextInputCoordinator';

describe('TextInputCoordinator', () => {
  let coordinator: TextInputCoordinator;
  let mockRuntime: EngineRuntime;
  let mockBridge: TextBridge;
  let mockCallbacks: CoordinatorCallbacks & {
    onStateChange: ReturnType<typeof vi.fn>;
    onTextCreated: ReturnType<typeof vi.fn>;
    onTextUpdated: ReturnType<typeof vi.fn>;
    updateCaretPosition: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockRuntime = {
      allocateEntityId: vi.fn(() => 100),
    } as unknown as EngineRuntime;

    mockBridge = {
      isAvailable: () => true,
      getTextContent: vi.fn(() => 'Hello'),
      insertContentByteIndex: vi.fn(),
      deleteContentByteIndex: vi.fn(),
      setCaretByteIndex: vi.fn(),
      setSelectionByteIndex: vi.fn(),
      getTextStyleSnapshot: vi.fn(() => ({
        caretLogical: 5,
        selectionStartLogical: 5,
        selectionEndLogical: 5,
      })),
      getTextBounds: vi.fn(() => ({ valid: true, minX: 0, minY: 0, maxX: 50, maxY: 16 })),
    } as unknown as TextBridge;

    const onStateChange = vi.fn();
    const onTextCreated = vi.fn();
    const onTextUpdated = vi.fn();
    const updateCaretPosition = vi.fn();

    mockCallbacks = {
      onStateChange,
      onTextCreated,
      onTextUpdated,
      updateCaretPosition,
    };

    const defaults: StyleDefaults = {
      fontId: 0,
      fontSize: 16,
      colorRGBA: 0,
      flags: TextStyleFlags.None,
    };

    coordinator = new TextInputCoordinator(mockCallbacks, defaults);
    coordinator.initialize(mockRuntime, mockBridge);
    coordinator.setState({ activeTextId: 10, caretIndex: 0 }); // Simulate active session
  });

  it('syncs state from engine after input', () => {
    // Simulate inserting " World" at index 5
    // Coordinator thinks current content is "Hello" (mock)
    // Insert delta
    coordinator.handleInputDelta({ type: 'insert', at: 5, text: ' World' });

    // Expectations:
    // 1. insertContentByteIndex called
    expect(mockBridge.insertContentByteIndex).toHaveBeenCalled();

    // 2. setCaretByteIndex called
    expect(mockBridge.setCaretByteIndex).toHaveBeenCalled();

    // 3. getTextStyleSnapshot called
    expect(mockBridge.getTextStyleSnapshot).toHaveBeenCalledWith(10);

    // 4. State updated from snapshot (mock returns 5, but we simulated change)
    // Wait, my mock snapshot returns 5 always.
    // In this test logic, coordinator should update state to 5.
    expect(mockCallbacks.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        caretIndex: 5,
        selectionStart: 5,
        selectionEnd: 5,
      }),
    );
  });

  it('syncs state from engine after selection change', () => {
    // Mock snapshot for selection
    vi.mocked(mockBridge.getTextStyleSnapshot).mockReturnValueOnce({
      caretLogical: 10,
      selectionStartLogical: 5,
      selectionEndLogical: 10,
    } as any);

    coordinator.handleSelectionChange(5, 10);

    expect(mockBridge.setSelectionByteIndex).toHaveBeenCalled();
    expect(mockBridge.getTextStyleSnapshot).toHaveBeenCalled();
    expect(mockCallbacks.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        caretIndex: 5,
        selectionStart: 5,
        selectionEnd: 5,
      }),
    );
  });

  it('resets on external undo/redo', () => {
    coordinator.handleExternalMutation('undo');
    expect(mockCallbacks.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ activeTextId: null, mode: 'idle' }),
    );
  });

  it('resets when text entity disappears', () => {
    (mockBridge.getTextContent as any) = vi.fn(() => null);
    mockCallbacks.onStateChange.mockClear();
    coordinator.resyncFromEngine();
    expect(mockCallbacks.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ activeTextId: null, mode: 'idle' }),
    );
  });

  it('clamps caret and selection when snapshot exceeds content length', () => {
    (mockBridge.getTextContent as any) = vi.fn(() => 'Hi');
    vi.mocked(mockBridge.getTextStyleSnapshot).mockReturnValueOnce({
      caretLogical: 10,
      selectionStartLogical: 9,
      selectionEndLogical: 12,
    } as any);
    mockCallbacks.onStateChange.mockClear();
    coordinator.resyncFromEngine();
    expect(mockCallbacks.onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        caretIndex: 2,
        selectionStart: 2,
        selectionEnd: 2,
      }),
    );
  });
});
