import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { MENU_CONFIG } from '../../../config/menu';
import { getIcon } from '../../../utils/iconMap.tsx';
import { Eye, EyeOff, Lock, Unlock, Plus, Layers, Settings2, AlignLeft, AlignCenterHorizontal, AlignRight, Bold, Italic, Underline, Strikethrough, Type, ChevronDown, ChevronUp } from 'lucide-react';
import ColorPicker from '../../../components/ColorPicker';
import { getWrappedLines, TEXT_PADDING } from '../../../utils/geometry';

// Shared styles
const LABEL_STYLE = "text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1 block text-center";
const INPUT_STYLE = "w-full h-7 bg-slate-900 border border-slate-700/50 rounded flex items-center px-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all";
const BASE_BUTTON_STYLE = "rounded hover:bg-slate-700 active:bg-slate-600 transition-colors text-slate-400 hover:text-slate-100";
const CENTERED_BUTTON_STYLE = `flex items-center justify-center ${BASE_BUTTON_STYLE}`;
const ACTIVE_BUTTON_STYLE = "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30";

const NumberSpinner: React.FC<{ value: number; onChange: (val: number) => void; min: number; max: number; label?: string; className?: string }> = ({ value, onChange, min, max, label, className }) => {
    const [tempValue, setTempValue] = useState(value.toString());
    const [isFocused, setIsFocused] = useState(false);
    
    useEffect(() => {
        if (!isFocused) setTempValue(value.toString());
    }, [value, isFocused]);

    const handleCommit = () => {
        let val = parseFloat(tempValue);
        if (isNaN(val)) val = value;
        val = Math.max(min, Math.min(val, max));
        onChange(val);
        setTempValue(val.toString());
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleCommit();
            (e.target as HTMLElement).blur();
        }
    };

    const increment = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(Math.min(value + 1, max));
    };

    const decrement = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange(Math.max(value - 1, min));
    };

    return (
        <div className={`flex items-center bg-slate-800/60 border ${isFocused ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-slate-700/50'} rounded h-6 ${className || 'w-[60px]'} relative overflow-hidden transition-all`}>
            <input
                type="text"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onBlur={() => { setIsFocused(false); handleCommit(); }}
                onFocus={() => setIsFocused(true)}
                onKeyDown={handleKeyDown}
                className="w-full h-full bg-transparent text-[10px] text-center text-slate-200 font-mono focus:outline-none px-1 pl-2"
            />
            {label && <span className="absolute right-5 pointer-events-none text-[8px] text-slate-500 pt-0.5">{label}</span>}
            <div className="flex flex-col h-full border-l border-slate-700/50 w-4 bg-slate-800/80">
                <button 
                    onClick={increment}
                    className="flex-1 flex items-center justify-center hover:bg-slate-700 active:bg-blue-600/50 text-slate-400 hover:text-white transition-colors border-b border-slate-700/50"
                >
                    <ChevronUp size={8} strokeWidth={3} />
                </button>
                <button 
                    onClick={decrement}
                    className="flex-1 flex items-center justify-center hover:bg-slate-700 active:bg-blue-600/50 text-slate-400 hover:text-white transition-colors"
                >
                     <ChevronDown size={8} strokeWidth={3} />
                </button>
            </div>
        </div>
    );
};

// Text Controls
const FontFamilyControl: React.FC<any> = ({ uiStore, selectedTextIds, applyTextUpdate }) => (
    <div className="flex flex-col justify-center w-[138px] px-1">
        <div className="relative">
            <select
                value={uiStore.textFontFamily}
                onChange={(e) => {
                    uiStore.setTextFontFamily(e.target.value);
                    if (selectedTextIds.length > 0) applyTextUpdate({ fontFamily: e.target.value }, true);
                }}
                className={`${INPUT_STYLE} appearance-none cursor-pointer pr-8`}
            >
                <option value="Inter">Inter</option>
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Verdana">Verdana</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-slate-500 pointer-events-none" />
        </div>
    </div>
);

const FontSizeControl: React.FC<any> = ({ uiStore, selectedTextIds, applyTextUpdate }) => (
    <div className="flex flex-col justify-center w-[104px] px-1 items-center">
        <NumberSpinner
            value={uiStore.textFontSize}
            onChange={(val) => {
                uiStore.setTextFontSize(val);
                if (selectedTextIds.length > 0) applyTextUpdate({ fontSize: val }, true);
            }}
            min={8}
            max={256}
            className="w-full"
        />
    </div>
);

const TextAlignControl: React.FC<any> = ({ uiStore, selectedTextIds, applyTextUpdate }) => (
    <div className="flex flex-col justify-center gap-1 px-1">
        <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-7 gap-0.5">
            {[
                { align: 'left', icon: <AlignLeft size={16} /> },
                { align: 'center', icon: <AlignCenterHorizontal size={16} /> },
                { align: 'right', icon: <AlignRight size={16} /> }
            ].map(({ align, icon }) => (
                <button
                    key={align}
                    onClick={() => {
                        uiStore.setTextAlign(align as any);
                        if (selectedTextIds.length > 0) applyTextUpdate({ align: align as any }, false);
                    }}
                    className={`w-8 h-full ${CENTERED_BUTTON_STYLE} ${uiStore.textAlign === align ? 'bg-blue-600/30 text-blue-400' : ''}`}
                    title={align}
                >
                    {icon}
                </button>
            ))}
        </div>
    </div>
);

const TextStyleControl: React.FC<any> = ({ uiStore, selectedTextIds, applyTextUpdate }) => (
    <div className="flex flex-col justify-center gap-1 px-1">
        <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-7 gap-0.5">
            {[
                { key: 'bold', icon: <Bold size={16} />, active: uiStore.textBold, setter: uiStore.setTextBold, recalc: true },
                { key: 'italic', icon: <Italic size={16} />, active: uiStore.textItalic, setter: uiStore.setTextItalic, recalc: true },
                { key: 'underline', icon: <Underline size={16} />, active: uiStore.textUnderline, setter: uiStore.setTextUnderline, recalc: false },
                { key: 'strike', icon: <Strikethrough size={16} />, active: uiStore.textStrike, setter: uiStore.setTextStrike, recalc: false },
            ].map(({ key, icon, active, setter, recalc }) => (
                <button
                    key={key}
                    onClick={() => {
                        const next = !active;
                        setter(next);
                        if (selectedTextIds.length > 0) {
                            const diff: any = {};
                            diff[key === 'bold' ? 'bold' : key === 'italic' ? 'italic' : key === 'underline' ? 'underline' : 'strike'] = next;
                            applyTextUpdate(diff, recalc);
                        }
                    }}
                    className={`w-8 h-full ${CENTERED_BUTTON_STYLE} ${active ? 'bg-blue-600/30 text-blue-400' : ''}`}
                    title={key}
                >
                    {icon}
                </button>
            ))}
        </div>
    </div>
);

const TextFormatGroup: React.FC<any> = (props) => (
    <div className="flex flex-col justify-center gap-1 h-full py-1">
        <div className="flex items-center gap-2">
             <FontFamilyControl {...props} />
             <FontSizeControl {...props} />
        </div>
        <div className="flex items-center gap-2">
             <TextStyleControl {...props} />
             <TextAlignControl {...props} />
        </div>
    </div>
);

// Component Registry for Config-Driven UI
const ComponentRegistry: Record<string, React.FC<any>> = {
    'FontFamilyControl': FontFamilyControl,
    'FontSizeControl': FontSizeControl,
    'TextAlignControl': TextAlignControl,
    'TextStyleControl': TextStyleControl,
    'TextFormatGroup': TextFormatGroup,
    'LayerControl': ({ activeLayer, isLayerDropdownOpen, setLayerDropdownOpen, openLayerDropdown, closeLayerDropdown, layerButtonRef, dropdownPos, dataStore, uiStore }) => (
        <div className="flex flex-col justify-center gap-1.5 h-full px-2 w-[180px]">
            {/* Top Row: Layer Select */}
            <div className="w-full relative">
                <button
                    ref={layerButtonRef}
                    className={`${INPUT_STYLE} justify-between cursor-pointer hover:bg-slate-800 hover:border-slate-600 w-full`}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if (isLayerDropdownOpen) {
                            setLayerDropdownOpen(false);
                        } else {
                            openLayerDropdown();
                        }
                    }}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <Layers size={14} style={{ color: activeLayer?.color || 'white' }} />
                        <span className="truncate">{activeLayer?.name || 'Selecione'}</span>
                    </div>
                    <ChevronDown size={12} className="text-slate-500" />
                </button>
                 {isLayerDropdownOpen && (
                    <div
                        className="fixed w-64 bg-slate-800 border border-slate-600 shadow-xl rounded-lg z-[9999] max-h-64 overflow-y-auto menu-transition py-1"
                        style={{ top: dropdownPos.top + 4, left: dropdownPos.left }}
                        onMouseLeave={() => setLayerDropdownOpen(false)}
                    >
                        {dataStore.layers.map((layer: any) => (
                            <div key={layer.id} className={`flex items-center p-2 hover:bg-slate-700/50 cursor-pointer ${layer.id === dataStore.activeLayerId ? 'bg-slate-700' : ''}`} onClick={(e: any) => { e.stopPropagation(); dataStore.setActiveLayerId(layer.id); setLayerDropdownOpen(false); }}>
                                <div className="w-2 h-2 rounded-full mr-3 shadow-sm" style={{backgroundColor: layer.color}}></div>
                                <span className="flex-grow text-xs text-slate-200">{layer.name}</span>
                                <div className="flex gap-1">
                                    <button className="p-1 hover:text-white text-slate-500 transition-colors" onClick={(e: any) => { e.stopPropagation(); dataStore.toggleLayerVisibility(layer.id); }}>{layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                                    <button className="p-1 hover:text-white text-slate-500 transition-colors" onClick={(e: any) => { e.stopPropagation(); dataStore.toggleLayerLock(layer.id); }}>{layer.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
                                </div>
                            </div>
                        ))}
                        <div className="h-px bg-slate-700/50 my-1" />
                        <div className="px-3 py-2 flex items-center gap-2 hover:bg-slate-700/50 cursor-pointer text-blue-400 transition-colors" onClick={(e: any) => { e.stopPropagation(); dataStore.addLayer(); }}>
                            <Plus size={14} /> <span className="text-xs font-medium">Nova Camada</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Row: Actions */}
            <div className="flex items-center justify-between w-full">
                {/* Left: Toggles */}
                <div className="flex items-center gap-1">
                    <button 
                        onClick={() => activeLayer && dataStore.toggleLayerVisibility(activeLayer.id)} 
                        className={`h-7 w-7 ${CENTERED_BUTTON_STYLE} ${!activeLayer?.visible ? 'text-red-400' : ''}`}
                        title="Visibilidade"
                    >
                        {activeLayer?.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <button 
                        onClick={() => activeLayer && dataStore.toggleLayerLock(activeLayer.id)} 
                        className={`h-7 w-7 ${CENTERED_BUTTON_STYLE} ${activeLayer?.locked ? 'text-yellow-400' : ''}`}
                        title="Bloqueio"
                    >
                        {activeLayer?.locked ? <Lock size={15} /> : <Unlock size={15} />}
                    </button>
                </div>

                {/* Right: Manage */}
                <button
                    onClick={() => uiStore.setLayerManagerOpen(true)}
                    className={`h-7 px-2 flex items-center gap-1.5 ${BASE_BUTTON_STYLE} text-[9px] uppercase font-bold tracking-wide`}
                    title="Gerenciador de Camadas"
                >
                    <Settings2 size={14} />
                    <span>Gerir</span>
                </button>
            </div>
        </div>
    ),
    'ColorControl': ({ uiStore, openColorPicker }) => (
        <div className="flex flex-col gap-1.5 px-2 h-full justify-center w-[160px]">
            {/* Top Row: Colors */}
            <div className="grid grid-cols-2 gap-2 w-full">
                {[
                    { 
                        label: 'Traço', 
                        type: 'stroke', 
                        enabled: uiStore.strokeEnabled !== false, 
                        color: uiStore.strokeColor, 
                        setter: uiStore.setStrokeEnabled,
                        open: (e: React.MouseEvent) => openColorPicker(e, 'stroke')
                    },
                    { 
                        label: 'Fundo', 
                        type: 'fill', 
                        enabled: uiStore.fillColor !== 'transparent', 
                        color: uiStore.fillColor, 
                        setter: (checked: boolean) => uiStore.setFillColor(checked ? '#eeeeee' : 'transparent'),
                        open: (e: React.MouseEvent) => openColorPicker(e, 'fill')
                    }
                ].map((idx) => (
                    <div key={idx.type} className="flex flex-col items-center gap-0.5">
                         <span className={LABEL_STYLE} style={{marginBottom: 0}}>{idx.label}</span>
                        <div className={`flex items-center justify-between w-full bg-slate-800/40 rounded border border-slate-700/30 px-1.5 py-1 ${!idx.enabled ? 'opacity-50' : ''}`}>
                            <input
                                type="checkbox"
                                checked={idx.enabled}
                                onChange={(e) => idx.setter(e.target.checked)}
                                className="w-3 h-3 rounded-sm border-slate-600 bg-slate-900/50 accent-blue-500 cursor-pointer"
                            />
                             <div
                                className={`w-5 h-5 rounded border border-slate-400 cursor-pointer shadow-sm hover:scale-105 transition-transform`}
                                style={{
                                    backgroundColor: idx.color === 'transparent' ? 'transparent' : idx.color,
                                    backgroundImage: idx.color === 'transparent' || (idx.type === 'fill' && idx.color === 'transparent') ? 
                                        'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)' 
                                        : 'none',
                                    backgroundSize: '4px 4px'
                                }}
                                onClick={(e) => idx.enabled && idx.open(e)}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Row: Slider */}
             <div className="flex flex-col w-full gap-0.5 mt-0.5">
                <div className="flex justify-between items-center px-0.5">
                     <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Espessura</span>
                     <NumberSpinner 
                        value={uiStore.strokeWidth} 
                        onChange={uiStore.setStrokeWidth} 
                        min={0} 
                        max={50} 
                     />
                </div>
                <div className="w-full bg-slate-800/40 rounded-full h-4 flex items-center px-1 border border-slate-700/30">
                    <input
                        type="range"
                        min="0"
                        max="50"
                        step="1"
                        value={uiStore.strokeWidth}
                        onChange={(e) => uiStore.setStrokeWidth(parseInt(e.target.value))}
                        className="w-full h-0.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 hover:[&::-webkit-slider-thumb]:bg-blue-400 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none"
                    />
                </div>
            </div>
        </div>
    ),
    'LineWidthControl': () => null
};

const RibbonSectionComponent: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col h-full border-r border-slate-700/40 relative group">
    <div className="flex-1 flex items-center justify-center px-3 gap-1">
      {children}
    </div>
    <div className="h-6 flex items-center justify-center bg-slate-800/50 text-[10px] text-slate-500 font-bold uppercase tracking-widest cursor-default select-none">
      {title}
    </div>
  </div>
);

const EditorRibbon: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState('draw');
  const uiStore = useUIStore();
  const dataStore = useDataStore();
  
  // Layer Dropdown State
  const [isLayerDropdownOpen, setLayerDropdownOpen] = useState(false);
  const layerButtonRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const closeTimeoutRef = useRef<number | null>(null);

  const handleAction = (action?: string) => {
      const selectedIds = Array.from(uiStore.selectedShapeIds);
      if (action === 'delete') dataStore.deleteSelected(selectedIds);
      if (action === 'join') dataStore.joinSelected(selectedIds);
      if (action === 'explore') { /* TODO: Implement explode */ }
      if (action === 'zoom-fit') dataStore.zoomToFit();
      if (action === 'undo') dataStore.undo();
      if (action === 'redo') dataStore.redo();
      if (action === 'open-settings') uiStore.setSettingsModalOpen(true);
  };

  const activeTab = MENU_CONFIG.find(t => t.id === activeTabId) || MENU_CONFIG[0];
  const activeLayer = dataStore.layers.find(l => l.id === dataStore.activeLayerId);
  const selectedTextIds = useMemo(
    () => Array.from(uiStore.selectedShapeIds).filter(id => dataStore.shapes[id]?.type === 'text'),
    [uiStore.selectedShapeIds, dataStore.shapes]
  );

  const applyTextUpdate = (diff: Partial<any>, recalcSize: boolean) => {
    selectedTextIds.forEach(id => {
      const shape = dataStore.shapes[id];
      if (!shape) return;
      const nextFontSize = (diff.fontSize ?? shape.fontSize ?? uiStore.textFontSize) || 16;
      const content = diff.textContent ?? shape.textContent ?? '';
      let updates: any = { ...diff };

      if (recalcSize) {
        const baseWidth = shape.width && shape.width > 0 ? shape.width : undefined;
        const availableWidth = baseWidth ? Math.max(baseWidth - TEXT_PADDING * 2, 1) : undefined;
        const lines = availableWidth ? getWrappedLines(content, availableWidth, nextFontSize) : content.split('\n');
        const contentWidth = availableWidth ?? Math.max(nextFontSize * 0.6, ...lines.map(line => (line.length || 1) * nextFontSize * 0.6));
        const width = baseWidth ?? contentWidth + TEXT_PADDING * 2;
        const height = Math.max(shape.height ?? 0, lines.length * nextFontSize * 1.2 + TEXT_PADDING * 2);
        updates.width = width;
        updates.height = height;
      }

      dataStore.updateShape(id, updates, true);
    });
  };

  const openLayerDropdown = () => {
    if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
    }
    if (layerButtonRef.current) {
        const rect = layerButtonRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom, left: rect.left });
        setLayerDropdownOpen(true);
    }
  };

  const closeLayerDropdown = () => {
    closeTimeoutRef.current = window.setTimeout(() => {
        setLayerDropdownOpen(false);
    }, 200);
  };
  
  useEffect(() => {
    return () => {
        if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const [colorPickerTarget, setColorPickerTarget] = useState<'stroke' | 'fill' | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });

  const openColorPicker = (e: React.MouseEvent, target: 'stroke' | 'fill') => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setColorPickerPos({ top: rect.bottom + 8, left: rect.left - 10 });
      setColorPickerTarget(target);
  };

  const activeColor = colorPickerTarget === 'stroke' ? uiStore.strokeColor : uiStore.fillColor;

  const handleColorChange = (newColor: string) => {
      if (colorPickerTarget === 'stroke') {
        uiStore.setStrokeColor(newColor);
        selectedTextIds.forEach(id => dataStore.updateShape(id, { strokeColor: newColor }, true));
      }
      if (colorPickerTarget === 'fill') {
        uiStore.setFillColor(newColor);
        selectedTextIds.forEach(id => dataStore.updateShape(id, { fillColor: newColor }, true));
      }
  };

  const componentProps = {
      activeLayer,
      isLayerDropdownOpen,
      setLayerDropdownOpen,
      openLayerDropdown,
      closeLayerDropdown,
      layerButtonRef,
      dropdownPos,
      dataStore,
      uiStore,
      openColorPicker,
      selectedTextIds,
      applyTextUpdate
  };

  return (
    <div className="w-full bg-slate-900 text-slate-100 flex flex-col border-b border-slate-700 shadow-xl select-none relative z-50">
      {/* Tabs */}
      <div className="flex px-4 gap-1 bg-slate-950 border-b border-slate-800">
         <div className="font-bold text-yellow-500 flex items-center px-2 mr-4 text-sm tracking-widest">
            ENDEAVOUR
         </div>
         {MENU_CONFIG.map(tab => (
           <button 
             key={tab.id}
             onClick={() => setActiveTabId(tab.id)}
             className={`px-5 py-2 text-xs font-semibold tracking-wide transition-all duration-200 relative border-b-2 ${activeTabId === tab.id ? 'text-blue-400 border-blue-500 bg-slate-800/50' : 'text-slate-400 border-transparent hover:text-slate-200 hover:bg-slate-800/30'}`}
           >
             {tab.label}
           </button>
         ))}
      </div>

      {/* Content */}
      <div className="h-32 bg-slate-800/95 backdrop-blur-sm overflow-hidden flex items-center md:justify-start overflow-x-auto custom-scrollbar">
        {activeTab.sections.map((section, idx) => (
            <RibbonSectionComponent key={idx} title={section.title}>
                {section.layout === 'grid' ? (
                    <div className="grid grid-rows-2 grid-flow-col gap-1 auto-cols-max py-1 h-full">
                        {section.items.map(item => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    if(item.type === 'tool' && item.tool) uiStore.setTool(item.tool);
                                    if(item.type === 'action' && item.action) handleAction(item.action);
                                }}
                                className={`flex flex-col items-center justify-center px-1 py-1 gap-0.5 rounded w-full min-w-[48px] transition-all duration-150
                                    ${item.type === 'tool' && uiStore.activeTool === item.tool ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE}
                                `}
                                title={`${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}`}
                            >
                                <div className="text-slate-400">
                                    {getIcon(item.icon)}
                                </div>
                                <span className={`text-[9px] text-center whitespace-nowrap leading-none ${item.type === 'tool' && uiStore.activeTool === item.tool ? 'text-blue-300' : ''}`}>{item.label}</span>
                            </button>
                        ))}
                         {section.items.some(i => i.tool === 'polygon') && uiStore.activeTool === 'polygon' && (
                                <div className="absolute top-2 right-2 bg-slate-900 border border-slate-600 p-1 rounded shadow-lg flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                                    <span className="text-[9px] text-slate-400 uppercase font-bold">Lados</span>
                                    <input type="number" min="3" max="12" value={uiStore.polygonSides} onChange={e => uiStore.setPolygonSides(parseInt(e.target.value))} className="w-8 h-6 text-xs bg-slate-800 border border-slate-600 rounded text-center focus:border-blue-500 outline-none" />
                                </div>
                            )}
                    </div>
                ) : (
                    <div className="flex gap-2 h-full items-center px-1">
                        {section.items.map(item => {
                            if (item.type === 'component' && item.componentName) {
                                const Component = ComponentRegistry[item.componentName];
                                if (Component) return <React.Fragment key={item.id}><Component {...componentProps} /></React.Fragment>;
                                return null;
                            }
                            // Large buttons for non-grid layout (File, etc)
                             return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        if(item.type === 'tool' && item.tool) uiStore.setTool(item.tool);
                                        if(item.type === 'action' && item.action) handleAction(item.action);
                                    }}
                                    className={`flex flex-col items-center justify-center p-3 gap-2 rounded min-w-[64px] h-full transition-all duration-150 group/btn text-center
                                        ${item.type === 'tool' && uiStore.activeTool === item.tool ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE}
                                    `}
                                    title={`${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}`}
                                >
                                    <div className="transform transition-transform group-hover/btn:scale-110 duration-200">
                                         {getIcon(item.icon)}
                                    </div>
                                    <span className="text-[10px] font-medium text-center leading-tight">{item.label}</span>
                                </button>
                                )
                        })}
                    </div>
                )}
            </RibbonSectionComponent>
        ))}
      </div>

      {colorPickerTarget && (
        <>
            <div className="fixed inset-0 z-[60]" onClick={() => setColorPickerTarget(null)} />
            <ColorPicker 
                color={activeColor === 'transparent' ? '#FFFFFF' : activeColor}
                onChange={handleColorChange}
                onClose={() => setColorPickerTarget(null)}
                initialPosition={colorPickerPos}
            />
        </>
      )}
    </div>
  );
};

export default EditorRibbon;
