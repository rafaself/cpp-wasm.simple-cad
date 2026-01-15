/**
 * Command Registry
 *
 * Central registry for all available commands. Supports:
 * - Registration of commands with metadata
 * - Lookup by name or alias (case-insensitive)
 * - Autocomplete suggestions for partial input
 */

import type { SnapOptions, ToolType, ViewTransform } from '@/types';

import type { ActionId } from './useEditorCommands';

/**
 * Argument schema for command validation.
 */
export interface ArgSchema {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required: boolean;
  options?: readonly string[]; // For enum type
  default?: unknown;
  description?: string;
}

/**
 * Context provided to command handlers for executing actions.
 */
export interface CommandContext {
  executeAction: (id: ActionId) => void;
  selectTool: (id: ToolType) => void;
  setSnapEnabled: (enabled: boolean) => void;
  setSnapOption: (option: keyof SnapOptions, value: boolean) => void;
  setViewTransform: (fn: (prev: ViewTransform) => ViewTransform) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;
}

/**
 * Result returned from command execution.
 */
export interface CommandResult {
  success: boolean;
  message?: string;
}

/**
 * Definition of a command.
 */
export interface CommandDefinition {
  /** Unique identifier (e.g., 'tool.line', 'action.undo') */
  id: string;

  /** Display name (e.g., 'Line', 'Undo') */
  name: string;

  /** Short forms (e.g., ['L', 'LI'] for LINE) */
  aliases: string[];

  /** Help text describing what the command does */
  description: string;

  /** Category for grouping in help/autocomplete */
  category: 'tools' | 'edit' | 'view' | 'settings' | 'file';

  /** Optional argument definitions for validation */
  args?: ArgSchema[];

  /** If true, command requires entities to be selected */
  requiresSelection?: boolean;

  /** The command handler */
  execute: (args: string[], context: CommandContext) => CommandResult;
}

/**
 * Command Registry class.
 *
 * Manages command registration and lookup.
 */
class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map(); // alias (uppercase) → command id

  /**
   * Registers a command definition.
   *
   * @throws Error if command ID or any alias is already registered
   */
  register(command: CommandDefinition): void {
    // Check for duplicate ID
    if (this.commands.has(command.id)) {
      throw new Error(`Command with ID "${command.id}" is already registered`);
    }

    // Check for duplicate aliases
    const normalizedName = command.name.toUpperCase();
    if (this.aliasMap.has(normalizedName)) {
      throw new Error(
        `Alias "${command.name}" is already registered for command "${this.aliasMap.get(normalizedName)}"`,
      );
    }

    for (const alias of command.aliases) {
      const normalizedAlias = alias.toUpperCase();
      if (this.aliasMap.has(normalizedAlias)) {
        throw new Error(
          `Alias "${alias}" is already registered for command "${this.aliasMap.get(normalizedAlias)}"`,
        );
      }
    }

    // Register command
    this.commands.set(command.id, command);

    // Register name as alias
    this.aliasMap.set(normalizedName, command.id);

    // Register all aliases
    for (const alias of command.aliases) {
      this.aliasMap.set(alias.toUpperCase(), command.id);
    }
  }

  /**
   * Resolves a command by name or alias (case-insensitive).
   *
   * @param input - Command name or alias
   * @returns Command definition or null if not found
   */
  resolve(input: string): CommandDefinition | null {
    const normalized = input.toUpperCase();
    const commandId = this.aliasMap.get(normalized);

    if (!commandId) {
      return null;
    }

    return this.commands.get(commandId) || null;
  }

  /**
   * Returns all registered commands.
   */
  getAll(): CommandDefinition[] {
    return Array.from(this.commands.values());
  }

  /**
   * Returns commands matching a partial input (for autocomplete).
   *
   * @param partial - Partial command input
   * @param limit - Maximum number of suggestions
   * @returns Array of matching commands, sorted by relevance
   */
  getSuggestions(partial: string, limit: number = 10): CommandDefinition[] {
    if (!partial) {
      return [];
    }

    const normalized = partial.toUpperCase();
    const matches: Array<{ command: CommandDefinition; score: number }> = [];

    for (const command of this.commands.values()) {
      // Check name match
      const nameUpper = command.name.toUpperCase();
      if (nameUpper.startsWith(normalized)) {
        matches.push({ command, score: 100 - command.name.length }); // Shorter = better
        continue;
      }

      // Check alias matches
      for (const alias of command.aliases) {
        const aliasUpper = alias.toUpperCase();
        if (aliasUpper.startsWith(normalized)) {
          matches.push({ command, score: 90 - alias.length }); // Aliases score slightly lower
          break;
        }
      }
    }

    // Sort by score (higher = better)
    matches.sort((a, b) => b.score - a.score);

    return matches.slice(0, limit).map((m) => m.command);
  }

  /**
   * Checks if a command exists.
   */
  has(input: string): boolean {
    return this.aliasMap.has(input.toUpperCase());
  }

  /**
   * Returns all aliases for a command ID.
   */
  getAliases(commandId: string): string[] {
    const command = this.commands.get(commandId);
    if (!command) {
      return [];
    }
    return [command.name, ...command.aliases];
  }

  /**
   * Clears all registered commands (useful for testing).
   */
  clear(): void {
    this.commands.clear();
    this.aliasMap.clear();
  }
}

// Export singleton instance
export const commandRegistry = new CommandRegistry();

// Export class for testing
export { CommandRegistry };

/**
 * Helper function to get all registered commands.
 */
export function getAllCommands(): CommandDefinition[] {
  return commandRegistry.getAll();
}
