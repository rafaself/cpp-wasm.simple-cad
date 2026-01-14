/**
 * Edit Commands
 *
 * Commands for editing operations (undo, redo, delete, etc.).
 */

import type { CommandDefinition } from '../commandRegistry';

export const editCommands: CommandDefinition[] = [
  {
    id: 'edit.undo',
    name: 'UNDO',
    aliases: ['U'],
    description: 'Undo the last action',
    category: 'edit',
    execute: (_args, ctx) => {
      ctx.executeAction('undo');
      return { success: true };
    },
  },
  {
    id: 'edit.redo',
    name: 'REDO',
    aliases: ['RE'],
    description: 'Redo the last undone action',
    category: 'edit',
    execute: (_args, ctx) => {
      ctx.executeAction('redo');
      return { success: true };
    },
  },
  {
    id: 'edit.delete',
    name: 'DELETE',
    aliases: ['DEL', 'E', 'ERASE'],
    description: 'Delete selected entities',
    category: 'edit',
    requiresSelection: true,
    execute: (_args, ctx) => {
      ctx.executeAction('delete');
      return { success: true };
    },
  },
];
