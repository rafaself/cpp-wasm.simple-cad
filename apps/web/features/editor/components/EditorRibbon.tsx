import { MoreHorizontal } from 'lucide-react';
import React, { useState, useRef, useCallback } from 'react';

import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';

import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useUIStore } from '../../../stores/useUIStore';
import { getRibbonTabs, RIBBON_OVERFLOW_ITEMS, RibbonItem } from '../ui/ribbonConfig';

import { RIBBON_DEBUG_ATTR, isRibbonDebugEnabled } from './ribbon/ribbonDebug';
import { RibbonGroup } from './ribbon/RibbonGroup';

const EditorRibbon: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const { executeAction, selectTool } = useEditorCommands();
  const enableColorsRibbon = useSettingsStore((s) => s.featureFlags.enableColorsRibbon);
  const ribbonTabs = React.useMemo(() => getRibbonTabs(enableColorsRibbon), [enableColorsRibbon]);
  const [activeTabId, setActiveTabId] = useState<string>(() => ribbonTabs[0]?.id ?? 'home');
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const gridSettings = useSettingsStore((s) => s.grid);
  const debugRibbon = isRibbonDebugEnabled();

  const activeActions = {
    grid: gridSettings.showDots || gridSettings.showLines,
  };

  const activeTab = ribbonTabs.find((t) => t.id === activeTabId) || ribbonTabs[0];
  const activeGroups = activeTab.groups;
  const overflowButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const ribbonContentRef = useRef<HTMLDivElement | null>(null);

  // Convert vertical mouse wheel to horizontal scroll
  const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const container = ribbonContentRef.current;
    if (!container) return;

    // Only convert if there's horizontal overflow and primarily vertical scroll
    const hasHorizontalOverflow = container.scrollWidth > container.clientWidth;
    if (hasHorizontalOverflow && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    }
  }, []);

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
      // Check for number keys corresponding to tabs (1 to ribbonTabs.length)
      if (/^[1-9]$/.test(e.key)) {
        const index = parseInt(e.key, 10) - 1;
        if (ribbonTabs[index]) {
          e.preventDefault();
          setActiveTabId(ribbonTabs[index].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ribbonTabs]);

  React.useEffect(() => {
    if (!ribbonTabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(ribbonTabs[0]?.id ?? 'home');
    }
  }, [ribbonTabs, activeTabId]);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const attrName = RIBBON_DEBUG_ATTR;
    const root = document.documentElement;
    if (debugRibbon) {
      root.setAttribute(attrName, 'true');
    } else {
      root.removeAttribute(attrName);
    }
    return () => {
      root.removeAttribute(attrName);
    };
  }, [debugRibbon]);

  return (
    <div className="flex flex-col bg-bg border-b border-border text-text">
      {/* Tab Headers */}
      <div
        className="flex items-center gap-1 px-2 bg-header"
        role="tablist"
        aria-label="Categorias de Ferramentas"
      >
        {ribbonTabs.map((tab, index) => {
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
                  ? 'bg-header-tab-active text-text font-medium'
                  : 'text-text-muted hover:text-text hover:bg-surface-2'
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

      {/* Toolbar Content - 82px total height with fixed slots */}
      <div
        ref={ribbonContentRef}
        onWheel={handleWheel}
        id={`panel-${activeTabId}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTabId}`}
        className={`relative ribbon-rail bg-surface-1 ribbon-scrollbar shadow-sm${
          debugRibbon ? ' ribbon-rail-debug' : ''
        }`}
      >
        {debugRibbon && <span className="ribbon-debug-guide" aria-hidden="true" />}
        {activeGroups.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            <RibbonGroup
              group={group}
              activeTool={activeTool}
              activeActions={activeActions}
              onItemClick={handleItemClick}
            />
            {groupIndex < activeGroups.length - 1 && (
              <div className="h-full w-px bg-border mx-2 opacity-50" aria-hidden="true" />
            )}
          </React.Fragment>
        ))}

        {/* Overflow Items Logic */}
        {RIBBON_OVERFLOW_ITEMS.length > 0 && (
          <>
            <div className="h-full w-px bg-border mx-2 opacity-50" aria-hidden="true" />
            <div className="relative flex flex-col h-full shrink-0 gap-0">
              <div className="h-[64px] flex items-center justify-center">
                <button
                  ref={overflowButtonRef}
                  onClick={() => setIsOverflowOpen((open) => !open)}
                  className="h-[52px] px-2 rounded bg-surface-1 hover:bg-surface-2 text-xs flex flex-col items-center justify-center gap-1 focus-outline"
                  title="Mais"
                  aria-haspopup="true"
                  aria-expanded={isOverflowOpen}
                >
                  <MoreHorizontal size={20} />
                  Mais
                </button>
              </div>
              <div aria-hidden="true" className="h-[18px]" />
              {isOverflowOpen && (
                <div
                  role="menu"
                  className="absolute top-full right-0 mt-1 w-56 bg-surface-2 border border-border rounded shadow-lg py-1 z-10"
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
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2 focus-outline ${
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
