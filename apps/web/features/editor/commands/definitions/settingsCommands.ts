/**
 * Settings Commands
 *
 * Commands for toggling settings (snap, grid, etc.).
 */

import { useSettingsStore } from '@/stores/useSettingsStore';

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
        // Toggle - get current state and flip it
        const currentState = useSettingsStore.getState().snap.enabled;
        const newState = !currentState;
        ctx.setSnapEnabled(newState);
        ctx.showToast(`Snap ${newState ? 'ativado' : 'desativado'}`, 'info');
        return { success: true };
      }

      const state = parseBooleanArg(args[0]);
      if (state === null) {
        return { success: false, message: `Argumento SNAP inválido: ${args[0]}. Use ON ou OFF.` };
      }

      ctx.setSnapEnabled(state);
      ctx.showToast(`Snap ${state ? 'ativado' : 'desativado'}`, 'info');
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
      const { grid, setGridShowDots, setGridShowLines } = useSettingsStore.getState();
      const isCurrentlyEnabled = grid.showDots || grid.showLines;

      if (args.length === 0) {
        // Toggle - if any grid is visible, turn off, otherwise turn on
        if (isCurrentlyEnabled) {
          setGridShowDots(false);
          setGridShowLines(false);
          ctx.showToast('Grade desativada', 'info');
        } else {
          setGridShowDots(true);
          ctx.showToast('Grade ativada', 'info');
        }
        return { success: true };
      }

      const state = parseBooleanArg(args[0]);
      if (state === null) {
        return { success: false, message: `Argumento GRID inválido: ${args[0]}. Use ON ou OFF.` };
      }

      // Set to specific state
      if (state) {
        // Turn on - enable dots if not already enabled
        if (!isCurrentlyEnabled) {
          setGridShowDots(true);
        }
        ctx.showToast('Grade ativada', 'info');
      } else {
        // Turn off - disable both dots and lines
        setGridShowDots(false);
        setGridShowLines(false);
        ctx.showToast('Grade desativada', 'info');
      }
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
