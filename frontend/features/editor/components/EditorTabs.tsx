import React from 'react';
import { X, Workflow, Lightbulb } from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { LABELS } from '@/i18n/labels';

const EditorTabs: React.FC = () => {
  const openTabs = useUIStore(s => s.openTabs);
  const activeFloorId = useUIStore(s => s.activeFloorId);
  const activeDiscipline = useUIStore(s => s.activeDiscipline);
  const openTab = useUIStore(s => s.openTab);
  const closeTab = useUIStore(s => s.closeTab);

  if (openTabs.length === 0) return null;

  return (
    <div className="flex items-center bg-slate-100 border-b border-slate-300 px-2 pt-2 gap-1 overflow-x-auto no-scrollbar h-9 shrink-0">
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
              group flex items-center gap-2 px-3 py-1.5 rounded-t-md text-xs font-medium cursor-pointer transition-colors border-t border-x border-transparent
              ${isActive 
                ? 'bg-white text-blue-600 border-slate-300 border-b-white relative -mb-[1px] z-10 shadow-sm' 
                : 'bg-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }
            `}
            onClick={() => openTab(tab)}
          >
            {tab.discipline === 'architecture' ? <Workflow size={12} /> : <Lightbulb size={12} />}
            <span>{floorName}</span>
            <span className="opacity-50 mx-1">|</span>
            <span className="uppercase tracking-wider text-[10px]">{tab.discipline === 'architecture' ? LABELS.disciplines.shortArchitecture : 'Elé'}</span>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab);
              }}
              className={`
                ml-1 p-0.5 rounded-full hover:bg-slate-300/50 
                ${isActive ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500'}
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
