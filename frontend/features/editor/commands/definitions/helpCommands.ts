import { useUIStore } from '@/stores/useUIStore';

import { CommandDefinition } from '../commandRegistry';

export const helpCommands: CommandDefinition[] = [
  {
    id: 'help',
    name: 'HELP',
    aliases: ['AJUDA', '?'],
    description: 'Mostra a lista de todos os comandos disponíveis',
    category: 'help',
    execute: () => {
      useUIStore.getState().setCommandHelpModalOpen(true);
      return { success: true, message: 'Abrindo ajuda...' };
    },
  },
];
