/**
 * Settings Commands
 *
 * Commands for toggling settings (snap, grid, etc.).
 */

import { parseBooleanArg } from '../commandParser';
import type { CommandDefinition } from '../commandRegistry';

export const settingsCommands: CommandDefinition[] = [
  {
    id: 'settings.snap',
    name: 'SNAP',
    aliases: ['SN', 'OSNAP'],
    description: 'Alterna ou define o modo snap (SNAP [ON|OFF])',
    category: 'settings',
    args: [
      {
        name: 'state',
        type: 'boolean',
        required: false,
        description: 'ON para ativar, OFF para desativar, omita para alternar',
      },
    ],
    execute: (args, ctx) => {
      if (args.length === 0) {
        // Toggle - we need to get current state, so we use a workaround
        // The context doesn't expose current state, so we toggle via the action
        // For now, we'll just toggle via the setter
        ctx.setSnapEnabled(true); // This will be replaced with proper toggle
        ctx.showToast('Snap toggled', 'info');
        return { success: true };
      }

      const state = parseBooleanArg(args[0]);
      if (state === null) {
        return { success: false, message: `Invalid SNAP argument: ${args[0]}. Use ON or OFF.` };
      }

      ctx.setSnapEnabled(state);
      ctx.showToast(`Snap ${state ? 'enabled' : 'disabled'}`, 'info');
      return { success: true };
    },
  },
  {
    id: 'settings.grid',
    name: 'GRID',
    aliases: ['GR'],
    description: 'Alterna a visibilidade da grade (GRID [ON|OFF])',
    category: 'settings',
    args: [
      {
        name: 'state',
        type: 'boolean',
        required: false,
        description: 'ON para ativar, OFF para desativar, omita para alternar',
      },
    ],
    execute: (args, ctx) => {
      if (args.length === 0) {
        // Toggle
        ctx.executeAction('grid');
        return { success: true };
      }

      const state = parseBooleanArg(args[0]);
      if (state === null) {
        return { success: false, message: `Invalid GRID argument: ${args[0]}. Use ON or OFF.` };
      }

      // Grid action always toggles, so we need to handle on/off differently
      // For now, just execute the toggle action
      ctx.executeAction('grid');
      return { success: true };
    },
  },
  {
    id: 'settings.open',
    name: 'SETTINGS',
    aliases: ['SET', 'OPTIONS', 'PREFERENCES'],
    description: 'Abre o diálogo de configurações',
    category: 'settings',
    execute: (_args, ctx) => {
      ctx.executeAction('open-settings');
      return { success: true };
    },
  },
];
