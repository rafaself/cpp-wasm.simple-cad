/**
 * View Commands
 *
 * Commands for controlling the view (zoom, pan, etc.).
 */

import { parseNumberArg, parseEnumArg } from '../commandParser';
import type { CommandDefinition } from '../commandRegistry';

const ZOOM_OPTIONS = ['FIT', 'IN', 'OUT'] as const;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_FACTOR = 1.2;

export const viewCommands: CommandDefinition[] = [
  {
    id: 'view.zoom',
    name: 'ZOOM',
    aliases: ['Z', 'ZO'],
    description: 'Control zoom level (ZOOM [percentage|FIT|IN|OUT])',
    category: 'view',
    args: [
      {
        name: 'level',
        type: 'enum',
        required: false,
        options: ['FIT', 'IN', 'OUT', '<number>'],
        description: 'Zoom level percentage or action (FIT/IN/OUT)',
      },
    ],
    execute: (args, ctx) => {
      if (args.length === 0) {
        // No argument - zoom to fit
        ctx.executeAction('zoom-to-fit');
        return { success: true };
      }

      const arg = args[0];

      // Check if it's a special zoom action
      const action = parseEnumArg(arg, ZOOM_OPTIONS);
      if (action !== null) {
        switch (action) {
          case 'FIT':
            ctx.executeAction('zoom-to-fit');
            break;
          case 'IN':
            ctx.executeAction('zoom-in');
            break;
          case 'OUT':
            ctx.executeAction('zoom-out');
            break;
        }
        return { success: true };
      }

      // Try to parse as number (percentage)
      const percentage = parseNumberArg(arg);
      if (percentage !== null) {
        if (percentage < MIN_ZOOM * 100 || percentage > MAX_ZOOM * 100) {
          return {
            success: false,
            message: `Zoom must be between ${MIN_ZOOM * 100}% and ${MAX_ZOOM * 100}%`,
          };
        }

        ctx.setViewTransform((prev) => ({
          ...prev,
          scale: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, percentage / 100)),
        }));
        return { success: true };
      }

      return { success: false, message: `Invalid zoom argument: ${arg}` };
    },
  },
  {
    id: 'view.zoomIn',
    name: 'ZOOMIN',
    aliases: ['ZI'],
    description: 'Zoom in',
    category: 'view',
    execute: (_args, ctx) => {
      ctx.setViewTransform((prev) => ({
        ...prev,
        scale: Math.min(prev.scale * ZOOM_FACTOR, MAX_ZOOM),
      }));
      return { success: true };
    },
  },
  {
    id: 'view.zoomOut',
    name: 'ZOOMOUT',
    aliases: ['ZOU'],
    description: 'Zoom out',
    category: 'view',
    execute: (_args, ctx) => {
      ctx.setViewTransform((prev) => ({
        ...prev,
        scale: Math.max(prev.scale / ZOOM_FACTOR, MIN_ZOOM),
      }));
      return { success: true };
    },
  },
  {
    id: 'view.zoomFit',
    name: 'ZOOMFIT',
    aliases: ['ZF', 'FITALL'],
    description: 'Zoom to fit all entities in view',
    category: 'view',
    execute: (_args, ctx) => {
      ctx.executeAction('zoom-to-fit');
      return { success: true };
    },
  },
];
