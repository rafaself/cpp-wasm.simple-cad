import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCommandStore } from '@/stores/useCommandStore';
import { useUIStore } from '@/stores/useUIStore';

import { CommandInput } from './CommandInput';

// Mock the command executor
vi.mock('../commands/commandExecutor', () => ({
  useCommandExecutor: () => ({
    execute: vi.fn(),
  }),
  getCommandSuggestions: vi.fn(() => []),
}));

// Mock command definitions
vi.mock('../commands/definitions', () => ({
  ensureCommandsRegistered: vi.fn(),
}));

describe('CommandInput', () => {
  beforeEach(() => {
    // Reset store state
    useCommandStore.setState({
      buffer: '',
      isActive: false,
      history: [],
      historyIndex: -1,
      savedBuffer: '',
      error: null,
      errorTimeoutId: null,
    });
  });

  it('renders the input field', () => {
    render(<CommandInput />);
    expect(screen.getByRole('textbox', { name: /entrada de comando/i })).toBeInTheDocument();
  });

  it('displays placeholder text', () => {
    render(<CommandInput />);
    expect(screen.getByPlaceholderText('Comando...')).toBeInTheDocument();
  });

  it('updates buffer on input', () => {
    render(<CommandInput />);
    const input = screen.getByRole('textbox');

    fireEvent.change(input, { target: { value: 'LINE' } });

    expect(useCommandStore.getState().buffer).toBe('LINE');
  });

  it('clears buffer on Escape', () => {
    useCommandStore.setState({ buffer: 'LINE' });
    render(<CommandInput />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(useCommandStore.getState().buffer).toBe('');
  });

  it('sets active state on focus', () => {
    render(<CommandInput />);
    const input = screen.getByRole('textbox');

    fireEvent.focus(input);

    expect(useCommandStore.getState().isActive).toBe(true);
  });

  it('clears active state on blur', () => {
    useCommandStore.setState({ isActive: true });
    render(<CommandInput />);
    const input = screen.getByRole('textbox');

    fireEvent.blur(input);

    expect(useCommandStore.getState().isActive).toBe(false);
  });

  it('displays error message when error is set', () => {
    useCommandStore.setState({ error: 'Unknown command: XYZ' });
    render(<CommandInput />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unknown command: XYZ');
  });

  it('calls navigateHistory on ArrowUp', () => {
    const navigateSpy = vi.spyOn(useCommandStore.getState(), 'navigateHistory');
    render(<CommandInput />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(navigateSpy).toHaveBeenCalledWith('up');
    navigateSpy.mockRestore();
  });

  it('calls navigateHistory on ArrowDown', () => {
    const navigateSpy = vi.spyOn(useCommandStore.getState(), 'navigateHistory');
    render(<CommandInput />);
    const input = screen.getByRole('textbox');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(navigateSpy).toHaveBeenCalledWith('down');
    navigateSpy.mockRestore();
  });

  it('renders correctly when mouse is over canvas', () => {
    // Mock useUIStore to simulate mouse over canvas
    const originalState = useUIStore.getState();
    useUIStore.setState({ ...originalState, isMouseOverCanvas: true } as any);

    render(<CommandInput />);

    // Should render the input
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Restore state
    useUIStore.setState(originalState);
  });

  describe('IME composition', () => {
    it('does not execute command on Enter during composition', () => {
      useCommandStore.setState({ buffer: 'LINE' });
      render(<CommandInput />);
      const input = screen.getByRole('textbox');

      // Start composition
      fireEvent.compositionStart(input);

      // Try to execute with Enter during composition
      // The event should be prevented but not executed
      fireEvent.keyDown(input, { key: 'Enter' });

      // End composition
      fireEvent.compositionEnd(input);

      // Buffer should still have the value
      expect(useCommandStore.getState().buffer).toBe('LINE');
    });

    it('handles composition events correctly', () => {
      render(<CommandInput />);
      const input = screen.getByRole('textbox');

      // Start composition
      fireEvent.compositionStart(input);

      // Type during composition (simulating IME input)
      fireEvent.change(input, { target: { value: '线' } });

      expect(useCommandStore.getState().buffer).toBe('线');

      // End composition
      fireEvent.compositionEnd(input);

      // Buffer should still be set
      expect(useCommandStore.getState().buffer).toBe('线');
    });
  });
});
