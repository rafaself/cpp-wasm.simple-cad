import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandDefinition, CommandRegistry } from './commandRegistry';

describe('CommandRegistry', () => {
  let registry: CommandRegistry;

  const mockCommand: CommandDefinition = {
    id: 'tool.line',
    name: 'LINE',
    aliases: ['L', 'LI'],
    description: 'Draw a line',
    category: 'tools',
    execute: vi.fn(() => ({ success: true })),
  };

  const mockCommand2: CommandDefinition = {
    id: 'tool.rect',
    name: 'RECTANGLE',
    aliases: ['R', 'REC', 'RECT'],
    description: 'Draw a rectangle',
    category: 'tools',
    execute: vi.fn(() => ({ success: true })),
  };

  beforeEach(() => {
    registry = new CommandRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('registers a command successfully', () => {
      expect(() => registry.register(mockCommand)).not.toThrow();
      expect(registry.has('LINE')).toBe(true);
    });

    it('throws error for duplicate ID', () => {
      registry.register(mockCommand);
      expect(() => registry.register(mockCommand)).toThrow(/already registered/);
    });

    it('throws error for duplicate name', () => {
      registry.register(mockCommand);
      const duplicate: CommandDefinition = {
        ...mockCommand,
        id: 'tool.line2',
        aliases: ['L2'],
      };
      expect(() => registry.register(duplicate)).toThrow(/already registered/);
    });

    it('throws error for duplicate alias', () => {
      registry.register(mockCommand);
      const duplicate: CommandDefinition = {
        id: 'tool.line2',
        name: 'LINEA',
        aliases: ['L'], // Duplicate alias
        description: 'Another line',
        category: 'tools',
        execute: vi.fn(() => ({ success: true })),
      };
      expect(() => registry.register(duplicate)).toThrow(/Alias "L" is already registered/);
    });
  });

  describe('resolve', () => {
    beforeEach(() => {
      registry.register(mockCommand);
    });

    it('resolves by name', () => {
      const result = registry.resolve('LINE');
      expect(result?.id).toBe('tool.line');
    });

    it('resolves by name (case-insensitive)', () => {
      expect(registry.resolve('line')?.id).toBe('tool.line');
      expect(registry.resolve('Line')?.id).toBe('tool.line');
      expect(registry.resolve('LINE')?.id).toBe('tool.line');
    });

    it('resolves by alias', () => {
      expect(registry.resolve('L')?.id).toBe('tool.line');
      expect(registry.resolve('LI')?.id).toBe('tool.line');
    });

    it('resolves by alias (case-insensitive)', () => {
      expect(registry.resolve('l')?.id).toBe('tool.line');
      expect(registry.resolve('li')?.id).toBe('tool.line');
    });

    it('returns null for unknown command', () => {
      expect(registry.resolve('UNKNOWN')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(registry.resolve('')).toBeNull();
    });
  });

  describe('has', () => {
    beforeEach(() => {
      registry.register(mockCommand);
    });

    it('returns true for registered name', () => {
      expect(registry.has('LINE')).toBe(true);
    });

    it('returns true for registered alias', () => {
      expect(registry.has('L')).toBe(true);
    });

    it('is case-insensitive', () => {
      expect(registry.has('line')).toBe(true);
      expect(registry.has('l')).toBe(true);
    });

    it('returns false for unregistered command', () => {
      expect(registry.has('UNKNOWN')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('returns empty array when no commands registered', () => {
      expect(registry.getAll()).toEqual([]);
    });

    it('returns all registered commands', () => {
      registry.register(mockCommand);
      registry.register(mockCommand2);
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all.map((c) => c.id)).toContain('tool.line');
      expect(all.map((c) => c.id)).toContain('tool.rect');
    });
  });

  describe('getSuggestions', () => {
    beforeEach(() => {
      registry.register(mockCommand);
      registry.register(mockCommand2);
    });

    it('returns empty array for empty input', () => {
      expect(registry.getSuggestions('')).toEqual([]);
    });

    it('returns matching commands by name prefix', () => {
      const suggestions = registry.getSuggestions('LI');
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].id).toBe('tool.line');
    });

    it('returns matching commands by alias prefix', () => {
      const suggestions = registry.getSuggestions('R');
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].id).toBe('tool.rect');
    });

    it('is case-insensitive', () => {
      const suggestions = registry.getSuggestions('li');
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].id).toBe('tool.line');
    });

    it('respects limit parameter', () => {
      // Register more commands
      for (let i = 0; i < 10; i++) {
        registry.register({
          id: `tool.l${i}`,
          name: `L${i}COMMAND`,
          aliases: [],
          description: 'Test',
          category: 'tools',
          execute: vi.fn(() => ({ success: true })),
        });
      }

      const suggestions = registry.getSuggestions('L', 3);
      expect(suggestions).toHaveLength(3);
    });

    it('prioritizes shorter matches', () => {
      registry.clear();
      registry.register({
        id: 'short',
        name: 'LA',
        aliases: [],
        description: 'Short',
        category: 'tools',
        execute: vi.fn(() => ({ success: true })),
      });
      registry.register({
        id: 'long',
        name: 'LONGER',
        aliases: [],
        description: 'Long',
        category: 'tools',
        execute: vi.fn(() => ({ success: true })),
      });

      const suggestions = registry.getSuggestions('L');
      expect(suggestions[0].id).toBe('short');
    });
  });

  describe('getAliases', () => {
    beforeEach(() => {
      registry.register(mockCommand);
    });

    it('returns all aliases including name', () => {
      const aliases = registry.getAliases('tool.line');
      expect(aliases).toContain('LINE');
      expect(aliases).toContain('L');
      expect(aliases).toContain('LI');
    });

    it('returns empty array for unknown command', () => {
      expect(registry.getAliases('unknown')).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all registered commands', () => {
      registry.register(mockCommand);
      registry.register(mockCommand2);

      expect(registry.getAll()).toHaveLength(2);

      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
      expect(registry.has('LINE')).toBe(false);
      expect(registry.has('L')).toBe(false);
    });
  });

  describe('command execution', () => {
    it('executes command with context', () => {
      registry.register(mockCommand);
      const command = registry.resolve('LINE');

      const mockContext = {
        executeAction: vi.fn(),
        selectTool: vi.fn(),
        setSnapEnabled: vi.fn(),
        setSnapOption: vi.fn(),
        setViewTransform: vi.fn(),
        showToast: vi.fn(),
      };

      const result = command?.execute([], mockContext);

      expect(result).toEqual({ success: true });
      expect(mockCommand.execute).toHaveBeenCalledWith([], mockContext);
    });
  });
});
