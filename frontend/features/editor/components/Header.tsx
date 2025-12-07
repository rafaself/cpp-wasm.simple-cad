import React from 'react';
import { 
  FilePlus, 
  FolderOpen, 
  Save, 
  Undo2, 
  Redo2, 
  Moon 
} from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';

const Header: React.FC = () => {
  const store = useAppStore();

  return (
    <div className="h-10 bg-[#0f172a] flex items-center justify-between px-2 select-none border-b border-[#1e293b]">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        {/* Logo */}
        <div className="w-8 h-8 bg-red-600 flex items-center justify-center rounded-sm text-white font-bold text-lg">
          E
        </div>
        
        {/* App Title */}
        <div className="text-white font-semibold text-sm tracking-wide mr-2">
          EndeavourPower
        </div>

        {/* Divider */}
        <div className="h-5 w-px bg-slate-700 mx-1"></div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1 text-slate-400">
          <button 
            className="p-1.5 hover:bg-slate-800 rounded-md hover:text-white transition-colors"
            title="Novo Arquivo (Ctrl+N)"
            onClick={() => console.log('New File clicked')}
          >
            <FilePlus size={16} />
          </button>
          <button 
            className="p-1.5 hover:bg-slate-800 rounded-md hover:text-white transition-colors"
             title="Abrir Arquivo (Ctrl+O)"
             onClick={() => console.log('Open File clicked')}
          >
            <FolderOpen size={16} />
          </button>
          <button 
            className="p-1.5 hover:bg-slate-800 rounded-md hover:text-white transition-colors"
             title="Salvar (Ctrl+S)"
             onClick={() => console.log('Save clicked')}
          >
            <Save size={16} />
          </button>

          <div className="h-5 w-px bg-slate-700 mx-1"></div>

          <button 
            className="p-1.5 hover:bg-slate-800 rounded-md hover:text-white transition-colors"
            title="Desfazer (Ctrl+Z)"
            onClick={() => store.undo()}
          >
            <Undo2 size={16} />
          </button>
          <button 
            className="p-1.5 hover:bg-slate-800 rounded-md hover:text-white transition-colors"
            title="Refazer (Ctrl+Y)"
            onClick={() => store.redo()}
          >
            <Redo2 size={16} />
          </button>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center text-slate-400 pr-2">
        <button 
            className="p-1.5 hover:bg-slate-800 rounded-md hover:text-white transition-colors"
            title="Alternar Tema"
        >
          <Moon size={16} />
        </button>
      </div>
    </div>
  );
};

export default Header;
