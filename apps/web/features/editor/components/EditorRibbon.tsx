import React, { useState, useRef, useCallback } from 'react';

import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';

import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useUIStore } from '../../../stores/useUIStore';
import { useRibbonTabTracking } from '../../../utils/analytics/useRibbonTracking';
import { getRibbonTabs, RIBBON_OVERFLOW_ITEMS, RibbonItem } from '../ui/ribbonConfig';
import { getRibbonTabsV2 } from '../ui/ribbonConfigV2';
import { computeRibbonLayoutV2, RibbonOverflowEntry } from '../ui/ribbonLayoutV2';

import { RIBBON_DEBUG_ATTR, isRibbonDebugEnabled } from './ribbon/ribbonDebug';
import { RibbonGroup } from './ribbon/RibbonGroup';
import { RibbonLayoutProvider, useRibbonLayoutTier } from './ribbon/ribbonLayout';
import { RibbonOverflowMenu } from './ribbon/RibbonOverflowMenu';

const EditorRibbon: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const { executeAction, selectTool } = useEditorCommands();
  const enableColorsRibbon = useSettingsStore((s) => s.featureFlags.enableColorsRibbon);
  const enableRibbonV2 = useSettingsStore((s) => s.featureFlags.enableRibbonV2);
  const ribbonTabs = React.useMemo(
    () =>
      enableRibbonV2 ? getRibbonTabsV2(enableColorsRibbon) : getRibbonTabs(enableColorsRibbon),
    [enableRibbonV2, enableColorsRibbon],
  );
  const [activeTabId, setActiveTabId] = useState<string>(() => ribbonTabs[0]?.id ?? 'home');
  const gridSettings = useSettingsStore((s) => s.grid);
  const debugRibbon = isRibbonDebugEnabled();
  const { trackTabSwitch } = useRibbonTabTracking();
  const prevActiveTabRef = useRef<string>(activeTabId);

  const activeActions = {
    grid: gridSettings.showDots || gridSettings.showLines,
  };

  const activeTab = ribbonTabs.find((t) => t.id === activeTabId) || ribbonTabs[0];
  const ribbonContentRef = useRef<HTMLDivElement | null>(null);
  const { tier, width } = useRibbonLayoutTier(ribbonContentRef);
  const layoutTier = enableRibbonV2 ? tier : 'full';
  const layout = React.useMemo(
    () => (enableRibbonV2 ? computeRibbonLayoutV2(activeTab, layoutTier) : null),
    [enableRibbonV2, activeTab, layoutTier],
  );
  const activeGroups = layout ? layout.groups : activeTab.groups;
  const overflowEntries = React.useMemo<RibbonOverflowEntry[]>(
    () =>
      enableRibbonV2
        ? (layout?.overflow ?? [])
        : RIBBON_OVERFLOW_ITEMS.map((item) => ({ item, groupId: 'overflow', groupLabel: 'Mais' })),
    [enableRibbonV2, layout?.overflow],
  );

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

  const handleTabSwitch = useCallback(
    (newTabId: string, method: 'click' | 'keyboard') => {
      const oldTabId = prevActiveTabRef.current;
      if (oldTabId !== newTabId) {
        trackTabSwitch(oldTabId, newTabId, method);
        prevActiveTabRef.current = newTabId;
      }
      setActiveTabId(newTabId);
    },
    [trackTabSwitch],
  );

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
          handleTabSwitch(ribbonTabs[index].id, 'keyboard');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ribbonTabs, handleTabSwitch]);

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
              onClick={() => handleTabSwitch(tab.id, 'click')}
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
      <RibbonLayoutProvider tier={layoutTier} width={width}>
        <div
          ref={ribbonContentRef}
          onWheel={handleWheel}
          id={`panel-${activeTabId}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTabId}`}
          data-ribbon-tier={layoutTier}
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
                tabId={activeTabId}
              />
              {groupIndex < activeGroups.length - 1 && (
                <div className="h-full w-px bg-border mx-2 opacity-50" aria-hidden="true" />
              )}
            </React.Fragment>
          ))}

          {overflowEntries.length > 0 && (
            <>
              <div className="h-full w-px bg-border mx-2 opacity-50" aria-hidden="true" />
              <RibbonOverflowMenu
                items={overflowEntries}
                tabId={activeTabId}
                onItemSelect={handleItemClick}
              />
            </>
          )}
        </div>
      </RibbonLayoutProvider>
    </div>
  );
};

export default EditorRibbon;
