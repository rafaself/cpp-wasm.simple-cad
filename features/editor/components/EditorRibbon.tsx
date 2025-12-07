import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { MENU_CONFIG } from '../../../config/menu';
import { getIcon } from '../../../utils/iconMap.tsx';
import { Eye, EyeOff, Lock, Unlock, Plus, Layers, Bold, Italic, Underline, Strikethrough, Settings2 } from 'lucide-react';

const RibbonSectionComponent: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col h-full border-r border-slate-700">
    <div className="flex-grow flex items-center justify-center px-3 gap-2">
      {children}
    </div>
    <div className="h-[20px] min-w-[80px] flex items-center justify-center bg-slate-900/30 text-[10px] text-slate-400 font-medium uppercase tracking-wider select-none border-t border-slate-700/50">
      {title}
    </div>
  </div>
);

const EditorRibbon: React.FC = () => {
  const [activeTabId, setActiveTabId] = useState('draw'); // Default to Draw (formerly Home)
  const store = useAppStore();
  
  // Layer Dropdown State
  const [isLayerDropdownOpen, setLayerDropdownOpen] = useState(false);
  const layerButtonRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const closeTimeoutRef = useRef<number | null>(null);

  const handleAction = (action?: string) => {
      if (action === 'delete') store.deleteSelected();
      if (action === 'join') store.joinSelected();
      if (action === 'explode') store.explodeSelected();
      if (action === 'zoom-fit') store.zoomToFit();
      if (action === 'undo') store.undo();
      if (action === 'redo') store.redo();
      if (action === 'open-settings') store.setSettingsModalOpen(true);
  };

  const activeTab = MENU_CONFIG.find(t => t.id === activeTabId) || MENU_CONFIG[0];
  const activeLayer = store.layers.find(l => l.id === store.activeLayerId);

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
  
  // Cleanup timeout
  useEffect(() => {
    return () => {
        if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const renderLayerControl = () => (
    <div className="flex items-center gap-1 h-full py-1">
        <div className="flex flex-col justify-center gap-1 w-32">
            <div className="flex items-center gap-1">
            <div 
                ref={layerButtonRef}
                className="bg-slate-700 px-2 py-1 rounded flex-grow flex items-center border border-slate-600 cursor-pointer relative hover:bg-slate-600 transition-colors"
                onMouseEnter={openLayerDropdown}
                onMouseLeave={closeLayerDropdown}
                onClick={() => setLayerDropdownOpen(!isLayerDropdownOpen)}
            >
                <Layers size={16} className="mr-2 text-yellow-500" />
                <span className="text-sm font-medium truncate select-none" style={{color: activeLayer?.color}}>{activeLayer?.name}</span>
                
                {isLayerDropdownOpen && (
                    <div 
                        className="fixed w-64 bg-slate-800 border border-slate-600 shadow-xl rounded z-[100] mt-1 max-h-64 overflow-y-auto"
                        style={{ top: dropdownPos.top, left: dropdownPos.left }}
                        onMouseEnter={openLayerDropdown}
                        onMouseLeave={closeLayerDropdown}
                    >
                        {store.layers.map(layer => (
                            <div key={layer.id} className={`flex items-center p-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 ${layer.id === store.activeLayerId ? 'bg-slate-700' : ''}`} onClick={(e) => { e.stopPropagation(); store.setActiveLayerId(layer.id); setLayerDropdownOpen(false); }}>
                                <div className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: layer.color}}></div>
                                <span className="flex-grow text-xs">{layer.name}</span>
                                <button className="p-1 hover:text-white text-slate-400" onClick={(e) => { e.stopPropagation(); store.toggleLayerVisibility(layer.id); }}>{layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                                <button className="p-1 hover:text-white text-slate-400" onClick={(e) => { e.stopPropagation(); store.toggleLayerLock(layer.id); }}>{layer.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                            </div>
                        ))}
                        <div className="p-2 flex items-center gap-2 hover:bg-slate-700 cursor-pointer text-blue-400" onClick={(e) => { e.stopPropagation(); store.addLayer(); }}>
                            <Plus size={14} /> <span className="text-xs">Criar Nova Camada</span>
                        </div>
                    </div>
                )}
            </div>
            </div>
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <button onClick={() => activeLayer && store.toggleLayerVisibility(activeLayer.id)} className="text-slate-400 hover:text-white" title="Alternar Visibilidade">{activeLayer?.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                    <button onClick={() => activeLayer && store.toggleLayerLock(activeLayer.id)} className="text-slate-400 hover:text-white" title="Alternar Bloqueio">{activeLayer?.locked ? <Lock size={14} /> : <Unlock size={14} />}</button>
                </div>
            </div>
        </div>
        
        {/* Layer Manager Button */}
        <button 
            onClick={() => store.setLayerManagerOpen(true)}
            className="h-full px-1.5 flex flex-col items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors border-l border-slate-700/50 ml-1"
            title="Gerenciador de Camadas"
        >
            <Settings2 size={22} className="mb-0.5" />
        </button>
    </div>
  );

  const renderColorControl = () => (
      <div className="flex flex-col gap-1 w-24">
        <div className="flex items-center justify-between bg-slate-700 px-2 py-0.5 rounded border border-slate-600">
            <span className="text-[10px] text-slate-300">Cor</span>
            <div className="relative w-4 h-4 rounded-full border border-slate-500 overflow-hidden">
                <input type="color" value={store.strokeColor} onChange={(e) => store.setStrokeColor(e.target.value)} className="absolute -top-1 -left-1 w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" />
            </div>
        </div>
        <div className="flex items-center justify-between bg-slate-700 px-2 py-0.5 rounded border border-slate-600">
            <span className="text-[10px] text-slate-300">Fundo</span>
            <div className="flex items-center gap-1">
                <input type="checkbox" checked={store.fillColor !== 'transparent'} onChange={(e) => store.setFillColor(e.target.checked ? '#eeeeee' : 'transparent')} className="w-3 h-3" />
                <div className={`relative w-4 h-4 rounded-full border border-slate-500 overflow-hidden ${store.fillColor === 'transparent' ? 'opacity-30' : ''}`}>
                    <input type="color" disabled={store.fillColor === 'transparent'} value={store.fillColor === 'transparent' ? '#ffffff' : store.fillColor} onChange={(e) => store.setFillColor(e.target.value)} className="absolute -top-1 -left-1 w-6 h-6 p-0 border-0 bg-transparent cursor-pointer" />
                </div>
            </div>
        </div>
      </div>
  );

  const renderLineWidthControl = () => (
      <div className="flex flex-col gap-1 w-24">
         <div className="flex items-center justify-between bg-slate-700 px-2 py-0.5 rounded border border-slate-600">
            <span className="text-[10px] text-slate-300">Largura: {store.strokeWidth}px</span>
         </div>
         <div className="px-1 pt-1">
            <input 
                type="range" 
                min="1" 
                max="20" 
                step="1" 
                value={store.strokeWidth} 
                onChange={(e) => store.setStrokeWidth(parseInt(e.target.value))}
                className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
         </div>
      </div>
  );

  const renderTextFormatControl = () => (
    <div className="flex flex-col gap-1.5 w-44">
       {/* Row 1: Font and Size */}
       <div className="flex items-center gap-1">
           <select 
             value={store.fontFamily} 
             onChange={(e) => store.setFontFamily(e.target.value)}
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
              value={store.textSize} 
              onChange={(e) => store.setTextSize(parseInt(e.target.value))}
              className="w-12 h-6 bg-slate-700 text-xs border border-slate-600 rounded px-1 outline-none focus:border-blue-500 text-center"
           />
       </div>

       {/* Row 2: Styling Buttons */}
       <div className="flex items-center gap-1 justify-between bg-slate-700/50 p-0.5 rounded border border-slate-600/50">
           <button 
             onClick={store.toggleFontBold} 
             className={`p-1 rounded hover:bg-slate-600 ${store.fontBold ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
             title="Negrito"
           >
               <Bold size={14} />
           </button>
           <button 
             onClick={store.toggleFontItalic} 
             className={`p-1 rounded hover:bg-slate-600 ${store.fontItalic ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
             title="Itálico"
           >
               <Italic size={14} />
           </button>
           <div className="w-px h-4 bg-slate-600" />
           <button 
             onClick={store.toggleFontUnderline} 
             className={`p-1 rounded hover:bg-slate-600 ${store.fontUnderline ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
             title="Sublinhado"
           >
               <Underline size={14} />
           </button>
           <button 
             onClick={store.toggleFontStrike} 
             className={`p-1 rounded hover:bg-slate-600 ${store.fontStrike ? 'bg-blue-600 text-white' : 'text-slate-300'}`}
             title="Tachado"
           >
               <Strikethrough size={14} />
           </button>
       </div>
    </div>
  );

  return (
    <div className="w-full bg-slate-800 text-slate-100 flex flex-col border-b border-slate-600 shadow-md select-none z-50">
      {/* Tabs */}
      <div className="flex px-2 bg-slate-900">
         {MENU_CONFIG.map(tab => (
           <button 
             key={tab.id}
             onClick={() => setActiveTabId(tab.id)}
             className={`px-4 py-1 text-xs font-medium tracking-wide ${activeTabId === tab.id ? 'bg-slate-800 text-white border-t-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'}`}
           >
             {tab.label}
           </button>
         ))}
      </div>

      {/* Content */}
      <div className="h-28 flex px-1 pb-0 overflow-x-auto bg-slate-800">
         {activeTab.sections.map((section, idx) => (
             <RibbonSectionComponent key={idx} title={section.title}>
                {section.layout === 'grid' ? (
                    <div className={`grid grid-cols-${section.columns || 2} gap-1`}>
                        {section.items.map(item => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    if(item.type === 'tool' && item.tool) store.setTool(item.tool);
                                    if(item.type === 'action' && item.action) handleAction(item.action);
                                }}
                                className={`flex flex-col items-center justify-center p-2 rounded hover:bg-slate-700 transition-colors 
                                    ${item.type === 'tool' && store.activeTool === item.tool ? 'bg-blue-600 text-white shadow-inner' : 'text-slate-200'}
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
                        {section.items.some(i => i.tool === 'polygon') && store.activeTool === 'polygon' && (
                            <div className="absolute top-full bg-slate-700 p-1 rounded z-50 mt-1 shadow-lg border border-slate-600">
                                <span className="text-[10px] text-slate-300 mr-1">Lados:</span>
                                <input type="number" value={store.polygonSides} onChange={e => store.setPolygonSides(parseInt(e.target.value))} className="w-10 text-xs bg-slate-900 border border-slate-600 text-center" />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex gap-2 h-full items-center">
                            {section.items.map(item => {
                                if (item.type === 'component') {
                                    if (item.componentName === 'LayerControl') return <React.Fragment key={item.id}>{renderLayerControl()}</React.Fragment>;
                                    if (item.componentName === 'ColorControl') return <React.Fragment key={item.id}>{renderColorControl()}</React.Fragment>;
                                    if (item.componentName === 'LineWidthControl') return <React.Fragment key={item.id}>{renderLineWidthControl()}</React.Fragment>;
                                    if (item.componentName === 'TextFormatControl') return <React.Fragment key={item.id}>{renderTextFormatControl()}</React.Fragment>;
                                    return null;
                                }
                                return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        if(item.type === 'tool' && item.tool) store.setTool(item.tool);
                                        if(item.type === 'action' && item.action) handleAction(item.action);
                                    }}
                                    className={`flex flex-col items-center justify-center p-2 rounded hover:bg-slate-700 transition-colors 
                                        ${item.type === 'tool' && store.activeTool === item.tool ? 'bg-blue-600 text-white shadow-inner' : 'text-slate-200'}
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
  );
};

export default EditorRibbon;