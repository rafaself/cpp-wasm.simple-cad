import React, { useState, useRef, useEffect } from 'react';
import { 
  Building2, Plus, SlidersHorizontal, PenTool, FolderOpen, LayoutDashboard, 
  Layers, Settings, CircleDot, CornerUpLeft, RotateCw, Minus, MousePointer2,
  AlignLeft, AlignCenterHorizontal, AlignRight, AlignVerticalJustifyStart, 
  AlignCenterVertical, AlignVerticalJustifyEnd, Type, Baseline, ChevronDown, Maximize, Palette,
  Link2, Link2Off
} from 'lucide-react';
import { useAppStore } from '../../../stores/useAppStore';
import { Shape } from '../../../types';
import ColorPicker from '../../../components/ColorPicker';

const EditorSidebar: React.FC = () => {
  const store = useAppStore();
  const activeTab = store.sidebarTab;
  const setActiveTab = store.setSidebarTab;
  
  // Draggable Scroll State
  const navScrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDownRef = useRef(false);
  const dragStartRef = useRef<{x: number, scrollLeft: number} | null>(null);
  
  // Color Picker State
  const [colorPickerTarget, setColorPickerTarget] = useState<'fill' | 'stroke' | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });
  
  // Proportion Link State
  const [proportionLinked, setProportionLinked] = useState(true);

  const openSidebarColorPicker = (e: React.MouseEvent, target: 'fill' | 'stroke') => {
    e.stopPropagation();
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.top, left: rect.left - 270 });
    setColorPickerTarget(target);
  };

  const handleSidebarColorChange = (newColor: string) => {
    if (!selectedShape) return;
    if (colorPickerTarget === 'fill') updateProp('fillColor', newColor);
    if (colorPickerTarget === 'stroke') updateProp('strokeColor', newColor);
  };

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
        <div className="p-3 border-b border-slate-100">
            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2 cursor-default">Dimensões</h3>
            
            {/* W / H for all except pure lines */}
            {!isLine && (
              <div className="flex items-center gap-1 mb-2">
                <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7 hover:border-slate-300 focus-within:border-blue-500 transition-all" title="Largura">
                    <span className="text-slate-400 text-[10px] w-3 font-medium">L</span>
                    <input 
                        type="number" 
                        value={selectedShape.width !== undefined ? Math.round(selectedShape.width) : (selectedShape.radius ? Math.round(selectedShape.radius * 2) : 0)} 
                        onChange={(e) => {
                            const newWidth = parseFloat(e.target.value);
                            if (!isNaN(newWidth) && newWidth > 0) {
                                const currentWidth = selectedShape.width ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                                const currentHeight = selectedShape.height ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                                const ratio = currentHeight / currentWidth;
                                
                                if (isCircle || proportionLinked) {
                                    // Link proportions - update both
                                    const newHeight = newWidth * ratio;
                                    if (isCircle && selectedShape.radius) {
                                        updateProp('radius', newWidth / 2);
                                    } else {
                                        store.updateShape(selectedShape.id, { width: newWidth, height: newHeight });
                                    }
                                } else {
                                    updateProp('width', newWidth);
                                }
                            }
                        }}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
                    />
                </div>
                
                {/* Link Button */}
                <button
                    onClick={() => setProportionLinked(!proportionLinked)}
                    className={`p-1.5 rounded transition-colors ${proportionLinked ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 hover:text-slate-600'}`}
                    title={proportionLinked ? 'Proporções linkadas' : 'Proporções independentes'}
                >
                    {proportionLinked ? <Link2 size={14} /> : <Link2Off size={14} />}
                </button>
                
                <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7 hover:border-slate-300 focus-within:border-blue-500 transition-all" title="Altura">
                    <span className="text-slate-400 text-[10px] w-3 font-medium">A</span>
                    <input 
                        type="number" 
                        value={selectedShape.height !== undefined ? Math.round(selectedShape.height) : (selectedShape.radius ? Math.round(selectedShape.radius * 2) : 0)} 
                        onChange={(e) => {
                            const newHeight = parseFloat(e.target.value);
                            if (!isNaN(newHeight) && newHeight > 0) {
                                const currentWidth = selectedShape.width ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                                const currentHeight = selectedShape.height ?? (selectedShape.radius ? selectedShape.radius * 2 : 100);
                                const ratio = currentWidth / currentHeight;
                                
                                if (isCircle || proportionLinked) {
                                    // Link proportions - update both
                                    const newWidth = newHeight * ratio;
                                    if (isCircle && selectedShape.radius) {
                                        updateProp('radius', newHeight / 2);
                                    } else {
                                        store.updateShape(selectedShape.id, { width: newWidth, height: newHeight });
                                    }
                                } else {
                                    updateProp('height', newHeight);
                                }
                            }
                        }}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
                    />
                </div>
              </div>
            )}

            {/* Line length */}
            {isLine && selectedShape.points.length >= 2 && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-slate-500 w-16 shrink-0">Comprimento</span>
                <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7">
                    <input 
                        type="number" 
                        value={Math.round(Math.sqrt(
                            Math.pow(selectedShape.points[1].x - selectedShape.points[0].x, 2) + 
                            Math.pow(selectedShape.points[1].y - selectedShape.points[0].y, 2)
                        ))}
                        disabled
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono text-right"
                    />
                    <span className="text-[10px] text-slate-400 ml-1">px</span>
                </div>
              </div>
            )}
            
            {/* Polygon sides */}
            {isPolygon && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-slate-500 w-10 shrink-0">Lados</span>
                <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7 focus-within:border-blue-500">
                    <input 
                        type="number" 
                        min={3}
                        max={24}
                        value={selectedShape.sides || 6}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 3 && val <= 24) {
                                updateProp('sides', val);
                            }
                        }}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono text-right"
                    />
                </div>
              </div>
            )}

            {/* Arc angles */}
            {isArc && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7" title="Ângulo Inicial">
                    <span className="text-slate-400 text-[9px] w-6">Início</span>
                    <input 
                        type="number" 
                        value={Math.round((selectedShape.startAngle || 0) * (180/Math.PI))}
                        onChange={(e) => {
                            const deg = parseFloat(e.target.value);
                            if (!isNaN(deg)) updateProp('startAngle', deg * (Math.PI/180));
                        }}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
                    />
                    <span className="text-slate-400 text-[10px] ml-0.5">°</span>
                </div>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-1.5 h-7" title="Ângulo Final">
                    <span className="text-slate-400 text-[9px] w-5">Fim</span>
                    <input 
                        type="number" 
                        value={Math.round((selectedShape.endAngle || 360) * (180/Math.PI))}
                        onChange={(e) => {
                            const deg = parseFloat(e.target.value);
                            if (!isNaN(deg)) updateProp('endAngle', deg * (Math.PI/180));
                        }}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 h-6 focus:ring-0 focus:outline-none text-right font-mono p-0"
                    />
                    <span className="text-slate-400 text-[10px] ml-0.5">°</span>
                </div>
              </div>
            )}

            {/* Corner Radius (Only for Rects) */}
            {isRect && (
                 <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-slate-500 w-16 shrink-0">Arredond.</span>
                    <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7">
                        <CornerUpLeft size={10} className="text-slate-400 mr-2" />
                        <input 
                            type="number" 
                            placeholder="0"
                            disabled
                            className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono text-right disabled:opacity-50"
                        />
                        <span className="text-[10px] text-slate-400 ml-1">px</span>
                    </div>
                </div>
            )}
        </div>

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
        <div className={`p-3 border-b border-slate-100 ${selectedShape.fillColor === 'transparent' ? 'opacity-60' : ''}`}>
             <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Preenchimento</h3>
                <button 
                    onClick={() => updateProp('fillColor', selectedShape.fillColor === 'transparent' ? '#CCCCCC' : 'transparent')}
                    className={`p-1 rounded transition-colors ${
                      selectedShape.fillColor === 'transparent' 
                        ? 'text-slate-400 hover:text-slate-600' 
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                    title={selectedShape.fillColor === 'transparent' ? 'Ativar preenchimento' : 'Desativar preenchimento'}
                >
                    {selectedShape.fillColor === 'transparent' ? (
                        <CircleDot size={14} className="opacity-50" />
                    ) : (
                        <CircleDot size={14} />
                    )}
                </button>
            </div>
            
            {selectedShape.fillColor !== 'transparent' && (
              <div className="flex items-center gap-2">
                {/* Color swatch */}
                <div 
                    className="w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                    style={{backgroundColor: selectedShape.fillColor}}
                    onClick={(e) => openSidebarColorPicker(e, 'fill')}
                />
                
                {/* HEX Input */}
                <div className="flex-grow">
                    <input 
                        type="text"
                        value={selectedShape.fillColor}
                        onChange={(e) => {
                            let val = e.target.value.toUpperCase();
                            val = val.replace(/#/g, '');
                            val = val.replace(/[^0-9A-F]/g, '');
                            val = val.slice(0, 6);
                            if (val.length > 0) {
                                updateProp('fillColor', '#' + val);
                            }
                        }}
                        onBlur={(e) => {
                            let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                            if (val.length === 3) {
                                val = val.split('').map(c => c + c).join('');
                            }
                            if (val.length === 6) {
                                updateProp('fillColor', '#' + val);
                            }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none focus:border-blue-500"
                    />
                </div>
                
                {/* Opacity */}
                <div className="w-14 flex items-center bg-slate-50 border border-slate-200 rounded h-7 px-2">
                     <input 
                        type="number" 
                        min={0}
                        max={100}
                        value={selectedShape.fillOpacity ?? 100}
                        onChange={(e) => {
                            const val = parseInt(e.target.value);
                            if (!isNaN(val) && val >= 0 && val <= 100) {
                                updateProp('fillOpacity', val);
                            }
                        }}
                        className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 focus:outline-none font-mono"
                     />
                     <span className="text-[10px] text-slate-400 ml-0.5">%</span>
                </div>
              </div>
            )}
        </div>

        {/* --- STROKE --- */}
        <div className={`p-3 border-b border-slate-100 ${selectedShape.strokeEnabled === false ? 'opacity-60' : ''}`}>
             <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Traço</h3>
                <button 
                    onClick={() => updateProp('strokeEnabled', selectedShape.strokeEnabled === false ? true : false)}
                    className={`p-1 rounded transition-colors ${
                      selectedShape.strokeEnabled === false 
                        ? 'text-slate-400 hover:text-slate-600' 
                        : 'text-blue-600 hover:text-blue-700'
                    }`}
                    title={selectedShape.strokeEnabled === false ? 'Ativar traço' : 'Desativar traço'}
                >
                    {selectedShape.strokeEnabled === false ? (
                        <CircleDot size={14} className="opacity-50" />
                    ) : (
                        <CircleDot size={14} />
                    )}
                </button>
            </div>
            
            {selectedShape.strokeEnabled !== false && (
              <div className="flex flex-col gap-2">
                {/* Color row */}
                <div className="flex items-center gap-2">
                    <div 
                        className="w-6 h-6 rounded border-2 border-slate-400 flex-shrink-0 cursor-pointer hover:scale-105 transition-transform"
                        style={{backgroundColor: selectedShape.strokeColor}}
                        onClick={(e) => openSidebarColorPicker(e, 'stroke')}
                    />
                    
                    {/* HEX Input */}
                    <div className="flex-grow">
                        <input 
                            type="text"
                            value={selectedShape.strokeColor}
                            onChange={(e) => {
                                let val = e.target.value.toUpperCase();
                                val = val.replace(/#/g, '');
                                val = val.replace(/[^0-9A-F]/g, '');
                                val = val.slice(0, 6);
                                if (val.length > 0) {
                                    updateProp('strokeColor', '#' + val);
                                }
                            }}
                            onBlur={(e) => {
                                let val = e.target.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
                                if (val.length === 3) {
                                    val = val.split('').map(c => c + c).join('');
                                }
                                if (val.length === 6) {
                                    updateProp('strokeColor', '#' + val);
                                }
                            }}
                            className="w-full bg-slate-50 border border-slate-200 rounded px-2 h-7 text-[11px] text-slate-700 font-mono uppercase focus:outline-none focus:border-blue-500"
                        />
                    </div>
                    
                    {/* Opacity */}
                    <div className="w-14 flex items-center bg-slate-50 border border-slate-200 rounded h-7 px-2">
                        <input 
                            type="number"
                            min={0}
                            max={100} 
                            value={selectedShape.strokeOpacity ?? 100}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 0 && val <= 100) {
                                    updateProp('strokeOpacity', val);
                                }
                            }}
                            className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 text-right focus:ring-0 focus:outline-none font-mono"
                        />
                        <span className="text-[10px] text-slate-400 ml-0.5">%</span>
                    </div>
                </div>
                
                {/* Stroke Width */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-14 shrink-0">Espessura</span>
                    <div className="flex-grow flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-7 focus-within:border-blue-500">
                        <input 
                            type="number" 
                            min={1}
                            max={100}
                            value={selectedShape.strokeWidth || 1}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val) && val >= 1 && val <= 100) {
                                    updateProp('strokeWidth', val);
                                }
                            }}
                            className="w-full bg-transparent border-none text-[11px] text-slate-700 p-0 focus:ring-0 focus:outline-none font-mono"
                        />
                        <span className="text-[10px] text-slate-400 ml-1">px</span>
                    </div>
                </div>
              </div>
            )}
        </div>

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

      {/* Color Picker Popup */}
      {colorPickerTarget && selectedShape && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setColorPickerTarget(null)} />
          <ColorPicker 
            color={colorPickerTarget === 'fill' 
              ? (selectedShape.fillColor === 'transparent' ? '#FFFFFF' : selectedShape.fillColor)
              : selectedShape.strokeColor
            }
            onChange={handleSidebarColorChange}
            onClose={() => setColorPickerTarget(null)}
            initialPosition={colorPickerPos}
          />
        </>
      )}
    </div>
  );
};

export default EditorSidebar;
