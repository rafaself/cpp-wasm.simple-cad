import React, { useState, useRef, useEffect } from 'react';
import { 
  Building2, Plus, SlidersHorizontal, PenTool, FolderOpen, LayoutDashboard, 
  Layers, Settings, MousePointer2
} from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { PositionProperties } from './properties/PositionProperties';
import { DimensionProperties } from './properties/DimensionProperties';
import { StyleProperties } from './properties/StyleProperties';

const EditorSidebar: React.FC = () => {
  const uiStore = useUIStore();
  const dataStore = useDataStore();

  const activeTab = uiStore.sidebarTab;
  const setActiveTab = uiStore.setSidebarTab;
  
  // Draggable Scroll State
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDownRef = useRef(false);
  const dragStartRef = useRef<{x: number, scrollLeft: number} | null>(null);

  // Helper to get selected shape
  const selectedShapeId = uiStore.selectedShapeIds.values().next().value;
  const selectedShape = selectedShapeId ? dataStore.shapes[selectedShapeId] : undefined;

  // --- Header Configuration ---
  const getHeaderConfig = () => {
      switch(activeTab) {
          case 'edificacao': return { title: 'Edificações', icon: <Building2 className="text-blue-600" size={16} /> };
          case 'desenho': return { title: 'Desenho', icon: <PenTool className="text-blue-600" size={16} /> };
          case 'propriedades': return { title: 'Propriedades', icon: <SlidersHorizontal className="text-blue-600" size={16} /> };
          case 'projeto': return { title: 'Projeto', icon: <FolderOpen className="text-blue-600" size={16} /> };
          case 'camadas': return { title: 'Camadas', icon: <Layers className="text-blue-600" size={16} /> };
          case 'ajustes': return { title: 'Ajustes', icon: <Settings className="text-blue-600" size={16} /> };
          default: return { title: 'Menu', icon: <LayoutDashboard className="text-blue-600" size={16} /> };
      }
  };

  const headerConfig = getHeaderConfig();

  // --- Scroll Handlers (Global for robust drag) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!navScrollRef.current) return;
    isDownRef.current = true;
    dragStartRef.current = {
        x: e.pageX,
        scrollLeft: navScrollRef.current.scrollLeft
    };
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (navScrollRef.current) {
      navScrollRef.current.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDownRef.current || !dragStartRef.current || !navScrollRef.current) return;
        e.preventDefault();
        const dx = e.pageX - dragStartRef.current.x;
        
        if (Math.abs(dx) > 5) {
            if (!isDragging) setIsDragging(true);
            navScrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx * 1.5; 
        }
    };

    const handleMouseUp = () => {
        isDownRef.current = false;
        dragStartRef.current = null;
        if (isDragging) {
            setTimeout(() => setIsDragging(false), 0);
        }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    if (isDragging) {
        document.body.style.setProperty('cursor', 'grabbing', 'important');
    }

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        if (isDragging) {
            document.body.style.removeProperty('cursor');
        }
    };
  }, [isDragging]);

  // --- Render Functions for Tabs ---

  const renderEdificacao = () => (
    <div className="flex-grow overflow-y-auto p-3 flex flex-col gap-3 bg-white">
        <div className="flex justify-between items-end">
           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Planos / Andares</span>
           <span className="text-[10px] text-slate-400">1 / 5</span>
        </div>
        <div className="w-full bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2 cursor-pointer ring-1 ring-blue-500 shadow-sm transition-all">
          <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center text-white font-bold text-xs shadow-md">
            1
          </div>
          <span className="font-semibold text-blue-900 text-xs">Térreo</span>
        </div>
        <button className="w-full border-2 border-dashed border-slate-300 rounded-lg p-2 flex items-center justify-center gap-2 text-slate-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all group">
           <Plus size={14} className="group-hover:scale-110 transition-transform" />
           <span className="text-xs font-medium">Adicionar Andar</span>
        </button>
    </div>
  );

  const renderDesenho = () => {
    if (!selectedShape) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                <MousePointer2 size={32} className="mb-4 opacity-20" />
                <p className="text-xs">Selecione um objeto para editar.</p>
            </div>
        );
    }

    return (
      <div className="flex-grow overflow-y-auto bg-white custom-scrollbar">
        <PositionProperties selectedShape={selectedShape} />
        <DimensionProperties selectedShape={selectedShape} />
        <StyleProperties selectedShape={selectedShape} />
      </div>
    );
  };

  return (
    <div className="w-64 min-w-[16rem] shrink-0 h-full bg-white border-l border-slate-300 flex flex-col shadow-sm text-slate-800 z-40 overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-slate-200 flex items-center px-3 gap-2 bg-slate-50 shrink-0">
        {headerConfig.icon}
        <span className="font-bold text-xs tracking-wide text-slate-700 uppercase">{headerConfig.title}</span>
      </div>

      {/* Conditional Content Area */}
      <div key={activeTab} className="flex-grow flex flex-col overflow-hidden menu-transition">
          {activeTab === 'edificacao' && renderEdificacao()}
          {activeTab === 'desenho' && renderDesenho()}
          {/* Placeholders for others */}
          {activeTab === 'propriedades' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Propriedades Gerais (Vazio)</div>}
          {activeTab === 'projeto' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Arquivos do Projeto (Vazio)</div>}
          {activeTab === 'camadas' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Gerenciamento de Camadas (Vazio)</div>}
          {activeTab === 'ajustes' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Configurações Gerais (Vazio)</div>}
      </div>

      {/* Bottom Navigation Tabs - Drag to Scroll Container */}
      <div 
        ref={navScrollRef}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        className={`h-12 border-t border-slate-200 flex bg-white shrink-0 overflow-x-auto no-scrollbar ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
        style={{ scrollBehavior: isDragging ? 'auto' : 'smooth' }}
      >
        <button 
          onClick={() => !isDragging && setActiveTab('propriedades')}
          title="Propriedades"
          className={`flex-none w-12 flex items-center justify-center hover:bg-slate-50 relative transition-colors duration-200 ${activeTab === 'propriedades' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <SlidersHorizontal size={18} />
        </button>
        
        <button 
          onClick={() => !isDragging && setActiveTab('desenho')}
          title="Desenho"
          className={`flex-none w-12 flex items-center justify-center hover:bg-slate-50 relative transition-colors duration-200 ${activeTab === 'desenho' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <PenTool size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('projeto')}
          title="Projeto"
          className={`flex-none w-12 flex items-center justify-center hover:bg-slate-50 relative transition-colors duration-200 ${activeTab === 'projeto' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <FolderOpen size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('edificacao')}
          title="Edificação"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 transition-colors duration-200 ${activeTab === 'edificacao' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <Building2 size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('camadas')}
          title="Camadas"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 transition-colors duration-200 ${activeTab === 'camadas' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <Layers size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('ajustes')}
          title="Ajustes"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 transition-colors duration-200 ${activeTab === 'ajustes' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
};

export default EditorSidebar;
