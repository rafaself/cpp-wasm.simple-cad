import { LayoutPanelLeft } from 'lucide-react';
import React, { useState } from 'react';

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
  const history = useUIStore((s) => s.history);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const { executeAction, selectTool } = useEditorCommands();

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
      className={`absolute z-50 bg-surface-strong/95 backdrop-blur-sm border border-border rounded-lg flex p-1 gap-0.5 transition-all duration-300 ${containerClasses}`}
      style={{
        boxShadow: '0 8px 32px rgba(255, 255, 255, 0.04), 0 1px 2px rgba(255, 255, 255, 0.02)',
      }}
      role="toolbar"
      aria-label="Barra de ferramentas de acesso rápido"
    >
      <button
        onClick={() => setOrientation((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'))}
        className={`flex items-center justify-center text-text-muted hover:text-text hover:bg-surface2 rounded-sm transition-colors overflow-visible mt-1 ${toggleClasses}`}
        title="Alternar orientacao da barra"
        aria-label="Alternar orientação da barra"
      >
        <div
          className={`flex items-center justify-center transition-transform duration-200 overflow-visible ${orientation === 'vertical' ? 'rotate-90' : ''}`}
        >
          <LayoutPanelLeft size={12} />
        </div>
      </button>

      {TOOLS.map((item) => (
        <button
          key={item.id}
          onClick={() => selectTool(item.id, item.status)}
          className={`
            flex items-center justify-center w-8 h-8 rounded-md transition-all
            ${
              activeTool === item.id
                ? 'bg-primary text-white shadow-md'
                : 'text-text-muted hover:bg-surface2 hover:text-text'
            }
          `}
          title={item.label}
          aria-label={item.label}
          aria-pressed={activeTool === item.id}
        >
          <div className="transform scale-90 flex items-center justify-center">
            {getIcon(item.icon)}
          </div>
        </button>
      ))}
    </div>
  );
};

export default QuickAccessToolbar;
