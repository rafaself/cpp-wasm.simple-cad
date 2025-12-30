import React, { useState } from 'react';
import { MoreHorizontal } from 'lucide-react';

import { useUIStore } from '../../../stores/useUIStore';
import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';
import { RIBBON_GROUPS, RIBBON_OVERFLOW_ITEMS, RibbonItem } from '../ui/ribbonConfig';

const EditorRibbon: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const { executeAction, selectTool } = useEditorCommands();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  return (
    <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center gap-2 px-3 text-slate-200">
      {RIBBON_GROUPS.map((group, groupIndex) => (
        <React.Fragment key={group.id}>
          <div className="flex items-center gap-1">
            {group.items.map((item: RibbonItem) => {
              const Icon = item.icon;
              const isTool = item.kind === 'tool';
              const isActiveTool = isTool && activeTool === item.toolId;
              const isIconOnlyAction = item.kind === 'action' && (item.actionId === 'undo' || item.actionId === 'redo');
              const isStub = item.status === 'stub';
              const baseClasses =
                item.kind === 'action' && isIconOnlyAction
                  ? 'h-7 w-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center'
                  : 'h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1';
              const toolClasses = isTool
                ? `h-7 px-2 rounded text-xs flex items-center gap-1 transition-colors ${
                    isActiveTool ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700'
                  }`
                : baseClasses;

              const handleClick = () => {
                if (item.kind === 'action' && item.actionId) {
                  executeAction(item.actionId, item.status);
                } else if (item.kind === 'tool' && item.toolId) {
                  selectTool(item.toolId, item.status);
                }
              };

              return (
                <button
                  key={item.id}
                  onClick={handleClick}
                  className={`${toolClasses} ${isStub ? 'opacity-70' : ''}`}
                  title={isStub ? `${item.label} — Em breve (Engine-First)` : item.label}
                  aria-disabled={isStub}
                >
                  <Icon size={14} />
                  {!isIconOnlyAction && item.kind === 'action' && <span>{item.label}</span>}
                  {isTool && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>

          {groupIndex < RIBBON_GROUPS.length - 1 && <div className="h-5 w-px bg-slate-700 mx-2" />}
        </React.Fragment>
      ))}

      {RIBBON_OVERFLOW_ITEMS.length > 0 && (
        <>
          <div className="h-5 w-px bg-slate-700 mx-2" />
          <div className="relative">
            <button
              onClick={() => setIsOverflowOpen((open) => !open)}
              className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1"
              title="Mais"
            >
              <MoreHorizontal size={14} />
              Mais
            </button>
            {isOverflowOpen && (
              <div className="absolute top-full left-0 mt-1 w-56 bg-slate-800 border border-slate-700 rounded shadow-lg py-1 z-10">
                {RIBBON_OVERFLOW_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isStub = item.status === 'stub';
                  const title = isStub ? `${item.label} — Em breve (Engine-First)` : item.label;

                  const handleClick = () => {
                    if (item.kind === 'action' && item.actionId) {
                      executeAction(item.actionId, item.status);
                    } else if (item.kind === 'tool' && item.toolId) {
                      selectTool(item.toolId, item.status);
                    }
                    setIsOverflowOpen(false);
                  };

                  return (
                    <button
                      key={item.id}
                      onClick={handleClick}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-700 ${
                        isStub ? 'opacity-70' : ''
                      }`}
                      title={title}
                      aria-disabled={isStub}
                    >
                      <Icon size={14} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default EditorRibbon;
