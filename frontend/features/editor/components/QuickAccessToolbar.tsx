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
      : 'flex-row bottom-4 left-1/2 -translate-x-1/2';

  const toggleClasses =
    orientation === 'vertical'
      ? 'w-full h-3 border-b border-border/50 mb-0.5'
      : 'self-stretch w-3 border-r border-border/50 mr-0.5';

  return (
    <div
      className={`absolute z-50 bg-surface-strong/95 backdrop-blur-sm border border-border rounded-lg shadow-xl flex p-1 gap-0.5 transition-all duration-300 ${containerClasses}`}
      role="toolbar"
      aria-label="Barra de ferramentas de acesso rápido"
    >
      <button
        onClick={() => setOrientation((prev) => (prev === 'vertical' ? 'horizontal' : 'vertical'))}
        className={`flex items-center justify-center text-text-muted hover:text-text hover:bg-surface2 rounded-sm transition-colors ${toggleClasses}`}
        title="Alternar orientacao da barra"
        aria-label="Alternar orientação da barra"
      >
        {orientation === 'vertical' ? (
          <LayoutPanelLeft size={10} className="rotate-90" />
        ) : (
          <LayoutPanelLeft size={10} />
        )}
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

      <div
        className={`bg-border/50 ${orientation === 'vertical' ? 'h-px w-full my-0.5' : 'w-px h-full mx-0.5'}`}
      />

      <button
        onClick={() => executeAction('undo')}
        disabled={!history.canUndo}
        className="flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:bg-surface2 hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
        title="Desfazer"
        aria-label="Desfazer"
      >
        <div className="transform scale-90 flex items-center justify-center">{getIcon('Undo')}</div>
      </button>
      <button
        onClick={() => executeAction('redo')}
        disabled={!history.canRedo}
        className="flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:bg-surface2 hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
        title="Refazer"
        aria-label="Refazer"
      >
        <div className="transform scale-90 flex items-center justify-center">{getIcon('Redo')}</div>
      </button>
    </div>
  );
};

export default QuickAccessToolbar;
