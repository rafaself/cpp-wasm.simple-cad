/**
 * Tool Commands
 *
 * Commands for switching between drawing/editing tools.
 */

import type { CommandDefinition } from '../commandRegistry';

export const toolCommands: CommandDefinition[] = [
  {
    id: 'tool.select',
    name: 'SELECT',
    aliases: ['V', 'SEL'],
    description: 'Ativa a ferramenta de seleção',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('select');
      return { success: true };
    },
  },
  {
    id: 'tool.line',
    name: 'LINE',
    aliases: ['L', 'LI'],
    description: 'Ativa a ferramenta de linha',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('line');
      return { success: true };
    },
  },
  {
    id: 'tool.polyline',
    name: 'POLYLINE',
    aliases: ['PL', 'PLINE'],
    description: 'Ativa a ferramenta de polilinha',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('polyline');
      return { success: true };
    },
  },
  {
    id: 'tool.rect',
    name: 'RECTANGLE',
    aliases: ['R', 'REC', 'RECT'],
    description: 'Ativa a ferramenta de retângulo',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('rect');
      return { success: true };
    },
  },
  {
    id: 'tool.circle',
    name: 'CIRCLE',
    aliases: ['C', 'CI', 'ELLIPSE'],
    description: 'Ativa a ferramenta de círculo/elipse',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('circle');
      return { success: true };
    },
  },
  {
    id: 'tool.polygon',
    name: 'POLYGON',
    aliases: ['G', 'POL', 'POLY'],
    description: 'Ativa a ferramenta de polígono',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('polygon');
      return { success: true };
    },
  },
  {
    id: 'tool.text',
    name: 'TEXT',
    aliases: ['T', 'TX'],
    description: 'Ativa a ferramenta de texto',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('text');
      return { success: true };
    },
  },
  {
    id: 'tool.measure',
    name: 'MEASURE',
    aliases: ['M', 'DI', 'DIST'],
    description: 'Ativa a ferramenta de medição',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('measure');
      return { success: true };
    },
  },
  {
    id: 'tool.pan',
    name: 'PAN',
    aliases: ['H', 'HAND'],
    description: 'Ativa a ferramenta de panorâmica',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('pan');
      return { success: true };
    },
  },
  {
    id: 'tool.arrow',
    name: 'ARROW',
    aliases: ['AR'],
    description: 'Ativa a ferramenta de seta',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('arrow');
      return { success: true };
    },
  },
];
