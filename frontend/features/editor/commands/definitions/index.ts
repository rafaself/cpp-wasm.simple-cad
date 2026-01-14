/**
 * Command Definitions Index
 *
 * Aggregates and registers all command definitions.
 */

import { commandRegistry } from '../commandRegistry';

import { editCommands } from './editCommands';
import { fileCommands } from './fileCommands';
import { settingsCommands } from './settingsCommands';
import { toolCommands } from './toolCommands';
import { viewCommands } from './viewCommands';

/**
 * All command definitions, grouped by category.
 */
export const allCommands = [
  ...toolCommands,
  ...editCommands,
  ...viewCommands,
  ...settingsCommands,
  ...fileCommands,
];

/**
 * Registers all commands with the registry.
 * Should be called once at application startup.
 */
export function registerAllCommands(): void {
  for (const command of allCommands) {
    commandRegistry.register(command);
  }
}

/**
 * Check if commands have been registered.
 */
let commandsRegistered = false;

/**
 * Ensures commands are registered (idempotent).
 */
export function ensureCommandsRegistered(): void {
  if (!commandsRegistered) {
    registerAllCommands();
    commandsRegistered = true;
  }
}

// Re-export individual command groups
export { toolCommands } from './toolCommands';
export { editCommands } from './editCommands';
export { viewCommands } from './viewCommands';
export { settingsCommands } from './settingsCommands';
export { fileCommands } from './fileCommands';
