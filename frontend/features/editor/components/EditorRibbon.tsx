import React, { useState, useRef, useEffect } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { MENU_CONFIG } from '../../../config/menu';
import { getIcon } from '../../../utils/iconMap.tsx';
import { Eye, EyeOff, Lock, Unlock, Plus, Layers, Bold, Italic, Underline, Strikethrough, Settings2 } from 'lucide-react';
import ColorPicker from '../../../components/ColorPicker';

// Component Registry for Config-Driven UI
const ComponentRegistry: Record<string, React.FC<any>> = {
    'LayerControl': ({ activeLayer, isLayerDropdownOpen, setLayerDropdownOpen, openLayerDropdown, closeLayerDropdown, layerButtonRef, dropdownPos, dataStore, uiStore }) => (
        <div className="flex items-center gap-1 h-full py-1">
            <div className="flex flex-col justify-center gap-1 w-32">
                <div className="flex items-center gap-1">
                <div
                    ref={layerButtonRef}
                    className="bg-slate-700 px-2 py-1 rounded flex-grow flex items-center border border-slate-600 cursor-pointer relative hover:bg-slate-600 transition-colors"
                    onMouseEnter={openLayerDropdown}
                    onMouseLeave={closeLayerDropdown}
                    onClick={(e) => { e.stopPropagation(); setLayerDropdownOpen(!isLayerDropdownOpen); }}
                >
                    <Layers size={16} className="mr-2 text-yellow-500" />
                    <span className="text-sm font-medium truncate cursor-default" style={{color: activeLayer?.color}}>{activeLayer?.name || 'Camada'}</span>
                </div>
                </div>
                <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                        <button onClick={() => activeLayer && dataStore.toggleLayerVisibility(activeLayer.id)} className="text-slate-400 hover:text-white" title="Alternar Visibilidade">{activeLayer?.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                        <button onClick={() => activeLayer && dataStore.toggleLayerLock(activeLayer.id)} className="text-slate-400 hover:text-white" title="Alternar Bloqueio">{activeLayer?.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                    </div>
                </div>
            </div>

            <button
                onClick={() => uiStore.setLayerManagerOpen(true)}
                className="h-full px-1 flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors border-l border-slate-700/50"
                title="Gerenciador de Camadas"
            >
                <Settings2 size={20} className="mb-0.5" />
            </button>

            {isLayerDropdownOpen && (
                <div
                    className="fixed w-64 bg-slate-800 border border-slate-600 shadow-xl rounded z-[9999] max-h-64 overflow-y-auto menu-transition"
                    style={{ top: dropdownPos.top + 4, left: dropdownPos.left }}
                    onMouseEnter={openLayerDropdown}
                    onMouseLeave={closeLayerDropdown}
                >
                    {dataStore.layers.map((layer: any) => (
                        <div key={layer.id} className={`flex items-center p-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 ${layer.id === dataStore.activeLayerId ? 'bg-slate-700' : ''}`} onClick={(e: any) => { e.stopPropagation(); dataStore.setActiveLayerId(layer.id); setLayerDropdownOpen(false); }}>
                            <div className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: layer.color}}></div>
                            <span className="flex-grow text-xs cursor-default">{layer.name}</span>
                            <button className="p-1 hover:text-white text-slate-400" onClick={(e: any) => { e.stopPropagation(); dataStore.toggleLayerVisibility(layer.id); }}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                            <button className="p-1 hover:text-white text-slate-400" onClick={(e: any) => { e.stopPropagation(); dataStore.toggleLayerLock(layer.id); }}>{layer.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                        </div>
                    ))}
                    <div className="p-2 flex items-center gap-2 hover:bg-slate-700 cursor-pointer text-blue-400" onClick={(e: any) => { e.stopPropagation(); dataStore.addLayer(); }}>
                        <Plus size={14} /> <span className="text-xs cursor-default">Criar Nova Camada</span>
                    </div>
                </div>
            )}
        </div>
    ),
    'ColorControl': ({ uiStore, openColorPicker }) => (
        <div className="flex flex-col gap-1 w-24">
            <div className="flex items-center justify-between bg-slate-700 px-2 py-0.5 rounded border border-slate-600">
                <div className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        checked={uiStore.strokeEnabled !== false}
                        onChange={(e) => uiStore.setStrokeEnabled(e.target.checked)}
                        className="w-3 h-3 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-300">Cor</span>
                </div>
                <div
                    className={`w-4 h-4 rounded-full border border-slate-500 cursor-pointer hover:scale-110 transition-transform ${uiStore.strokeEnabled === false ? 'opacity-50' : ''}`}
                    style={{ backgroundColor: uiStore.strokeColor }}
                    onClick={(e) => uiStore.strokeEnabled !== false && openColorPicker(e, 'stroke')}
                />
            </div>

            <div className="flex items-center justify-between bg-slate-700 px-2 py-0.5 rounded border border-slate-600">
                <div className="flex items-center gap-1">
                    <input
                        type="checkbox"
                        checked={uiStore.fillColor !== 'transparent'}
                        onChange={(e) => uiStore.setFillColor(e.target.checked ? '#eeeeee' : 'transparent')}
                        className="w-3 h-3 cursor-pointer"
                    />
                    <span className="text-[10px] text-slate-300">Fundo</span>
                </div>
                <div
                    className={`relative w-4 h-4 rounded-full border border-slate-500 cursor-pointer hover:scale-110 transition-transform ${uiStore.fillColor === 'transparent' ? 'opacity-50' : ''}`}
                    style={{
                        backgroundColor: uiStore.fillColor === 'transparent' ? 'transparent' : uiStore.fillColor,
                        backgroundImage: uiStore.fillColor === 'transparent' ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)' : 'none',
                        backgroundSize: '4px 4px'
                    }}
                    onClick={(e) => uiStore.fillColor !== 'transparent' && openColorPicker(e, 'fill')}
                />
            </div>
        </div>
    ),
    'LineWidthControl': ({ uiStore }) => (
        <div className="flex flex-col gap-1 w-24">
            <div className="flex items-center justify-between bg-slate-700 px-2 py-0.5 rounded border border-slate-600">
                <span className="text-[10px] text-slate-300">Largura: {uiStore.strokeWidth}px</span>
            </div>
            <div className="px-1 pt-1 flex items-center h-full">
                <input
                    type="range"
                    min="1"
                    max="20"
                    step="1"
                    value={uiStore.strokeWidth}
                    onChange={(e) => uiStore.setStrokeWidth(parseInt(e.target.value))}
                    className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500 my-auto block"
                />
            </div>
        </div>
    ),
    'TextFormatControl': ({ uiStore }) => (
        <div className="flex flex-col gap-1.5 w-44">
           <div className="flex items-center gap-1">
               <select
                 value={uiStore.fontFamily}
                 onChange={(e) => uiStore.setFontFamily(e.target.value)}
                 className="h-6 flex-grow bg-slate-700 text-xs border border-slate-600 rounded px-1 outline-none focus:border-blue-500"
               >
                   <option value="sans-serif">Sans Serif</option>
                   <option value="serif">Serif</option>
                   <option value="monospace">Monospace</option>
                   <option value="Arial">Arial</option>
                   <option value="Times New Roman">Times New Roman</option>
                   <option value="Courier New">Courier New</option>
               </select>
               <input
                  type="number"
                  min="1"
                  max="200"
                  value={uiStore.textSize}
                  onChange={(e) => uiStore.setTextSize(parseInt(e.target.value))}
                  className="w-12 h-6 bg-slate-800 text-slate-200 text-xs border border-slate-600 rounded px-1 outline-none focus:border-blue-500 text-center font-semibold"
               />
           </div>

           <div className="flex items-center gap-1 justify-between bg-slate-700/50 p-0.5 rounded border border-slate-600/50">
               <button
                 onClick={uiStore.toggleFontBold}
                 className={`p-1 rounded hover:bg-slate-600 ${uiStore.fontBold ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                 title="Negrito"
               >
                   <Bold size={14} />
               </button>
               <button
                 onClick={uiStore.toggleFontItalic}
                 className={`p-1 rounded hover:bg-slate-600 ${uiStore.fontItalic ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                 title="Itálico"
               >
                   <Italic size={14} />
               </button>
               <div className="w-px h-4 bg-slate-600" />
               <button
                 onClick={uiStore.toggleFontUnderline}
                 className={`p-1 rounded hover:bg-slate-600 ${uiStore.fontUnderline ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                 title="Sublinhado"
               >
                   <Underline size={14} />
               </button>
               <button
                 onClick={uiStore.toggleFontStrike}
                 className={`p-1 rounded hover:bg-slate-600 ${uiStore.fontStrike ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
                 title="Tachado"
               >
                   <Strikethrough size={14} />
               </button>
           </div>
        </div>
    )
};

const RibbonSectionComponent: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col h-full border-r border-slate-700">
    <div className="flex-grow flex items-center justify-center px-3 gap-2">
      {children}
    </div>
    <div className="h-[20px] min-w-[80px] flex items-center justify-center bg-slate-900/30 text-[10px] text-slate-400 font-medium uppercase tracking-wider cursor-default border-t border-slate-700/50">
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
      if (action === 'explode') { /* TODO: Implement explode */ }
      if (action === 'zoom-fit') dataStore.zoomToFit();
      if (action === 'undo') dataStore.undo();
      if (action === 'redo') dataStore.redo();
      if (action === 'open-settings') uiStore.setSettingsModalOpen(true);
  };

  const activeTab = MENU_CONFIG.find(t => t.id === activeTabId) || MENU_CONFIG[0];
  const activeLayer = dataStore.layers.find(l => l.id === dataStore.activeLayerId);

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
      setColorPickerPos({ top: rect.bottom + 5, left: rect.left });
      setColorPickerTarget(target);
  };

  const activeColor = colorPickerTarget === 'stroke' ? uiStore.strokeColor : uiStore.fillColor;

  const handleColorChange = (newColor: string) => {
      if (colorPickerTarget === 'stroke') uiStore.setStrokeColor(newColor);
      if (colorPickerTarget === 'fill') uiStore.setFillColor(newColor);
  };

  // Props to pass to generic components
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
      openColorPicker
  };

  return (
    <div className="w-full bg-slate-800 text-slate-100 flex flex-col border-b border-slate-600 shadow-md select-none z-50">
      {/* Tabs */}
      <div className="flex px-2 bg-slate-900">
         {MENU_CONFIG.map(tab => (
           <button 
             key={tab.id}
             onClick={() => setActiveTabId(tab.id)}
             className={`px-4 py-1 text-xs font-medium tracking-wide transition-colors duration-200 relative ${activeTabId === tab.id ? 'bg-slate-800 text-white ribbon-tab-active' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
           >
             {tab.label}
           </button>
         ))}
      </div>

      {/* Content */}
      <div className="h-28 bg-slate-800 overflow-hidden relative">
        <div key={activeTab.id} className="h-full flex px-1 pb-0 overflow-x-auto menu-transition items-center">
            {activeTab.sections.map((section, idx) => (
                <RibbonSectionComponent key={idx} title={section.title}>
                    {section.layout === 'grid' ? (
                        <div className="grid grid-rows-2 grid-flow-col gap-1 auto-cols-max">
                            {section.items.map(item => (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        if(item.type === 'tool' && item.tool) uiStore.setTool(item.tool);
                                        if(item.type === 'action' && item.action) handleAction(item.action);
                                    }}
                                    className={`flex flex-col items-center justify-center p-2 rounded hover:bg-slate-700 transition-all duration-200 
                                        ${item.type === 'tool' && uiStore.activeTool === item.tool ? 'bg-blue-600 text-white shadow-inner scale-95' : 'text-slate-200 hover:scale-105 active:scale-95'}
                                        ${activeTabId === 'file' ? 'h-full w-16' : ''}
                                    `}
                                    title={`${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}`}
                                >
                                    {getIcon(item.icon)}
                                    {activeTabId === 'file' && (
                                        <span className="text-[10px] mt-1 text-center leading-tight">{item.label}</span>
                                    )}
                                </button>
                            ))}
                            {section.items.some(i => i.tool === 'polygon') && uiStore.activeTool === 'polygon' && (
                                <div className="absolute top-full bg-slate-700 p-1 rounded z-50 mt-1 shadow-lg border border-slate-600 menu-transition">
                                    <span className="text-[10px] text-slate-300 mr-1">Lados:</span>
                                    <input type="number" value={uiStore.polygonSides} onChange={e => uiStore.setPolygonSides(parseInt(e.target.value))} className="w-10 text-xs bg-slate-900 border border-slate-600 text-center" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex gap-2 h-full items-center">
                                {section.items.map(item => {
                                    if (item.type === 'component' && item.componentName) {
                                        const Component = ComponentRegistry[item.componentName];
                                        if (Component) return <React.Fragment key={item.id}><Component {...componentProps} /></React.Fragment>;
                                        return null;
                                    }
                                    return (
                                    <button
                                        key={item.id}
                                        onClick={() => {
                                            if(item.type === 'tool' && item.tool) uiStore.setTool(item.tool);
                                            if(item.type === 'action' && item.action) handleAction(item.action);
                                        }}
                                        className={`flex flex-col items-center justify-center p-2 rounded hover:bg-slate-700 transition-all duration-200 
                                            ${item.type === 'tool' && uiStore.activeTool === item.tool ? 'bg-blue-600 text-white shadow-inner scale-95' : 'text-slate-200 hover:scale-105 active:scale-95'}
                                            ${activeTabId === 'file' ? 'h-full w-16' : ''}
                                        `}
                                        title={`${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}`}
                                    >
                                        {getIcon(item.icon)}
                                        {activeTabId === 'file' && (
                                            <span className="text-[10px] mt-1 text-center leading-tight">{item.label}</span>
                                        )}
                                    </button>
                                    )
                                })}
                        </div>
                    )}
                </RibbonSectionComponent>
            ))}
        </div>
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
