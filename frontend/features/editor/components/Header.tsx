import React from 'react';
import { 
  FilePlus, 
  FolderOpen, 
  Save, 
  Undo2, 
  Redo2, 
  Settings
} from 'lucide-react';
import { useDataStore } from '@/stores/useDataStore';
import { useUIStore } from '@/stores/useUIStore';

const Header: React.FC = () => {
  const store = useDataStore();
  const setSettingsModalOpen = useUIStore(s => s.setSettingsModalOpen);

  return (
    <div className="h-8 bg-[#0f172a] flex items-center justify-between px-2 select-none border-b border-[#1e293b]">
      {/* Left Section */}
      <div className="flex items-center gap-1.5">
        {/* Logo */}
        <div className="w-6 h-6 bg-red-600 flex items-center justify-center rounded-sm text-white font-bold text-sm">
          E
        </div>
        
        {/* App Title */}
        <div className="text-white font-semibold text-xs tracking-wide mr-1">
          EndeavourPower
        </div>

        {/* Divider */}
        <div className="h-4 w-px bg-slate-700 mx-0.5"></div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-0.5 text-slate-400">
          <button 
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title="Novo Arquivo (Ctrl+N)"
            onClick={() => console.log('New File clicked')}
          >
            <FilePlus size={14} />
          </button>
          <button 
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
             title="Abrir Arquivo (Ctrl+O)"
             onClick={() => console.log('Open File clicked')}
          >
            <FolderOpen size={14} />
          </button>
          <button 
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
             title="Salvar (Ctrl+S)"
             onClick={() => console.log('Save clicked')}
          >
            <Save size={14} />
          </button>

          <div className="h-4 w-px bg-slate-700 mx-0.5"></div>

          <button 
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title="Desfazer (Ctrl+Z)"
            onClick={() => store.undo()}
          >
            <Undo2 size={14} />
          </button>
          <button 
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title="Refazer (Ctrl+Y)"
            onClick={() => store.redo()}
          >
            <Redo2 size={14} />
          </button>

          <div className="h-4 w-px bg-slate-700 mx-0.5"></div>

          <button 
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title="Configurações"
            onClick={() => setSettingsModalOpen(true)}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Header;

