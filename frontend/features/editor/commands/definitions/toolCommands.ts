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
    description: 'Switch to selection tool',
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
    description: 'Switch to line tool',
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
    description: 'Switch to polyline tool',
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
    description: 'Switch to rectangle tool',
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
    description: 'Switch to circle/ellipse tool',
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
    description: 'Switch to polygon tool',
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
    description: 'Switch to text tool',
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
    description: 'Switch to measure tool',
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
    description: 'Switch to pan tool',
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
    description: 'Switch to arrow tool',
    category: 'tools',
    execute: (_args, ctx) => {
      ctx.selectTool('arrow');
      return { success: true };
    },
  },
];
