import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Building2, Plus, SlidersHorizontal, PenTool, FolderOpen, LayoutDashboard,
  Layers, Settings, MousePointer2, Zap, GitBranch, Workflow, Lightbulb
} from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { PositionProperties } from './properties/PositionProperties';
import { DimensionProperties } from './properties/DimensionProperties';
import { StyleProperties } from './properties/StyleProperties';
import { PlanProperties } from './properties/PlanProperties';
import ElectricalLibraryPanel from '../../library/ElectricalLibraryPanel';
import ElectricalProperties from './properties/ElectricalProperties';
import DiagramPanel from '../../diagram/DiagramPanel';
import { ImportPlanModal } from '../../import/ImportPlanModal';
import { usePlanImport } from '../../import/usePlanImport';
import DisciplineContextMenu from './DisciplineContextMenu';
import PlanLayerControls from './properties/PlanLayerControls';

const EditorSidebar: React.FC = () => {
  const sidebarTab = useUIStore((s) => s.sidebarTab);
  const setSidebarTab = useUIStore((s) => s.setSidebarTab);
  const setActiveDiscipline = useUIStore((s) => s.setActiveDiscipline);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const dataStore = useDataStore();

  const activeFloorId = useUIStore((s) => s.activeFloorId);
  const activeDiscipline = useUIStore((s) => s.activeDiscipline);
  const openTab = useUIStore((s) => s.openTab);

  const { isImportModalOpen, importMode, openImportPdfModal, openImportImageModal, closeImportModal, handleFileImport } = usePlanImport();

  const activeTab = sidebarTab;
  const setActiveTab = setSidebarTab;

  useEffect(() => {
    if (sidebarTab === 'eletrica') {
      setActiveDiscipline('electrical');
    } else if (sidebarTab === 'edificacao' || sidebarTab === 'desenho' || sidebarTab === 'propriedades') {
      setActiveDiscipline('architecture');
    }
  }, [sidebarTab, setActiveDiscipline]);
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    discipline: 'architecture' | 'electrical';
    floorId: string;
  } | null>(null);

  // Draggable Scroll State
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDownRef = useRef(false);
  const dragStartRef = useRef<{x: number, scrollLeft: number} | null>(null);

  // Helper to get selected shape
  const selectedShapeId = selectedShapeIds.values().next().value;
  const selectedShape = selectedShapeId ? dataStore.shapes[selectedShapeId] : undefined;

  // --- Project Structure Definition ---
  interface Floor {
    id: string;
    name: string;
    disciplines: ('architecture' | 'electrical')[];
  }

  const projectStructure: Floor[] = [
    { id: 'terreo', name: 'Térreo', disciplines: ['architecture', 'electrical'] },
    // Add more floors here as needed
  ];

  // --- Header Configuration ---
  const getHeaderConfig = () => {
      switch(activeTab) {
          case 'edificacao': return { title: 'Edificacoes', icon: <Building2 className="text-blue-600" size={16} /> };
          case 'desenho': return { title: 'Desenho', icon: <PenTool className="text-blue-600" size={16} /> };
          case 'propriedades': return { title: 'Propriedades', icon: <SlidersHorizontal className="text-blue-600" size={16} /> };
          case 'projeto': return { title: 'Projeto', icon: <FolderOpen className="text-blue-600" size={16} /> };
          case 'camadas': return { title: 'Camadas', icon: <Layers className="text-blue-600" size={16} /> };
          case 'eletrica': return { title: 'Lancamento', icon: <Zap className="text-blue-600" size={16} /> };
          case 'diagrama': return { title: 'Diagrama', icon: <GitBranch className="text-blue-600" size={16} /> };
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
    <div className="flex-grow overflow-y-auto p-3 flex flex-col gap-2 bg-white text-slate-700">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-1 mb-1">
            Plantas e Disciplinas
        </h3>

        {projectStructure.map((floor) => (
            <div key={floor.id} className="flex flex-col gap-1">
                {/* Floor Header */}
                <div
                    className={`flex items-center gap-2 p-2 rounded-md transition-colors cursor-pointer
                                ${activeFloorId === floor.id ? 'bg-blue-500 text-white' : 'bg-slate-100 hover:bg-slate-200'}`}
                    onClick={() => openTab({ floorId: floor.id, discipline: 'electrical' })}
                >
                    <Building2 size={16} />
                    <span className="font-semibold text-xs">{floor.name}</span>
                </div>

                {/* Disciplines for the Floor */}
                <div className="ml-4 border-l border-slate-300">
                    {floor.disciplines.map((discipline) => (
                        <div
                            key={`${floor.id}-${discipline}`}
                            className={`flex items-center gap-2 p-2 pl-3 text-xs rounded-r-md transition-colors cursor-pointer
                                        ${activeFloorId === floor.id && activeDiscipline === discipline
                                            ? 'bg-blue-100 text-blue-700 font-medium'
                                            : 'hover:bg-slate-100'
                                        }`}
                            onClick={(e) => {
                                openTab({ floorId: floor.id, discipline });
                                if (discipline === 'architecture' || discipline === 'electrical') {
                                    setContextMenu({
                                        visible: true,
                                        x: e.clientX - 200,
                                        y: e.clientY,
                                        discipline,
                                        floorId: floor.id
                                    });
                                }
                            }}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({
                                    visible: true,
                                    x: e.clientX - 200,
                                    y: e.clientY,
                                    discipline,
                                    floorId: floor.id
                                });
                            }}
                        >
                            {discipline === 'architecture' ? <Workflow size={14} /> : <Lightbulb size={14} />}
                            <span>{discipline === 'architecture' ? 'Arquitetura' : 'Elétrica'}</span>
                        </div>
                    ))}
                </div>
            </div>
        ))}
        
        {contextMenu && contextMenu.visible && (
            <DisciplineContextMenu
                discipline={contextMenu.discipline}
                floorId={contextMenu.floorId}
                position={{ x: contextMenu.x, y: contextMenu.y }}
                onClose={() => setContextMenu(null)}
                onImportPdf={openImportPdfModal}
                onImportImage={openImportImageModal}
            />
        )}

        <button className="w-full mt-2 border-2 border-dashed border-slate-300 rounded-lg p-2 flex items-center justify-center gap-2 text-slate-500 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all group">
           <Plus size={14} className="group-hover:scale-110 transition-transform" />
           <span className="text-xs font-medium">Adicionar Andar</span>
        </button>

        {isImportModalOpen && (
            <ImportPlanModal
                isOpen={isImportModalOpen}
                mode={importMode}
                onClose={closeImportModal}
                onImport={handleFileImport}
                title={importMode === 'pdf' ? "Importar Planta (PDF/SVG)" : "Importar Imagem"}
                accept={importMode === 'pdf' ? ".pdf,.svg" : ".png,.jpg,.jpeg"}
            />
        )}
    </div>
  );

  const renderDesenho = () => {
    if (!selectedShape) {
        return (
            <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-4 text-center min-h-0 overflow-hidden">
                <MousePointer2 size={32} className="mb-4 opacity-20 shrink-0" />
                <p className="text-xs">Selecione um objeto para editar.</p>
            </div>
        );
    }

    // Only show drawing properties if in Architecture discipline or if it's an electrical shape
    if (activeDiscipline === 'architecture' || (selectedShape.discipline === 'electrical')) {
        return (
            <div className="flex-grow overflow-y-auto bg-white custom-scrollbar min-h-0">
                <PositionProperties selectedShape={selectedShape} />
                <DimensionProperties selectedShape={selectedShape} />
                <StyleProperties selectedShape={selectedShape} />
            </div>
        );
    }
    
    return (
      <div className="flex-grow overflow-y-auto bg-white custom-scrollbar min-h-0">
        <PositionProperties selectedShape={selectedShape} />
        <DimensionProperties selectedShape={selectedShape} />
        <StyleProperties selectedShape={selectedShape} />
        {selectedShape.svgRaw && <PlanLayerControls shape={selectedShape} />}
      </div>
    );
  };

  const renderPropriedades = () => {
    if (!selectedShape) {
      return (
        <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-4 text-center min-h-0 overflow-hidden">
          <SlidersHorizontal size={32} className="mb-4 opacity-20 shrink-0" />
          <p className="text-xs">Selecione um objeto para ver suas propriedades.</p>
        </div>
      );
    }

    // Determine if we should show properties based on discipline
    // We allow showing properties for Electrical elements even in Architecture mode if they are selected (though selection might be prevented)
    // But mainly we care about the Active Discipline.
    // If selected shape is from a different discipline, we might show "Read Only" or limited props?
    // Current logic: if selected, show props. `useCanvasInteraction` handles selection prevention.

    return (
      <div className="flex-grow overflow-y-auto bg-white custom-scrollbar min-h-0">
        <PositionProperties selectedShape={selectedShape} />
        
        {selectedShape.electricalElementId && (
            <ElectricalProperties selectedShape={selectedShape} />
        )}

        {/* Plan / Reference Properties */}
        {(selectedShape.svgRaw || selectedShape.discipline === 'architecture') && (
            <PlanProperties selectedShape={selectedShape} />
        )}

        {/* Standard shapes (not imported plans/symbols) - show style/dimensions */}
        {/* We exclude electrical symbols (which have svgRaw) from generic dimension editing if desired, or keep it. */}
        {/* Usually electrical symbols have fixed dimensions or scale. Let's hide Dimension/Style for SVG symbols for now to keep it clean, or just Style. */}
        {!selectedShape.svgRaw && (
            <>
                <DimensionProperties selectedShape={selectedShape} />
                <StyleProperties selectedShape={selectedShape} />
            </>
        )}
      </div>
    );
  };

  const renderDiagrama = () => (
    <div className="flex-grow min-h-0 p-3 bg-white">
      <DiagramPanel />
    </div>
  );

  return (
    <div className="w-64 min-w-[16rem] shrink-0 h-full bg-white border-l border-slate-300 flex flex-col shadow-sm text-slate-800 z-40 overflow-hidden">
      {/* Header */}
      <div className="h-10 border-b border-slate-200 flex items-center px-3 gap-2 bg-slate-50 shrink-0">
        {headerConfig.icon}
        <span className="font-bold text-xs tracking-wide text-slate-700 uppercase">{headerConfig.title}</span>
      </div>

      {/* Conditional Content Area */}
      <div key={activeTab} className="flex-grow flex flex-col overflow-hidden min-h-0">
          {activeTab === 'edificacao' && renderEdificacao()}
          {activeTab === 'desenho' && renderDesenho()}
          {/* Other sections with proper icons */}
          {activeTab === 'propriedades' && renderPropriedades()}
          {activeTab === 'projeto' && (
              <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-4 text-center min-h-0 overflow-hidden">
                  <FolderOpen size={32} className="mb-4 opacity-20 shrink-0" />
                  <p className="text-xs">Arquivos do projeto aparecerao aqui.</p>
              </div>
          )}
          {activeTab === 'camadas' && (
              <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-4 text-center min-h-0 overflow-hidden">
                  <Layers size={32} className="mb-4 opacity-20 shrink-0" />
                  <p className="text-xs">Use o gerenciador de camadas no ribbon.</p>
              </div>
          )}
          {activeTab === 'eletrica' && (
              <div className="flex-grow min-h-0 p-3 bg-white">
                  <ElectricalLibraryPanel compact />
              </div>
          )}
          {activeTab === 'diagrama' && renderDiagrama()}
          {activeTab === 'ajustes' && (
              <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-4 text-center min-h-0 overflow-hidden">
                  <Settings size={32} className="mb-4 opacity-20 shrink-0" />
                  <p className="text-xs">Configuracoes gerais do projeto.</p>
              </div>
          )}
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
          title="Edificacao"
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
          onClick={() => !isDragging && setActiveTab('eletrica')}
          title="Lancamento"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 transition-colors duration-200 ${activeTab === 'eletrica' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <Zap size={18} />
        </button>
        <button
          onClick={() => !isDragging && setActiveTab('diagrama')}
          title="Diagrama"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 transition-colors duration-200 ${activeTab === 'diagrama' ? 'text-blue-600 bg-blue-50/50 sidebar-tab-active' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          <GitBranch size={18} />
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
