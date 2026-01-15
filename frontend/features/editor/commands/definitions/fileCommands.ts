/**
 * File Commands
 *
 * Commands for file operations (new, open, save, export).
 */

import type { CommandDefinition } from '../commandRegistry';

export const fileCommands: CommandDefinition[] = [
  {
    id: 'file.new',
    name: 'NEW',
    aliases: ['NEWFILE'],
    description: 'Cria um novo desenho',
    category: 'file',
    execute: (_args, ctx) => {
      ctx.executeAction('new-file');
      return { success: true };
    },
  },
  {
    id: 'file.open',
    name: 'OPEN',
    aliases: ['OP', 'OPENFILE'],
    description: 'Abre um desenho existente',
    category: 'file',
    execute: (_args, ctx) => {
      ctx.executeAction('open-file');
      return { success: true };
    },
  },
  {
    id: 'file.save',
    name: 'SAVE',
    aliases: ['SA', 'SAVEFILE'],
    description: 'Salva o desenho atual',
    category: 'file',
    execute: (_args, ctx) => {
      ctx.executeAction('save-file');
      return { success: true };
    },
  },
  {
    id: 'file.export',
    name: 'EXPORT',
    aliases: ['EX'],
    description: 'Exporta o desenho',
    category: 'file',
    execute: (_args, ctx) => {
      ctx.executeAction('export-project');
      return { success: true };
    },
  },
];
