import { Move, RotateCw, Copy, Trash2 } from 'lucide-react';
import React from 'react';

import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';
import { useUIStore } from '@/stores/useUIStore';

import { RibbonIconButton } from './RibbonIconButton';
import { RIBBON_ICON_SIZES } from './ribbonUtils';

export const SelectionControls: React.FC = () => {
  const { executeAction, selectTool } = useEditorCommands();
  const activeTool = useUIStore((s) => s.activeTool);
  // We can track active actions if needed, e.g. from a store
  // For now, these are mostly tools or instantaneous actions

  const handleToolClick = (toolId: string) => {
    selectTool(toolId);
  };

  const handleActionClick = (actionId: string) => {
    executeAction(actionId);
  };

  return (
    <div className="flex flex-col h-full gap-1">
      {/* Top Row */}
      <div className="flex gap-1 flex-1">
        <RibbonIconButton
          icon={<Move size={RIBBON_ICON_SIZES.sm} />}
          onClick={() => handleToolClick('move')}
          isActive={activeTool === 'move'}
          title="Mover"
          size="sm"
          className="h-full w-7"
        />
        <RibbonIconButton
          icon={<RotateCw size={RIBBON_ICON_SIZES.sm} />}
          onClick={() => handleToolClick('rotate')}
          isActive={activeTool === 'rotate'}
          title="Rotacionar"
          size="sm"
          className="h-full w-7"
        />
      </div>

      {/* Bottom Row */}
      <div className="flex gap-1 flex-1">
        <RibbonIconButton
          icon={<Copy size={RIBBON_ICON_SIZES.sm} />}
          onClick={() => handleActionClick('duplicate')}
          title="Duplicar"
          size="sm"
          className="h-full w-7"
        />
        <RibbonIconButton
          icon={<Trash2 size={RIBBON_ICON_SIZES.sm} />}
          onClick={() => handleActionClick('delete')}
          title="Excluir"
          variant="danger"
          size="sm"
          className="h-full w-7"
        />
      </div>
    </div>
  );
};
