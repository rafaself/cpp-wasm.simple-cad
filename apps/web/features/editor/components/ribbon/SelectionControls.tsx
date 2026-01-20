import { Move, RotateCw, Copy, Trash2 } from 'lucide-react';
import React from 'react';

import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';
import { useUIStore } from '@/stores/useUIStore';

import { RibbonIconButton } from './RibbonIconButton';
import { RibbonToggleGroup } from './RibbonToggleGroup';
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
    <div className="ribbon-group-col px-1">
      {/* Top Row */}
      <div className="ribbon-row">
        <RibbonToggleGroup width="fit">
          <RibbonIconButton
            icon={<Move size={RIBBON_ICON_SIZES.md} />}
            onClick={() => handleToolClick('move')}
            isActive={activeTool === 'move'}
            activeStyle="mode"
            title="Mover"
            size="md"
          />
          <RibbonIconButton
            icon={<RotateCw size={RIBBON_ICON_SIZES.md} />}
            onClick={() => handleToolClick('rotate')}
            isActive={activeTool === 'rotate'}
            activeStyle="mode"
            title="Rotacionar"
            size="md"
          />
        </RibbonToggleGroup>
      </div>

      {/* Bottom Row */}
      <div className="ribbon-row">
        <RibbonToggleGroup width="fit">
          <RibbonIconButton
            icon={<Copy size={RIBBON_ICON_SIZES.md} />}
            onClick={() => handleActionClick('duplicate')}
            title="Duplicar"
            size="md"
          />
          <RibbonIconButton
            icon={<Trash2 size={RIBBON_ICON_SIZES.md} />}
            onClick={() => handleActionClick('delete')}
            title="Excluir"
            variant="danger"
            size="md"
          />
        </RibbonToggleGroup>
      </div>
    </div>
  );
};
