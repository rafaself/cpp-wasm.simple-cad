import { MoreHorizontal } from 'lucide-react';
import React, { useState } from 'react';

import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';

import { useUIStore } from '../../../stores/useUIStore';
import { RIBBON_TABS, RIBBON_OVERFLOW_ITEMS, RibbonItem } from '../ui/ribbonConfig';

import { RibbonGroup } from './ribbon/RibbonGroup';

const EditorRibbon: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const { executeAction, selectTool } = useEditorCommands();
  const [activeTabId, setActiveTabId] = useState<string>(RIBBON_TABS[0].id);
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);

  const activeTab = RIBBON_TABS.find((t) => t.id === activeTabId) || RIBBON_TABS[0];
  const activeGroups = activeTab.groups;
  const overflowButtonRef = React.useRef<HTMLButtonElement | null>(null);

  const handleItemClick = (item: RibbonItem) => {
    if (item.kind === 'action' && item.actionId) {
      executeAction(item.actionId, item.status);
    } else if (item.kind === 'tool' && item.toolId) {
      selectTool(item.toolId, item.status);
    }
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Check for number keys corresponding to tabs (1 to RIBBON_TABS.length)
      if (/^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        if (RIBBON_TABS[index]) {
          e.preventDefault();
          setActiveTabId(RIBBON_TABS[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col bg-bg border-b border-border text-text">
      {/* Tab Headers */}
      <div
        className="flex items-center gap-1 px-2 pt-1"
        role="tablist"
        aria-label="Categorias de Ferramentas"
      >
        {RIBBON_TABS.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTabId(tab.id)}
              className={`relative px-3 py-1 text-xs rounded-t transition-colors focus-outline ${
                isActive
                  ? 'bg-surface1 text-text font-medium'
                  : 'text-text-muted hover:text-text hover:bg-surface2/60'
              }`}
              title={`${tab.label} (${index + 1})`}
            >
              {tab.label}
              <span
                className={`absolute bottom-0 left-0 h-[2px] w-full bg-primary transition-transform ease-out origin-center ${
                  isActive ? 'scale-x-100 duration-300' : 'scale-x-0 duration-150'
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {/* Toolbar Content - 90px total height per Gold Standard */}
      <div
        id={`panel-${activeTabId}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTabId}`}
        className="h-[90px] px-[12px] py-[6px] flex items-start bg-surface1 overflow-x-auto shadow-sm"
      >
        {activeGroups.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            <RibbonGroup group={group} activeTool={activeTool} onItemClick={handleItemClick} />
            {groupIndex < activeGroups.length - 1 && (
              <div className="h-full w-px bg-border mx-2 opacity-50" aria-hidden="true" />
            )}
          </React.Fragment>
        ))}

        {/* Overflow Items Logic */}
        {RIBBON_OVERFLOW_ITEMS.length > 0 && (
          <>
            <div className="h-full w-px bg-border mx-2 opacity-50" aria-hidden="true" />
            <div className="relative self-start h-[54px] flex items-center">
              <button
                ref={overflowButtonRef}
                onClick={() => setIsOverflowOpen((open) => !open)}
                className="h-[52px] px-2 rounded bg-surface1 hover:bg-surface2 text-xs flex flex-col items-center justify-center gap-1 focus-outline"
                title="Mais"
                aria-haspopup="true"
                aria-expanded={isOverflowOpen}
              >
                <MoreHorizontal size={20} />
                Mais
              </button>
              {isOverflowOpen && (
                <div
                  role="menu"
                  className="absolute top-full right-0 mt-1 w-56 bg-surface-strong border border-border rounded shadow-lg py-1 z-10"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsOverflowOpen(false);
                      overflowButtonRef.current?.focus();
                    }
                  }}
                >
                  {RIBBON_OVERFLOW_ITEMS.map((item) => {
                    const isStub = item.status === 'stub';
                    const title = isStub ? `${item.label} — Em breve (Engine-First)` : item.label;
                    const Icon = item.icon;

                    const handleClick = () => {
                      if (item.kind === 'action' && item.actionId) {
                        executeAction(item.actionId, item.status);
                      } else if (item.kind === 'tool' && item.toolId) {
                        selectTool(item.toolId, item.status);
                      }
                      setIsOverflowOpen(false);
                      overflowButtonRef.current?.focus();
                    };

                    return (
                      <button
                        role="menuitem"
                        key={item.id}
                        onClick={handleClick}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted focus-outline ${
                          isStub ? 'opacity-70' : ''
                        }`}
                        title={title}
                        aria-disabled={isStub}
                      >
                        {Icon ? <Icon size={14} /> : null}
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
    </div>
  );
};

export default EditorRibbon;
