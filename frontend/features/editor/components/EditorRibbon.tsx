import React from 'react';
import { FolderOpen, Save, Undo2, Redo2, Type, MousePointer2, Square, Circle, Minus, PenTool } from 'lucide-react';

import { useUIStore } from '../../../stores/useUIStore';
import { LABELS } from '@/i18n/labels';
import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';

const TOOL_BUTTONS = [
  { id: 'select', label: LABELS.tools.select, icon: MousePointer2 },
  { id: 'line', label: LABELS.tools.line, icon: Minus },
  { id: 'rect', label: LABELS.tools.rect, icon: Square },
  { id: 'circle', label: LABELS.tools.circle, icon: Circle },
  { id: 'polyline', label: LABELS.tools.polyline, icon: PenTool },
  { id: 'text', label: LABELS.tools.text, icon: Type },
];

const EditorRibbon: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const { executeAction, selectTool } = useEditorCommands();

  return (
    <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center gap-2 px-3 text-slate-200">
      <div className="flex items-center gap-1">
        <button
          onClick={() => executeAction('open-file')}
          className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1"
          title={LABELS.menu.openFile}
        >
          <FolderOpen size={14} />
          {LABELS.menu.openFile}
        </button>
        <button
          onClick={() => executeAction('save-file')}
          className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1"
          title={LABELS.menu.saveFile}
        >
          <Save size={14} />
          {LABELS.menu.saveFile}
        </button>
        <button
          onClick={() => executeAction('undo')}
          className="h-7 w-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
          title={LABELS.menu.undo}
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={() => executeAction('redo')}
          className="h-7 w-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
          title={LABELS.menu.redo}
        >
          <Redo2 size={14} />
        </button>
      </div>

      <div className="h-5 w-px bg-slate-700 mx-2" />

      <div className="flex items-center gap-1">
        {TOOL_BUTTONS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => selectTool(tool.id)}
              className={`h-7 px-2 rounded text-xs flex items-center gap-1 transition-colors ${
                active ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700'
              }`}
              title={tool.label}
            >
              <Icon size={14} />
              {tool.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EditorRibbon;
