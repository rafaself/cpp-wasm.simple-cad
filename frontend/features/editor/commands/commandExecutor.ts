/**
 * Command Executor
 *
 * Orchestrates command parsing and execution.
 */

import { useCommandStore } from '@/stores/useCommandStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';

import { parseCommand } from './commandParser';
import { commandRegistry, type CommandContext, type CommandResult } from './commandRegistry';
import { ensureCommandsRegistered } from './definitions';
import { useEditorCommands, type ActionId } from './useEditorCommands';

export interface ExecuteCommandResult {
  success: boolean;
  message?: string;
  commandNotFound?: boolean;
}

/**
 * Creates a command context from the current app state.
 */
function createCommandContext(
  executeAction: (id: ActionId) => void,
  selectTool: (id: string) => void,
): CommandContext {
  const settingsStore = useSettingsStore.getState();
  const uiStore = useUIStore.getState();

  return {
    executeAction,
    selectTool: (toolId) => selectTool(toolId),
    setSnapEnabled: settingsStore.setSnapEnabled,
    setSnapOption: settingsStore.setSnapOption,
    setViewTransform: uiStore.setViewTransform,
    showToast: uiStore.showToast,
  };
}

/**
 * Executes a command string.
 *
 * @param input - Raw command input (e.g., "LINE", "ZOOM 150")
 * @param executeAction - Action executor from useEditorCommands
 * @param selectTool - Tool selector from useEditorCommands
 * @returns Result of execution
 */
export function executeCommandString(
  input: string,
  executeAction: (id: ActionId) => void,
  selectTool: (id: string) => void,
): ExecuteCommandResult {
  // Ensure commands are registered
  ensureCommandsRegistered();

  // Parse the input
  const parseResult = parseCommand(input);

  if (!parseResult.success) {
    return { success: false, message: parseResult.error };
  }

  // Resolve the command
  const command = commandRegistry.resolve(parseResult.command);

  if (!command) {
    return {
      success: false,
      message: `Comando desconhecido: ${parseResult.command}`,
      commandNotFound: true,
    };
  }

  // Create context and execute
  const context = createCommandContext(executeAction, selectTool);
  const result = command.execute(parseResult.args, context);

  return {
    success: result.success,
    message: result.message,
  };
}

/**
 * Hook for executing commands from the command store.
 */
export function useCommandExecutor() {
  const { executeAction, selectTool } = useEditorCommands();
  const commandStore = useCommandStore();

  const execute = (input?: string) => {
    const commandInput = input ?? commandStore.buffer;

    if (!commandInput.trim()) {
      return { success: true }; // Empty command is a no-op
    }

    const result = executeCommandString(commandInput, executeAction, selectTool);

    // Add to history if successful or if command was found but failed
    if (result.success || !result.commandNotFound) {
      commandStore.addToHistory(commandInput);
    }

    // Show error if any
    if (!result.success && result.message) {
      commandStore.setError(result.message);
    }

    // Clear buffer after execution
    commandStore.clearBuffer();

    return result;
  };

  return { execute };
}

/**
 * Gets autocomplete suggestions for partial input.
 */
export function getCommandSuggestions(partial: string, limit: number = 5) {
  ensureCommandsRegistered();
  return commandRegistry.getSuggestions(partial, limit);
}
