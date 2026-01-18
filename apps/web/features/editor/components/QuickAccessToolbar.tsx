import { LayoutPanelLeft } from 'lucide-react';
import React, { useState } from 'react';

import { IconButton } from '@/components/ui';
import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';

import { useUIStore } from '../../../stores/useUIStore';
import { getIcon } from '../../../utils/iconMap';

const TOOLS = [
  { id: 'select', icon: 'Select', label: 'Selecionar', status: 'ready' as const },
  { id: 'pan', icon: 'Hand', label: 'Pan', status: 'ready' as const },
  { id: 'line', icon: 'Line', label: 'Linha', status: 'ready' as const },
  { id: 'rect', icon: 'Rect', label: 'Retangulo', status: 'ready' as const },
  { id: 'circle', icon: 'Circle', label: 'Circulo', status: 'ready' as const },
  { id: 'move', icon: 'Move', label: 'Mover', status: 'stub' as const },
];

const QuickAccessToolbar: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const { selectTool } = useEditorCommands();

  const containerClasses =
    orientation === 'vertical'
      ? 'flex-col left-2 top-1/2 -translate-y-1/2'
      : 'flex-row bottom-10 left-1/2 -translate-x-1/2';

  const toggleClasses =
    orientation === 'vertical'
      ? 'w-8 border-b border-border/50 mb-1'
      : 'h-8 border-r border-border/50 mr-1';

  return (
    <div
      className={`absolute z-canvas-hud bg-surface-2/95 backdrop-blur-sm border border-border rounded-lg flex p-1 gap-0.5 transition-all duration-300 ${containerClasses}`}
      style={{
        boxShadow: '0 8px 32px rgba(255, 255, 255, 0.04), 0 1px 2px rgba(255, 255, 255, 0.02)',
      }}
      role="toolbar"
      aria-label="Barra de ferramentas de acesso rápido"
    >
      <IconButton
        aria-label="Alternar orientação da barra"
        tone="secondary"
        size="sm"
        className={`overflow-visible mt-1 ${toggleClasses}`}
        onClick={() => setOrientation((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'))}
        icon={
          <div
            className={`flex items-center justify-center transition-transform duration-200 overflow-visible ${
              orientation === 'vertical' ? 'rotate-90' : ''
            }`}
          >
            <LayoutPanelLeft size={12} />
          </div>
        }
      />

      {TOOLS.map((item) => (
        <IconButton
          key={item.id}
          aria-label={item.label}
          title={item.label}
          tone={activeTool === item.id ? 'primary' : 'secondary'}
          pressed={activeTool === item.id}
          size="md"
          className="w-8 h-8"
          onClick={() => selectTool(item.id, item.status)}
          icon={<div className="transform scale-90 flex items-center justify-center">{getIcon(item.icon)}</div>}
        />
      ))}
    </div>
  );
};

export default QuickAccessToolbar;
