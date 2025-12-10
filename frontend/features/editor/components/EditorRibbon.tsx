import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../../stores/useUIStore';
import { useDataStore } from '../../../stores/useDataStore';
import { MENU_CONFIG } from '../../../config/menu';
import { getIcon } from '../../../utils/iconMap.tsx';
import { ensureContrastColor } from '../../../utils/color';
import { Eye, EyeOff, Lock, Unlock, Plus, Layers, Settings2, AlignLeft, AlignCenterHorizontal, AlignRight, Bold, Italic, Underline, Strikethrough, Type, ChevronDown, ChevronUp, Palette } from 'lucide-react';
import ColorPicker from '../../../components/ColorPicker';
import { getWrappedLines, TEXT_PADDING } from '../../../utils/geometry';
import NumberSpinner from '../../../components/NumberSpinner';
import EditableNumber from '../../../components/EditableNumber';
import CustomSelect from '../../../components/CustomSelect';
import { buildColorModeUpdate, getEffectiveFillColor, getEffectiveStrokeColor } from '../../../utils/shapeColors';

type ColorPickerTarget =
  | { type: 'stroke' }
  | { type: 'fill' };

const RIBBON_SURFACE_COLOR = '#0f172a';

// Shared styles
const LABEL_STYLE = "text-[9px] text-slate-400 uppercase tracking-wider font-semibold mb-1 block text-center";
const INPUT_STYLE = "w-full h-7 bg-slate-900 border border-slate-700/50 rounded flex items-center px-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all";
const BASE_BUTTON_STYLE = "rounded hover:bg-slate-700 active:bg-slate-600 transition-colors text-slate-400 hover:text-slate-100 border border-transparent";
const CENTERED_BUTTON_STYLE = `flex items-center justify-center ${BASE_BUTTON_STYLE}`;
const ACTIVE_BUTTON_STYLE = "bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border border-blue-500/30";



// Text Controls
const FONT_OPTIONS = [
    { value: "Inter", label: "Inter" },
    { value: "Arial", label: "Arial" },
    { value: "Times New Roman", label: "Times New Roman" },
    { value: "Courier New", label: "Courier New" },
    { value: "Verdana", label: "Verdana" },
];

const FontFamilyControl: React.FC<any> = ({ uiStore, selectedTextIds, applyTextUpdate }) => (
    <div className="flex flex-col justify-center w-full">
        <CustomSelect
            value={uiStore.textFontFamily}
            onChange={(val) => {
                uiStore.setTextFontFamily(val);
                if (selectedTextIds.length > 0) applyTextUpdate({ fontFamily: val }, true);
            }}
            options={FONT_OPTIONS}
            className={INPUT_STYLE}
        />
    </div>
);

const FontSizeControl: React.FC<any> = ({ uiStore, selectedTextIds, applyTextUpdate }) => (
    <div className="flex flex-col justify-center w-full items-center">
        <NumberSpinner
            value={uiStore.textFontSize}
            onChange={(val) => {
                uiStore.setTextFontSize(val);
                if (selectedTextIds.length > 0) applyTextUpdate({ fontSize: val }, true);
            }}
            min={8}
            max={256}
            className="w-full h-6"
        />
    </div>
);

const TextAlignControl: React.FC<any> = ({ uiStore, selectedTextIds, applyTextUpdate }) => (
    <div className="flex flex-col justify-center w-full items-center">
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
    <div className="flex flex-col justify-center w-full items-center">
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
    <div className="flex h-full py-1 gap-1.5 px-0.5">
        <div className="flex flex-col justify-center gap-1 w-[140px]">
            <FontFamilyControl {...props} />
            <TextStyleControl {...props} />
        </div>
        <div className="flex flex-col justify-center gap-1 w-[106px]">
            <FontSizeControl {...props} />
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
    'LayerControl': ({ activeLayer, isLayerDropdownOpen, setLayerDropdownOpen, openLayerDropdown, layerButtonRef, layerDropdownRef, dropdownPos, dataStore, uiStore }) => {
        const strokeColor = activeLayer?.strokeColor || '#000000';
        const fillColor = activeLayer?.fillColor || '#FFFFFF';
        const iconColor = ensureContrastColor(fillColor === 'transparent' ? '#1e293b' : fillColor, RIBBON_SURFACE_COLOR);
        const swatchBorderColor = ensureContrastColor(strokeColor, RIBBON_SURFACE_COLOR, 0.6);
        return (
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
                            <span
                                className="w-3.5 h-3.5 rounded-full flex-none cursor-default"
                                style={{ backgroundColor: fillColor, border: `2px solid ${strokeColor}` }}
                                title="Indicador de Cores da Camada (Traço/Fundo)"
                            />
                            <Layers size={14} className="text-slate-400" />
                            <span className="truncate">{activeLayer?.name || 'Selecione'}</span>
                        </div>
                        <ChevronDown size={12} className={`text-slate-500 transition-transform duration-300 ease-in-out ${isLayerDropdownOpen ? '-rotate-180' : 'rotate-0'}`} />
                    </button>
                    {isLayerDropdownOpen && typeof document !== 'undefined' && createPortal(
                        <div
                            ref={layerDropdownRef}
                            className="fixed w-64 bg-slate-800 border border-slate-600 shadow-xl rounded-lg z-[9999] max-h-64 overflow-y-auto menu-transition py-1"
                            style={{ top: dropdownPos.top + 4, left: dropdownPos.left }}
                        >
                            {dataStore.layers.map((layer: any) => (
                                <div key={layer.id} className={`flex items-center p-2 hover:bg-slate-700/50 cursor-pointer ${layer.id === dataStore.activeLayerId ? 'bg-slate-700' : ''}`} onClick={(e: any) => { e.stopPropagation(); dataStore.setActiveLayerId(layer.id); setLayerDropdownOpen(false); }}>
                                    <div className="w-2 h-2 rounded-full mr-3 shadow-sm" style={{backgroundColor: layer.fillColor, border: `1px solid ${layer.strokeColor}`}}></div>
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
                        </div>,
                        document.body
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
                        <button 
                            onClick={() => {
                                const ids = Array.from(uiStore.selectedShapeIds);
                                if (ids.length === 0) return;
                                ids.forEach(id => {
                                    dataStore.updateShape(id, { 
                                        colorMode: { fill: 'layer', stroke: 'layer' }
                                    }, true);
                                });
                            }}
                            disabled={(() => {
                                // Only enabled if there's a selected shape with custom colorMode
                                if (uiStore.selectedShapeIds.size === 0) return true;
                                const firstId = (Array.from(uiStore.selectedShapeIds) as string[])[0];
                                const shape = dataStore.shapes[firstId];
                                if (!shape || !shape.colorMode) return true;
                                // Enabled if at least one is 'custom'
                                return shape.colorMode.fill !== 'custom' && shape.colorMode.stroke !== 'custom';
                            })()}
                            className={`h-7 w-7 ${CENTERED_BUTTON_STYLE} ${(() => {
                                if (uiStore.selectedShapeIds.size === 0) return 'opacity-40 cursor-not-allowed';
                                const firstId = (Array.from(uiStore.selectedShapeIds) as string[])[0];
                                const shape = dataStore.shapes[firstId];
                                if (!shape || !shape.colorMode) return 'opacity-40 cursor-not-allowed';
                                if (shape.colorMode.fill === 'custom' || shape.colorMode.stroke === 'custom') {
                                    return 'text-green-400 hover:text-green-300';
                                }
                                return 'opacity-40 cursor-not-allowed';
                            })()}`}
                            title="Aplicar camada ao elemento selecionado"
                        >
                            <Palette size={15} />
                        </button>
                    </div>

                    {/* Right: Manage */}
                    <button
                        onClick={() => uiStore.setLayerManagerOpen(true)}
                        className={`h-7 px-2 flex items-center gap-1.5 ${BASE_BUTTON_STYLE} text-[9px] uppercase font-bold tracking-wide`}
                        title="Gerenciador de Camadas"
                    >
                        <Settings2 size={18} />
                    </button>
                </div>
            </div>
        );
    },
    'ColorControl': ({ uiStore, dataStore, activeLayer, openColorPicker, selectedShapeIds }) => {
        // Get first selected shape (if any) to show its colors
        const selectedIds: string[] = Array.from(uiStore.selectedShapeIds);
        const firstSelectedShape = selectedIds.length > 0 ? dataStore.shapes[selectedIds[0]] : null;
        
        // Determine display colors: from selected shape or from active layer
        const displayStrokeColor = firstSelectedShape 
            ? getEffectiveStrokeColor(firstSelectedShape, activeLayer) 
            : (activeLayer?.strokeColor || '#000000');
        // For fill, show the stored fillColor (not effective) so user sees the color that will be restored
        const displayFillColor = firstSelectedShape 
            ? getEffectiveFillColor(firstSelectedShape, activeLayer) 
            : (activeLayer?.fillColor || '#ffffff');
        
        // Determine if stroke/fill are enabled
        const strokeEnabled = firstSelectedShape 
            ? firstSelectedShape.strokeEnabled !== false 
            : uiStore.strokeEnabled !== false;
        const fillEnabled = firstSelectedShape 
            ? firstSelectedShape.fillEnabled !== false 
            : uiStore.fillColor !== 'transparent';

        // Stroke width - show selected shape's value or uiStore default
        const displayStrokeWidth = firstSelectedShape?.strokeWidth ?? uiStore.strokeWidth;

        // Handlers for checkbox changes
        const handleStrokeEnabledChange = (checked: boolean) => {
            uiStore.setStrokeEnabled(checked);
            // When re-enabling, use black as default to make it clear element is now custom
            const newStrokeColor = checked ? '#000000' : undefined;
            // Update selected shapes
            selectedIds.forEach(id => {
                const shape = dataStore.shapes[id];
                if (shape) {
                    const updates: any = { 
                        strokeEnabled: checked,
                        colorMode: buildColorModeUpdate(shape, { stroke: 'custom' })
                    };
                    if (newStrokeColor) updates.strokeColor = newStrokeColor;
                    dataStore.updateShape(id, updates, true);
                }
            });
        };

        const handleFillEnabledChange = (checked: boolean) => {
            // Use default colors when re-enabling to make it clear the element is now custom
            const newFillColor = checked ? '#eeeeee' : 'transparent';
            uiStore.setFillColor(newFillColor);
            // Update selected shapes
            selectedIds.forEach(id => {
                const shape = dataStore.shapes[id];
                if (shape) {
                    dataStore.updateShape(id, { 
                        fillColor: newFillColor,
                        colorMode: buildColorModeUpdate(shape, { fill: 'custom' })
                    }, true);
                }
            });
        };

        const handleStrokeWidthChange = (value: number) => {
            uiStore.setStrokeWidth(value);
            // Update selected shapes
            selectedIds.forEach(id => {
                const shape = dataStore.shapes[id];
                if (shape) {
                    dataStore.updateShape(id, { strokeWidth: value }, true);
                }
            });
        };

        return (
            <div className="flex flex-col gap-1.5 px-2 h-full justify-center w-[160px]">
                {/* Top Row: Colors */}
                <div className="grid grid-cols-2 gap-2 w-full">
                    {/* Stroke */}
                    <div className="flex flex-col items-center gap-0.5">
                        <span className={LABEL_STYLE} style={{marginBottom: 0}}>Traço</span>
                        <div className={`flex items-center justify-between w-full bg-slate-800/40 rounded border border-slate-700/30 px-1.5 py-1 ${!strokeEnabled ? 'opacity-50' : ''}`}>
                            <input
                                type="checkbox"
                                checked={strokeEnabled}
                                onChange={(e) => handleStrokeEnabledChange(e.target.checked)}
                                className="w-3 h-3 rounded-sm border-slate-600 bg-slate-900/50 accent-blue-500 cursor-pointer"
                            />
                            <div
                                className="w-5 h-5 rounded border border-slate-400 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                                style={{ backgroundColor: displayStrokeColor }}
                                onClick={(e) => strokeEnabled && openColorPicker(e, { type: 'stroke' })}
                            />
                        </div>
                    </div>
                    {/* Fill */}
                    <div className="flex flex-col items-center gap-0.5">
                        <span className={LABEL_STYLE} style={{marginBottom: 0}}>Fundo</span>
                        <div className={`flex items-center justify-between w-full bg-slate-800/40 rounded border border-slate-700/30 px-1.5 py-1 ${!fillEnabled ? 'opacity-50' : ''}`}>
                            <input
                                type="checkbox"
                                checked={fillEnabled}
                                onChange={(e) => handleFillEnabledChange(e.target.checked)}
                                className="w-3 h-3 rounded-sm border-slate-600 bg-slate-900/50 accent-blue-500 cursor-pointer"
                            />
                            <div
                                className="w-5 h-5 rounded border border-slate-400 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                                style={{
                                    backgroundColor: displayFillColor === 'transparent' ? 'transparent' : displayFillColor,
                                    backgroundImage: displayFillColor === 'transparent' ? 
                                        'linear-gradient(45deg, #333 25%, transparent 25%), linear-gradient(-45deg, #333 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #333 75%), linear-gradient(-45deg, transparent 75%, #333 75%)' 
                                        : 'none',
                                    backgroundSize: '4px 4px'
                                }}
                                onClick={(e) => fillEnabled && openColorPicker(e, { type: 'fill' })}
                            />
                        </div>
                    </div>
                </div>

                {/* Bottom Row: Slider */}
                 <div className="flex flex-col w-full gap-0.5 mt-0.5">
                     <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider px-0.5">Espessura</span>
                     <div className="flex items-center gap-1.5 w-full">
                         <EditableNumber 
                            value={displayStrokeWidth} 
                            onChange={handleStrokeWidthChange} 
                            min={0} 
                            max={50}
                            className="w-[32px] h-6 flex-none"
                            displayClassName="text-[10px] font-mono"
                         />
                        <div className="flex-1 bg-slate-800/40 rounded-full h-4 flex items-center px-1 border border-slate-700/30">
                            <input
                                type="range"
                                min="0"
                                max="50"
                                step="1"
                                value={displayStrokeWidth}
                                onChange={(e) => handleStrokeWidthChange(parseInt(e.target.value))}
                                className="w-full h-0.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 hover:[&::-webkit-slider-thumb]:bg-blue-400 [&::-moz-range-thumb]:w-2.5 [&::-moz-range-thumb]:h-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-none"
                            />
                        </div>
                    </div>
                </div>
            </div>
        );
    },
    'LineWidthControl': () => null,
    'GridControl': ({ uiStore, openColorPicker }) => {
        return (
            <div className="flex flex-col gap-1.5 px-2 h-full justify-center w-[140px]">
                {/* Top Row: Toggles */}
                <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={uiStore.gridShowDots}
                            onChange={(e) => uiStore.setGridShowDots(e.target.checked)}
                            className="w-3 h-3 rounded border-slate-600 bg-slate-700 text-blue-500 cursor-pointer"
                        />
                        <span className="text-[9px] text-slate-300 font-medium">Pontos</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={uiStore.gridShowLines}
                            onChange={(e) => uiStore.setGridShowLines(e.target.checked)}
                            className="w-3 h-3 rounded border-slate-600 bg-slate-700 text-blue-500 cursor-pointer"
                        />
                        <span className="text-[9px] text-slate-300 font-medium">Linhas</span>
                    </label>
                </div>

                {/* Bottom Row: Color and Size */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                        <span className="text-[9px] text-slate-400">Cor</span>
                        <div 
                            className="w-5 h-5 rounded border border-slate-500 cursor-pointer hover:scale-105 transition-transform"
                            style={{ backgroundColor: uiStore.gridColor }}
                            onClick={(e) => openColorPicker(e, { type: 'grid' })}
                        />
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-[9px] text-slate-400">Tam</span>
                        <EditableNumber 
                            value={uiStore.gridSize} 
                            onChange={uiStore.setGridSize} 
                            min={10} 
                            max={500}
                            className="w-[36px] h-5"
                            displayClassName="text-[9px] font-mono"
                        />
                    </div>
                </div>
            </div>
        );
    }
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
  const layerButtonRef = useRef<HTMLButtonElement>(null);
  const layerDropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

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
    if (layerButtonRef.current) {
        const rect = layerButtonRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom, left: rect.left });
        setLayerDropdownOpen(true);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (!isLayerDropdownOpen) return;
        const target = event.target as Node | null;
        if (!target) return;
        if (layerButtonRef.current?.contains(target)) return;
        if (layerDropdownRef.current?.contains(target)) return;
        setLayerDropdownOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isLayerDropdownOpen]);

  const [colorPickerTarget, setColorPickerTarget] = useState<ColorPickerTarget | null>(null);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });

  const openColorPicker = (e: React.MouseEvent, target: ColorPickerTarget) => {
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setColorPickerPos({ top: rect.bottom + 8, left: rect.left - 10 });
      setColorPickerTarget(target);
  };

  // Get all selected shape IDs for color operations
  const allSelectedIds = useMemo(
    () => Array.from(uiStore.selectedShapeIds) as string[],
    [uiStore.selectedShapeIds]
  );
  const firstSelectedShape = allSelectedIds.length > 0 ? dataStore.shapes[allSelectedIds[0]] : null;

  const activeColor = useMemo(() => {
    if (!colorPickerTarget) return '#FFFFFF';
    if (colorPickerTarget.type === 'stroke') {
      // Show color of first selected shape or layer color
      return firstSelectedShape 
        ? getEffectiveStrokeColor(firstSelectedShape, activeLayer)
        : (activeLayer?.strokeColor || '#000000');
    }
    // fill
    return firstSelectedShape 
      ? getEffectiveFillColor(firstSelectedShape, activeLayer)
      : (activeLayer?.fillColor || '#ffffff');
  }, [colorPickerTarget, firstSelectedShape, activeLayer]);

  const handleColorChange = (newColor: string) => {
      if (!colorPickerTarget) return;

      // Update UI store colors
      if (colorPickerTarget.type === 'stroke') {
        uiStore.setStrokeColor(newColor);
      } else {
        uiStore.setFillColor(newColor);
      }

      // Apply to ALL selected shapes (not just text), and set colorMode to 'custom'
      allSelectedIds.forEach(id => {
        const shape = dataStore.shapes[id];
        if (!shape) return;
        
        if (colorPickerTarget.type === 'stroke') {
          dataStore.updateShape(id, {
            strokeColor: newColor,
            colorMode: buildColorModeUpdate(shape, { stroke: 'custom' })
          }, true);
        } else if (colorPickerTarget.type === 'fill') {
          dataStore.updateShape(id, {
            fillColor: newColor,
            colorMode: buildColorModeUpdate(shape, { fill: 'custom' })
          }, true);
        }
      });

      // Handle grid color separately
      if (colorPickerTarget.type === 'grid') {
        uiStore.setGridColor(newColor);
      }
  };

  const componentProps = {
      activeLayer,
      isLayerDropdownOpen,
      setLayerDropdownOpen,
      openLayerDropdown,
      layerButtonRef,
      layerDropdownRef,
      dropdownPos,
      dataStore,
      uiStore,
      selectedTextIds,
      applyTextUpdate,
      openColorPicker,
      selectedShapeIds: allSelectedIds
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
