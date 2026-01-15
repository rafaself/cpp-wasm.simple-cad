import { describe, expect, it } from 'vitest';

import {
  parseBooleanArg,
  parseCommand,
  parseEnumArg,
  parseNumberArg,
} from './commandParser';

describe('commandParser', () => {
  describe('parseCommand', () => {
    it('parses a simple command', () => {
      const result = parseCommand('LINE');
      expect(result).toEqual({ success: true, command: 'LINE', args: [] });
    });

    it('is case-insensitive', () => {
      const result = parseCommand('line');
      expect(result).toEqual({ success: true, command: 'LINE', args: [] });
    });

    it('handles mixed case', () => {
      const result = parseCommand('LiNe');
      expect(result).toEqual({ success: true, command: 'LINE', args: [] });
    });

    it('parses command with single argument', () => {
      const result = parseCommand('ZOOM 150');
      expect(result).toEqual({ success: true, command: 'ZOOM', args: ['150'] });
    });

    it('parses command with multiple arguments', () => {
      const result = parseCommand('MOVE 10 20');
      expect(result).toEqual({ success: true, command: 'MOVE', args: ['10', '20'] });
    });

    it('handles extra whitespace', () => {
      const result = parseCommand('  LINE   ');
      expect(result).toEqual({ success: true, command: 'LINE', args: [] });
    });

    it('handles multiple spaces between tokens', () => {
      const result = parseCommand('ZOOM    150');
      expect(result).toEqual({ success: true, command: 'ZOOM', args: ['150'] });
    });

    it('handles double-quoted strings', () => {
      const result = parseCommand('TEXT "Hello World"');
      expect(result).toEqual({ success: true, command: 'TEXT', args: ['Hello World'] });
    });

    it('handles single-quoted strings', () => {
      const result = parseCommand("TEXT 'Hello World'");
      expect(result).toEqual({ success: true, command: 'TEXT', args: ['Hello World'] });
    });

    it('handles escaped quotes inside strings', () => {
      const result = parseCommand('TEXT "Say \\"hello\\""');
      expect(result).toEqual({ success: true, command: 'TEXT', args: ['Say "hello"'] });
    });

    it('handles empty quoted strings', () => {
      const result = parseCommand('TEXT ""');
      expect(result).toEqual({ success: true, command: 'TEXT', args: [''] });
    });

    it('handles mixed quoted and unquoted arguments', () => {
      const result = parseCommand('CMD arg1 "arg two" arg3');
      expect(result).toEqual({ success: true, command: 'CMD', args: ['arg1', 'arg two', 'arg3'] });
    });

    it('returns error for empty input', () => {
      const result = parseCommand('');
      expect(result).toEqual({ success: false, error: 'Empty command' });
    });

    it('returns error for whitespace-only input', () => {
      const result = parseCommand('   ');
      expect(result).toEqual({ success: false, error: 'Empty command' });
    });

    it('returns error for unclosed double quote', () => {
      const result = parseCommand('TEXT "Hello');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unclosed');
        expect(result.error).toContain('double');
      }
    });

    it('returns error for unclosed single quote', () => {
      const result = parseCommand("TEXT 'Hello");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Unclosed');
        expect(result.error).toContain('single');
      }
    });

    it('handles tabs as whitespace', () => {
      const result = parseCommand('ZOOM\t150');
      expect(result).toEqual({ success: true, command: 'ZOOM', args: ['150'] });
    });
  });

  describe('parseNumberArg', () => {
    it('parses integer', () => {
      expect(parseNumberArg('150')).toBe(150);
    });

    it('parses float', () => {
      expect(parseNumberArg('1.5')).toBe(1.5);
    });

    it('parses negative number', () => {
      expect(parseNumberArg('-10')).toBe(-10);
    });

    it('returns null for non-numeric', () => {
      expect(parseNumberArg('abc')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseNumberArg('')).toBeNull();
    });
  });

  describe('parseBooleanArg', () => {
    it.each([
      ['ON', true],
      ['on', true],
      ['TRUE', true],
      ['true', true],
      ['1', true],
      ['YES', true],
      ['yes', true],
      ['OFF', false],
      ['off', false],
      ['FALSE', false],
      ['false', false],
      ['0', false],
      ['NO', false],
      ['no', false],
    ])('parses %s as %s', (input, expected) => {
      expect(parseBooleanArg(input)).toBe(expected);
    });

    it('returns null for invalid input', () => {
      expect(parseBooleanArg('maybe')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseBooleanArg('')).toBeNull();
    });
  });

  describe('parseEnumArg', () => {
    const options = ['FIT', 'IN', 'OUT'] as const;

    it('matches exact case', () => {
      expect(parseEnumArg('FIT', options)).toBe('FIT');
    });

    it('is case-insensitive', () => {
      expect(parseEnumArg('fit', options)).toBe('FIT');
    });

    it('handles mixed case', () => {
      expect(parseEnumArg('FiT', options)).toBe('FIT');
    });

    it('returns null for non-matching input', () => {
      expect(parseEnumArg('ZOOM', options)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseEnumArg('', options)).toBeNull();
    });
  });
});
