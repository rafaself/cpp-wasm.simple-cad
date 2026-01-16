import { X, Workflow, Lightbulb } from 'lucide-react';
import React from 'react';

import { LABELS } from '@/i18n/labels';

import { useUIStore } from '../../../stores/useUIStore';

const EditorTabs: React.FC = () => {
  const openTabs = useUIStore((s) => s.openTabs);
  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const openTab = useUIStore((s) => s.openTab);
  const closeTab = useUIStore((s) => s.closeTab);

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-end bg-bg border-b border-border px-2 gap-1 overflow-x-auto no-scrollbar h-[26px] shrink-0">
      {openTabs.map((tab) => {
        const isActive = tab.floorId === activeFloorId && tab.discipline === activeDiscipline;
        const key = `${tab.floorId}-${tab.discipline}`;

        // Mocking floor name lookup - ideally this comes from a store selector or prop
        // For now, assuming 'terreo' -> 'Térreo' mapping or just capitalization
        const floorName = tab.floorId === 'terreo' ? 'Térreo' : tab.floorId;

        return (
          <div
            key={key}
            className={`
              group flex items-center gap-2 px-3 h-full rounded-t-md text-xs font-medium cursor-pointer transition-colors border-t border-x border-transparent select-none
              ${
                isActive
                  ? 'bg-surface-2 text-text border-border border-b-surface2 relative -mb-[1px] z-10 shadow-sm'
                  : 'bg-transparent text-text-muted hover:bg-surface-2 hover:text-text'
              }
            `}
            onClick={() => openTab(tab)}
          >
            {tab.discipline === 'architecture' ? <Workflow size={12} /> : <Lightbulb size={12} />}
            <span>{floorName}</span>
            <span className="opacity-50 mx-1">|</span>
            <span className="uppercase tracking-wider text-[10px]">
              {tab.discipline === 'architecture' ? LABELS.disciplines.shortArchitecture : 'Elé'}
            </span>

            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab);
              }}
              className={`
                ml-1 p-0.5 rounded-full hover:bg-surface-2 
                ${isActive ? 'text-text-muted hover:text-red-400' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-red-400'}
                transition-all
              `}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default EditorTabs;
