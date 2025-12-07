import React, { useState, useRef, useEffect } from 'react';
import { 
  Building2, Plus, SlidersHorizontal, PenTool, FolderOpen, LayoutDashboard, 
  Layers, Settings, CircleDot, CornerUpLeft, RotateCw, Minus, MousePointer2,
  AlignLeft, AlignCenterHorizontal, AlignRight, AlignVerticalJustifyStart, 
  AlignCenterVertical, AlignVerticalJustifyEnd, Type, Baseline, ChevronDown, Maximize, Palette
} from 'lucide-react';
import { useAppStore } from '../../../stores/useAppStore';
import { Shape } from '../../../types';

const EditorSidebar: React.FC = () => {
  const store = useAppStore();
  const activeTab = store.sidebarTab;
  const setActiveTab = store.setSidebarTab;
  
  // Draggable Scroll State
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDownRef = useRef(false);
  const dragStartRef = useRef<{x: number, scrollLeft: number} | null>(null);

  // Helper to get selected shape (Single selection focus for MVP)
  const selectedShapeId = store.selectedShapeIds.values().next().value;
  const selectedShape = selectedShapeId ? store.shapes[selectedShapeId] : undefined;

  // Helper to update properties
  const updateProp = (prop: keyof Shape, value: any) => {
    if (!selectedShape) return;
    store.updateShape(selectedShape.id, { [prop]: value });
  };

  const updateDimension = (prop: 'width' | 'height' | 'x' | 'y', value: string) => {
      const num = parseFloat(value);
      if(!isNaN(num)) updateProp(prop, num);
  }

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

  // Allow horizontal scrolling using the vertical mouse wheel
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
        
        // Threshold check to distinguish click from drag (5px)
        if (Math.abs(dx) > 5) {
            if (!isDragging) setIsDragging(true);
            navScrollRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx * 1.5; 
        }
    };

    const handleMouseUp = () => {
        isDownRef.current = false;
        dragStartRef.current = null;
        if (isDragging) {
            // Delay setting isDragging to false to ensure onClick handlers
            // check the correct state before it resets
            setTimeout(() => setIsDragging(false), 0);
        }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    if (isDragging) {
        // Force cursor to 'grabbing' on body to ensure it persists outside the element
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

    const isRect = selectedShape.type === 'rect';
    const isText = selectedShape.type === 'text';
    const isLine = selectedShape.type === 'line' || selectedShape.type === 'polyline';
    const isArc = selectedShape.type === 'arc';
    const isCircle = selectedShape.type === 'circle';
    const isPolygon = selectedShape.type === 'polygon';
    const showRadius = isArc || isCircle || isPolygon;

    return (
      <div className="flex-grow overflow-y-auto bg-white custom-scrollbar">
        {/* --- POSITION SECTION --- */}
        <div className="p-3 border-b border-slate-100">
            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2">Posição</h3>
            
            {/* X / Y / Rotation Grid */}
            <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                    <span className="text-slate-400 text-[10px] w-3 font-medium">X</span>
                    <input 
                        type="number" 
                        value={selectedShape.x !== undefined ? Math.round(selectedShape.x) : 0} 
                        onChange={(e) => updateDimension('x', e.target.value)}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
                    />
                </div>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                    <span className="text-slate-400 text-[10px] w-3 font-medium">Y</span>
                    <input 
                        type="number" 
                        value={selectedShape.y !== undefined ? Math.round(selectedShape.y) : 0} 
                        onChange={(e) => updateDimension('y', e.target.value)}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
                    />
                </div>
            </div>

            {/* Rotation */}
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                <RotateCw size={10} className="text-slate-400 mr-2" />
                <input 
                    type="number" 
                    value={Math.round((selectedShape.rotation || 0) * (180/Math.PI))} 
                    onChange={(e) => {
                        const deg = parseFloat(e.target.value);
                        if(!isNaN(deg)) updateProp('rotation', deg * (Math.PI/180));
                    }}
                    className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
                />
                <span className="text-slate-400 text-[10px] ml-1">°</span>
            </div>
        </div>

        {/* --- LAYOUT / DIMENSIONS --- */}
        {!isLine && (
        <div className="p-3 border-b border-slate-100">
            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2">Layout</h3>
             <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all" title="Largura">
                    <span className="text-slate-400 text-[10px] w-3 font-medium">L</span>
                    <input 
                        type="number" 
                        value={selectedShape.width !== undefined ? Math.round(selectedShape.width) : (selectedShape.radius ? Math.round(selectedShape.radius * 2) : 0)} 
                        onChange={(e) => updateDimension('width', e.target.value)}
                        disabled={!isRect && selectedShape.type !== 'text'} 
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono disabled:opacity-50 p-0"
                    />
                </div>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all" title="Altura">
                    <span className="text-slate-400 text-[10px] w-3 font-medium">A</span>
                    <input 
                        type="number" 
                        value={selectedShape.height !== undefined ? Math.round(selectedShape.height) : (selectedShape.radius ? Math.round(selectedShape.radius * 2) : 0)} 
                        onChange={(e) => updateDimension('height', e.target.value)}
                        disabled={!isRect && selectedShape.type !== 'text'}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono disabled:opacity-50 p-0"
                    />
                </div>
            </div>
            
            {/* Radius Control for Arc/Circle/Polygon */}
            {showRadius && (
                 <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 mt-2 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                    <CircleDot size={10} className="text-slate-400 mr-2" />
                    <span className="text-[10px] text-slate-400 mr-auto">Raio</span>
                    <input 
                        type="number" 
                        value={selectedShape.radius ? Math.round(selectedShape.radius) : 0} 
                        onChange={(e) => updateProp('radius', parseFloat(e.target.value))}
                        className="w-12 bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
                    />
                </div>
            )}

            {/* Corner Radius (Only for Rects usually) */}
            {isRect && (
                 <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 mt-2 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                    <CornerUpLeft size={10} className="text-slate-400 mr-2" />
                    <span className="text-[10px] text-slate-400 mr-auto">Raio</span>
                    <input 
                        type="number" 
                        placeholder="0"
                        disabled // Not implemented in render yet, visual placeholder
                        className="w-12 bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono disabled:opacity-50 p-0"
                    />
                </div>
            )}
        </div>
        )}

        {/* --- TYPOGRAPHY (Conditional) --- */}
        {isText && (
            <div className="p-3 border-b border-slate-100">
                <div className="flex justify-between items-center mb-2">
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Tipografia</h3>
                    <Type size={10} className="text-slate-400" />
                </div>
                
                {/* Font Family */}
                <div className="mb-2">
                    <div className="relative">
                        <select 
                            value={selectedShape.fontFamily || 'sans-serif'}
                            onChange={(e) => updateProp('fontFamily', e.target.value)}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-blue-500"
                        >
                            <option value="sans-serif">Inter</option>
                            <option value="serif">Serif</option>
                            <option value="monospace">Monospace</option>
                            <option value="Arial">Arial</option>
                        </select>
                        <ChevronDown size={10} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {/* Style & Size */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                     <div className="relative">
                        <select 
                            value={selectedShape.fontBold ? 'bold' : 'regular'}
                            onChange={(e) => updateProp('fontBold', e.target.value === 'bold')}
                            className="w-full appearance-none bg-slate-50 border border-slate-200 rounded px-2 h-6 text-[11px] text-slate-700 outline-none focus:border-blue-500"
                        >
                            <option value="regular">Regular</option>
                            <option value="bold">Bold (Negrito)</option>
                        </select>
                        <ChevronDown size={10} className="absolute right-2 top-2 text-slate-400 pointer-events-none" />
                    </div>
                     <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 hover:border-slate-300 focus-within:border-blue-500">
                        <span className="text-[9px] text-slate-400 mr-1">Px</span>
                        <input 
                            type="number" 
                            value={selectedShape.fontSize || 12}
                            onChange={(e) => updateProp('fontSize', parseInt(e.target.value))}
                            className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 text-right font-mono p-0"
                        />
                    </div>
                </div>

                {/* Line Height & Letter Spacing (Mocked UI) */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                     <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5" title="Altura da Linha">
                        <Baseline size={10} className="text-slate-400 mr-1" />
                        <span className="text-[9px] text-slate-500">Auto</span>
                    </div>
                     <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5" title="Espaçamento entre Letras">
                        <span className="text-[9px] text-slate-400 mr-1 tracking-widest">A|A</span>
                        <span className="text-[9px] text-slate-500 ml-auto">0%</span>
                    </div>
                </div>

                {/* Text Alignment (Mocked UI actions) */}
                <div className="flex bg-slate-50 border border-slate-200 rounded p-0.5 justify-between">
                     <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><AlignLeft size={12} /></button>
                     <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><AlignCenterHorizontal size={12} /></button>
                     <button className="p-1 hover:bg-slate-200 rounded text-slate-600"><AlignRight size={12} /></button>
                </div>
            </div>
        )}

        {/* --- FILL --- */}
        <div className="p-3 border-b border-slate-100">
             <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Preenchimento</h3>
                <button className="text-slate-400 hover:text-slate-900"><Plus size={12} /></button>
            </div>
            <div className="flex items-center gap-2 group">
                <div className="w-5 h-5 rounded border border-slate-300 relative overflow-hidden flex-shrink-0">
                    <input 
                        type="color" 
                        value={selectedShape.fillColor === 'transparent' ? '#ffffff' : selectedShape.fillColor} 
                        onChange={(e) => updateProp('fillColor', e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div 
                        className="w-full h-full" 
                        style={{backgroundColor: selectedShape.fillColor === 'transparent' ? 'transparent' : selectedShape.fillColor}} 
                    />
                    {selectedShape.fillColor === 'transparent' && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-full h-[1px] bg-red-500 rotate-45 transform"></div>
                        </div>
                    )}
                </div>
                <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-6 focus-within:border-blue-500">
                    <span className="text-[11px] text-slate-700 font-mono uppercase flex-grow">
                        {selectedShape.fillColor === 'transparent' ? 'Nenhum' : selectedShape.fillColor}
                    </span>
                </div>
                <div className="w-10 flex items-center bg-slate-50 border border-slate-200 rounded px-1 h-6 focus-within:border-blue-500">
                     <input 
                        type="number" 
                        value={selectedShape.fillColor === 'transparent' ? 0 : 100}
                        disabled
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 font-mono"
                     />
                     <span className="text-[9px] text-slate-400 ml-0.5">%</span>
                </div>
            </div>
        </div>

        {/* --- STROKE --- */}
        <div className="p-3 border-b border-slate-100">
             <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Traço</h3>
                <button className="text-slate-400 hover:text-slate-900"><Plus size={12} /></button>
            </div>
            <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded border border-slate-300 relative overflow-hidden flex-shrink-0">
                        <input 
                            type="color" 
                            value={selectedShape.strokeColor} 
                            onChange={(e) => updateProp('strokeColor', e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <div 
                            className="w-full h-full" 
                            style={{backgroundColor: selectedShape.strokeColor}} 
                        />
                    </div>
                    <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-6 focus-within:border-blue-500">
                        <span className="text-[11px] text-slate-700 font-mono uppercase flex-grow">
                            {selectedShape.strokeColor}
                        </span>
                    </div>
                    <div className="w-10 flex items-center bg-slate-50 border border-slate-200 rounded px-1 h-6 focus-within:border-blue-500">
                        <input 
                            type="number" 
                            value={100}
                            disabled
                            className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 font-mono"
                        />
                        <span className="text-[9px] text-slate-400 ml-0.5">%</span>
                    </div>
                </div>
                
                {/* Stroke Width */}
                <div className="flex items-center gap-2 mt-1">
                     <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-6 w-full focus-within:border-blue-500">
                        <Minus size={10} className="text-slate-400 mr-2" />
                        <input 
                            type="number" 
                            min="1"
                            value={selectedShape.strokeWidth || 1}
                            onChange={(e) => updateProp('strokeWidth', parseInt(e.target.value))}
                            className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 font-mono"
                        />
                        <span className="text-[9px] text-slate-400 ml-1">px</span>
                     </div>
                </div>
            </div>
        </div>

      </div>
    );
  };

  return (
    <div className="w-64 h-full bg-white border-l border-slate-300 flex flex-col shadow-sm text-slate-800 z-40">
      {/* Header */}
      <div className="h-10 border-b border-slate-200 flex items-center px-3 gap-2 bg-slate-50 shrink-0">
        {headerConfig.icon}
        <span className="font-bold text-xs tracking-wide text-slate-700 uppercase">{headerConfig.title}</span>
      </div>

      {/* Conditional Content Area */}
      {activeTab === 'edificacao' && renderEdificacao()}
      {activeTab === 'desenho' && renderDesenho()}
      {/* Placeholders for others */}
      {activeTab === 'propriedades' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Propriedades Gerais (Vazio)</div>}
      {activeTab === 'projeto' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Arquivos do Projeto (Vazio)</div>}
      {activeTab === 'camadas' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Gerenciamento de Camadas (Vazio)</div>}
      {activeTab === 'ajustes' && <div className="flex-grow p-4 text-slate-400 text-xs text-center">Configurações Gerais (Vazio)</div>}

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
          className={`flex-none w-12 flex items-center justify-center hover:bg-slate-50 relative ${activeTab === 'propriedades' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          {activeTab === 'propriedades' && <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-600" />}
          <SlidersHorizontal size={18} />
        </button>
        
        <button 
          onClick={() => !isDragging && setActiveTab('desenho')}
          title="Desenho"
          className={`flex-none w-12 flex items-center justify-center hover:bg-slate-50 relative ${activeTab === 'desenho' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          {activeTab === 'desenho' && <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-600" />}
          <PenTool size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('projeto')}
          title="Projeto"
          className={`flex-none w-12 flex items-center justify-center hover:bg-slate-50 relative ${activeTab === 'projeto' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
          {activeTab === 'projeto' && <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-600" />}
          <FolderOpen size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('edificacao')}
          title="Edificação"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 ${activeTab === 'edificacao' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
           {/* Active Indicator Line */}
           {activeTab === 'edificacao' && <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-600" />}
          <Building2 size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('camadas')}
          title="Camadas"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 ${activeTab === 'camadas' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
           {activeTab === 'camadas' && <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-600" />}
          <Layers size={18} />
        </button>

        <button 
          onClick={() => !isDragging && setActiveTab('ajustes')}
          title="Ajustes"
          className={`flex-none w-12 flex items-center justify-center relative hover:bg-slate-50 ${activeTab === 'ajustes' ? 'text-blue-600 bg-blue-50/50' : 'text-slate-500'} ${isDragging ? 'pointer-events-none' : ''}`}
        >
           {activeTab === 'ajustes' && <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-600" />}
          <Settings size={18} />
        </button>

      </div>
    </div>
  );
};

export default EditorSidebar;
