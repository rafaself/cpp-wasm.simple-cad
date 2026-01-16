import { Settings2, PenTool, FolderOpen, Building2, MousePointer2 } from 'lucide-react';
import React from 'react';

import { useUIStore } from '@/stores/useUIStore';

import SidebarTabs, { SidebarTabConfig } from './sidebar/SidebarTabs';
import { DrawingInspectorPanel } from './drawing/DrawingInspectorPanel';

const PlaceholderTab: React.FC<{ name: string }> = ({ name }) => (
  <div className="flex-1 flex items-center justify-center p-4 text-text-muted text-xs text-center select-none">
    Painel de {name} <br /> (Em desenvolvimento)
  </div>
);

const EditorSidebar: React.FC = () => {
  const activeTabId = useUIStore((s) => s.sidebarTab);
  const setActiveTabId = useUIStore((s) => s.setSidebarTab);

  const SIDEBAR_TABS: SidebarTabConfig[] = [
    {
      id: 'properties',
      label: 'Propriedades',
      icon: Settings2,
      component: <PlaceholderTab name="Propriedades" />,
    },
    {
      id: 'drawing',
      label: 'Desenho',
      icon: PenTool,
      component: (
        <div className="flex-1 overflow-y-auto p-3">
          <DrawingInspectorPanel />
        </div>
      ),
    },

    {
      id: 'project',
      label: 'Projeto',
      icon: FolderOpen,
      component: <PlaceholderTab name="Projeto" />,
    },
    {
      id: 'building',
      label: 'Edificação',
      icon: Building2,
      component: <PlaceholderTab name="Edificação" />,
    },
    {
      id: 'cursor',
      label: 'Cursor',
      icon: MousePointer2,
      component: <PlaceholderTab name="Cursor" />,
    },
  ];

  const activeTab = SIDEBAR_TABS.find((t) => t.id === activeTabId) || SIDEBAR_TABS[0]; // Default to properties

  return (
    <aside className="w-64 bg-surface-1 text-text border-l border-border flex flex-col h-full overflow-hidden">
      {/* Tabs Navigation */}
      <div className="shrink-0 border-b border-border">
        <SidebarTabs tabs={SIDEBAR_TABS} activeTabId={activeTabId} onTabChange={setActiveTabId} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">{activeTab.component}</div>
    </aside>
  );
};

export default EditorSidebar;
