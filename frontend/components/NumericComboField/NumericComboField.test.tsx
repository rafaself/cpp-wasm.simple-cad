/**
 * NumericComboField Component Test Suite
 *
 * Tests cover:
 * - Commit via Enter
 * - Commit via Blur/Tab
 * - Cancel via Esc
 * - ArrowUp/Down + Shift acceleration
 * - Dropdown navigation and preset selection
 * - Mixed placeholder → type value → commit
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { NumericComboField } from './NumericComboField';

describe('NumericComboField', () => {
  const defaultPresets = [8, 10, 12, 14, 16, 18, 20, 24];
  let mockOnCommit: (value: number) => void;

  beforeEach(() => {
    mockOnCommit = vi.fn();
  });

  describe('Basic Rendering', () => {
    it('should render with numeric value', () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue('16');
    });

    it('should render placeholder for mixed state', () => {
      render(
        <NumericComboField
          value="mixed"
          onCommit={mockOnCommit}
          placeholder="Mixed"
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('placeholder', 'Mixed');
      expect(input).toHaveValue('');
    });

    it('should render empty for null value', () => {
      render(<NumericComboField value={null} onCommit={mockOnCommit} testId="numeric-combo" />);

      const input = screen.getByRole('combobox');
      expect(input).toHaveValue('');
    });

    it('should render disabled state', () => {
      render(
        <NumericComboField value={16} onCommit={mockOnCommit} disabled testId="numeric-combo" />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toBeDisabled();
    });
  });

  describe('Commit via Enter', () => {
    it('should commit value on Enter', async () => {
      render(<NumericComboField value={16} onCommit={mockOnCommit} testId="numeric-combo" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '24' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnCommit).toHaveBeenCalledWith(24);
    });

    it('should clamp value on commit', async () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          min={10}
          max={100}
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '5' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnCommit).toHaveBeenCalledWith(10); // Clamped to min
    });

    it('should revert on invalid input', async () => {
      render(<NumericComboField value={16} onCommit={mockOnCommit} testId="numeric-combo" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: 'abc' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnCommit).not.toHaveBeenCalled();
    });
  });

  describe('Commit via Blur', () => {
    it('should commit on blur', async () => {
      render(<NumericComboField value={16} onCommit={mockOnCommit} testId="numeric-combo" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '32' } });
      fireEvent.blur(input);

      expect(mockOnCommit).toHaveBeenCalledWith(32);
    });

    it('should commit on Tab (blur)', async () => {
      render(<NumericComboField value={16} onCommit={mockOnCommit} testId="numeric-combo" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '48' } });
      fireEvent.keyDown(input, { key: 'Tab' });
      fireEvent.blur(input);

      expect(mockOnCommit).toHaveBeenCalledWith(48);
    });
  });

  describe('Cancel via Esc', () => {
    it('should cancel and revert value on Escape', async () => {
      render(<NumericComboField value={16} onCommit={mockOnCommit} testId="numeric-combo" />);

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '999' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      // Should NOT commit the new value
      expect(mockOnCommit).not.toHaveBeenCalled();
    });
  });

  describe('Arrow Key Stepping', () => {
    it('should increment on ArrowUp', async () => {
      render(
        <NumericComboField value={16} onCommit={mockOnCommit} step={1} testId="numeric-combo" />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: 'ArrowUp' });

      expect(mockOnCommit).toHaveBeenCalledWith(17);
    });

    it('should decrement on ArrowDown', async () => {
      render(
        <NumericComboField value={16} onCommit={mockOnCommit} step={1} testId="numeric-combo" />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      expect(mockOnCommit).toHaveBeenCalledWith(15);
    });

    it('should use large step with Shift', async () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          step={1}
          stepLarge={10}
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });

      expect(mockOnCommit).toHaveBeenCalledWith(26);
    });

    it('should respect min/max bounds', async () => {
      render(
        <NumericComboField
          value={10}
          onCommit={mockOnCommit}
          min={10}
          max={20}
          step={5}
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.keyDown(input, { key: 'ArrowDown' });

      // Should be clamped to min
      expect(mockOnCommit).toHaveBeenCalledWith(10);
    });
  });

  describe('Dropdown Presets', () => {
    it('should open dropdown on chevron click', async () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const dropdownButton = screen.getByRole('button', { name: 'Open presets' });
      fireEvent.click(dropdownButton);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      // Should show all presets
      defaultPresets.forEach((preset) => {
        expect(screen.getByText(String(preset))).toBeInTheDocument();
      });
    });

    it('should select preset on click', async () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const dropdownButton = screen.getByRole('button', { name: 'Open presets' });
      fireEvent.click(dropdownButton);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('24'));

      expect(mockOnCommit).toHaveBeenCalledWith(24);
    });

    it('should navigate dropdown with arrow keys and select with Enter', async () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const dropdownButton = screen.getByRole('button', { name: 'Open presets' });
      fireEvent.click(dropdownButton);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);

      // Navigate down in dropdown
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Should select a preset
      expect(mockOnCommit).toHaveBeenCalled();
    });

    it('should close dropdown on Escape', async () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const dropdownButton = screen.getByRole('button', { name: 'Open presets' });
      fireEvent.click(dropdownButton);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      const input = screen.getByRole('combobox');
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      });
    });
  });

  describe('Mixed State', () => {
    it('should show placeholder in mixed state', () => {
      render(
        <NumericComboField
          value="mixed"
          onCommit={mockOnCommit}
          placeholder="Multiple Values"
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('placeholder', 'Multiple Values');
    });

    it('should commit value from mixed state', async () => {
      render(
        <NumericComboField
          value="mixed"
          onCommit={mockOnCommit}
          placeholder="Mixed"
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '20' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockOnCommit).toHaveBeenCalledWith(20);
    });

    it('should select preset from mixed state', async () => {
      render(
        <NumericComboField
          value="mixed"
          onCommit={mockOnCommit}
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const dropdownButton = screen.getByRole('button', { name: 'Open presets' });
      fireEvent.click(dropdownButton);

      await waitFor(() => {
        expect(screen.getByRole('listbox')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('14'));

      expect(mockOnCommit).toHaveBeenCalledWith(14);
    });
  });

  describe('Decimal Support', () => {
    it('should support decimal values', async () => {
      render(
        <NumericComboField
          value={1.5}
          onCommit={mockOnCommit}
          decimals={1}
          step={0.1}
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveValue('1.5');

      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '2.75' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      // Should round to 1 decimal place
      expect(mockOnCommit).toHaveBeenCalledWith(2.8);
    });
  });

  describe('Spinner Buttons', () => {
    it('should increment on up button click', async () => {
      render(
        <NumericComboField value={16} onCommit={mockOnCommit} step={1} testId="numeric-combo" />,
      );

      const incrementButton = screen.getByRole('button', { name: 'Increment' });
      fireEvent.click(incrementButton);

      expect(mockOnCommit).toHaveBeenCalledWith(17);
    });

    it('should decrement on down button click', async () => {
      render(
        <NumericComboField value={16} onCommit={mockOnCommit} step={1} testId="numeric-combo" />,
      );

      const decrementButton = screen.getByRole('button', { name: 'Decrement' });
      fireEvent.click(decrementButton);

      expect(mockOnCommit).toHaveBeenCalledWith(15);
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          ariaLabel="Font size"
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-label', 'Font size');
      expect(input).toHaveAttribute('aria-expanded', 'false');
    });

    it('should update aria-expanded when dropdown opens', async () => {
      render(
        <NumericComboField
          value={16}
          onCommit={mockOnCommit}
          presets={defaultPresets}
          testId="numeric-combo"
        />,
      );

      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('aria-expanded', 'false');

      const dropdownButton = screen.getByRole('button', { name: 'Open presets' });
      fireEvent.click(dropdownButton);

      await waitFor(() => {
        expect(input).toHaveAttribute('aria-expanded', 'true');
      });
    });
  });
});
