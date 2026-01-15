import { useMemo } from 'react';

import { useUIStore } from '@/stores/useUIStore';
import { ToolType } from '@/types';

export type ColorTargetMode = 'selection' | 'tool' | 'none';
export type ToolKind = 'shape' | 'text' | 'none';

const DRAWING_TOOLS: ToolType[] = [
  'line',
  'arrow',
  'circle',
  'rect',
  'polygon',
  'polyline',
  'text',
];

export const isDrawingTool = (tool: ToolType): boolean => DRAWING_TOOLS.includes(tool);

export const resolveColorTargetMode = (
  selectionCount: number,
  activeTool: ToolType,
): ColorTargetMode => {
  if (selectionCount > 0) return 'selection';
  if (isDrawingTool(activeTool)) return 'tool';
  return 'none';
};

export const useColorTargetResolver = (selectionCount: number) => {
  const activeTool = useUIStore((s) => s.activeTool);

  return useMemo(() => {
    const mode = resolveColorTargetMode(selectionCount, activeTool);
    const toolKind: ToolKind =
      mode === 'tool' && activeTool === 'text' ? 'text' : mode === 'tool' ? 'shape' : 'none';

    return {
      mode,
      activeTool,
      toolKind,
      isDrawingTool: isDrawingTool(activeTool),
    };
  }, [selectionCount, activeTool]);
};
