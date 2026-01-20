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
    <div className="flex items-end bg-surface-2 border-b border-border px-2 gap-1 overflow-x-auto no-scrollbar h-7 shrink-0">
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
              group flex items-center gap-2 px-3 h-full rounded-t-md text-body font-medium cursor-pointer select-none
              transition-colors border border-transparent
              ${
                isActive
                  ? 'bg-surface-1 text-text border-border border-b-transparent shadow-sm'
                  : 'bg-transparent text-text-subtle hover:bg-surface-1 hover:text-text hover:border-border'
              }
            `}
            onClick={() => openTab(tab)}
          >
            {tab.discipline === 'architecture' ? <Workflow size={12} /> : <Lightbulb size={12} />}
            <span>{floorName}</span>
            <span className="text-text-subtle text-label">|</span>
            <span className="uppercase tracking-wider text-label text-text-subtle">
              {tab.discipline === 'architecture' ? LABELS.disciplines.shortArchitecture : 'Elé'}
            </span>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab);
              }}
              aria-label={LABELS.common.close}
              className={`
                ml-1 inline-flex items-center justify-center p-0_5 rounded-full
                transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                ${isActive ? 'text-text-muted hover:text-error' : 'text-text-muted opacity-0 group-hover:opacity-100 hover:text-error'}
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
