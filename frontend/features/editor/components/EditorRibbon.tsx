import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useUIStore } from '../../../stores/useUIStore';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useEditorLogic } from '../hooks/useEditorLogic';
import { MENU_CONFIG } from '../../../config/menu';
import { getIcon } from '../../../utils/iconMap.tsx';
import { ensureContrastColor } from '../../../utils/color';
import { Eye, EyeOff, Lock, Unlock, Plus, Layers, Settings2, AlignLeft, AlignCenterHorizontal, AlignRight, Bold, Italic, Underline, Strikethrough, Palette, ChevronDown } from 'lucide-react';
import ColorPicker from '../../../components/ColorPicker';
import { getWrappedLines, TEXT_PADDING } from '../../../utils/geometry';
import NumberSpinner from '../../../components/NumberSpinner';
import EditableNumber from '../../../components/EditableNumber';
import CustomSelect from '../../../components/CustomSelect';
import { buildColorModeUpdate, getEffectiveFillColor, getEffectiveStrokeColor, isStrokeEffectivelyEnabled, isFillEffectivelyEnabled, getShapeColorMode } from '../../../utils/shapeColors';
import { Shape, Layer } from '../../../types';
import { TextControlProps, TextUpdateDiff, ColorPickerTarget, getApplyLayerButtonState } from '../types/ribbon';
import { UI, TEXT_STYLES, INPUT_STYLES, BUTTON_STYLES } from '../../../design/tokens';
import ElectricalRibbonGallery from '../../library/ElectricalRibbonGallery';

// Shared styles - using design tokens
const LABEL_STYLE = `${TEXT_STYLES.label} mb-1 block text-center`;
const INPUT_STYLE = INPUT_STYLES.ribbon;
const BASE_BUTTON_STYLE = BUTTON_STYLES.base;
const CENTERED_BUTTON_STYLE = BUTTON_STYLES.centered;
const ACTIVE_BUTTON_STYLE = BUTTON_STYLES.active;



// Text Controls
const FONT_OPTIONS = [
    { value: "Inter", label: "Inter" },
    { value: "Arial", label: "Arial" },
    { value: "Times New Roman", label: "Times New Roman" },
    { value: "Courier New", label: "Courier New" },
    { value: "Verdana", label: "Verdana" },
];

const FontFamilyControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
    const textFontFamily = useSettingsStore((s) => s.toolDefaults.text.fontFamily);
    const setTextFontFamily = useSettingsStore((s) => s.setTextFontFamily);
    
    const handleChange = (val: string) => {
        setTextFontFamily(val);
        if (selectedTextIds.length > 0) applyTextUpdate({ fontFamily: val }, true);
    };
    
    return (
        <div className="flex flex-col justify-center w-full">
            <CustomSelect
                value={textFontFamily}
                onChange={handleChange}
                options={FONT_OPTIONS}
                className={INPUT_STYLE}
            />
        </div>
    );
};

const FontSizeControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
    const textFontSize = useSettingsStore((s) => s.toolDefaults.text.fontSize);
    const setTextFontSize = useSettingsStore((s) => s.setTextFontSize);
    
    const handleChange = (val: number) => {
        setTextFontSize(val);
        if (selectedTextIds.length > 0) applyTextUpdate({ fontSize: val }, true);
    };
    
    return (
        <div className="flex flex-col justify-center w-full items-center">
            <NumberSpinner
                value={textFontSize}
                onChange={handleChange}
                min={8}
                max={256}
                className="w-full h-6"
            />
        </div>
    );
};

const TextAlignControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
    const textAlign = useSettingsStore((s) => s.toolDefaults.text.align);
    const setTextAlign = useSettingsStore((s) => s.setTextAlign);
    
    const alignOptions: Array<{ align: 'left' | 'center' | 'right'; icon: React.ReactNode }> = [
        { align: 'left', icon: <AlignLeft size={16} /> },
        { align: 'center', icon: <AlignCenterHorizontal size={16} /> },
        { align: 'right', icon: <AlignRight size={16} /> }
    ];
    
    return (
        <div className="flex flex-col justify-center w-full items-center">
            <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-7 gap-0.5">
                {alignOptions.map(({ align, icon }) => (
                    <button
                        key={align}
                        onClick={() => {
                            setTextAlign(align);
                            if (selectedTextIds.length > 0) applyTextUpdate({ align }, false);
                        }}
                        className={`w-8 h-full ${CENTERED_BUTTON_STYLE} ${textAlign === align ? 'bg-blue-600/30 text-blue-400' : ''}`}
                        title={align}
                    >
                        {icon}
                    </button>
                ))}
            </div>
        </div>
    );
};

type StyleKey = 'bold' | 'italic' | 'underline' | 'strike';

const TextStyleControl: React.FC<TextControlProps> = ({ selectedTextIds, applyTextUpdate }) => {
    const textBold = useSettingsStore((s) => s.toolDefaults.text.bold);
    const textItalic = useSettingsStore((s) => s.toolDefaults.text.italic);
    const textUnderline = useSettingsStore((s) => s.toolDefaults.text.underline);
    const textStrike = useSettingsStore((s) => s.toolDefaults.text.strike);
    const setTextBold = useSettingsStore((s) => s.setTextBold);
    const setTextItalic = useSettingsStore((s) => s.setTextItalic);
    const setTextUnderline = useSettingsStore((s) => s.setTextUnderline);
    const setTextStrike = useSettingsStore((s) => s.setTextStrike);
    
    const styleOptions: Array<{ key: StyleKey; icon: React.ReactNode; active: boolean; setter: (v: boolean) => void; recalc: boolean }> = [
        { key: 'bold', icon: <Bold size={16} />, active: textBold, setter: setTextBold, recalc: true },
        { key: 'italic', icon: <Italic size={16} />, active: textItalic, setter: setTextItalic, recalc: true },
        { key: 'underline', icon: <Underline size={16} />, active: textUnderline, setter: setTextUnderline, recalc: false },
        { key: 'strike', icon: <Strikethrough size={16} />, active: textStrike, setter: setTextStrike, recalc: false },
    ];
    
    const handleClick = (key: StyleKey, active: boolean, setter: (v: boolean) => void, recalc: boolean) => {
        const next = !active;
        setter(next);
        if (selectedTextIds.length > 0) {
            const diff: TextUpdateDiff = { [key]: next };
            applyTextUpdate(diff, recalc);
        }
    };
    
    return (
        <div className="flex flex-col justify-center w-full items-center">
            <div className="flex bg-slate-900/50 rounded-lg border border-slate-700/50 p-0.5 h-7 gap-0.5">
                {styleOptions.map(({ key, icon, active, setter, recalc }) => (
                    <button
                        key={key}
                        onClick={() => handleClick(key, active, setter, recalc)}
                        className={`w-8 h-full ${CENTERED_BUTTON_STYLE} ${active ? 'bg-blue-600/30 text-blue-400' : ''}`}
                        title={key}
                    >
                        {icon}
                    </button>
                ))}
            </div>
        </div>
    );
};

const TextFormatGroup: React.FC<TextControlProps> = (props) => (
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
    'ElectricalLibrary': ElectricalRibbonGallery,
    'ElectricalShortcuts': () => (
        <div className="flex flex-col justify-center gap-1 h-full px-3 text-center">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono text-slate-300 border border-slate-600">R</kbd>
                    <span className="text-[10px] text-slate-400">Girar 90°</span>
                </div>
                <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono text-slate-300 border border-slate-600">F</kbd>
                    <span className="text-[10px] text-slate-400">Espelhar H</span>
                </div>
                <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-[10px] font-mono text-slate-300 border border-slate-600">V</kbd>
                    <span className="text-[10px] text-slate-400">Espelhar V</span>
                </div>
            </div>
        </div>
    ),
    'LayerControl': ({ activeLayer, isLayerDropdownOpen, setLayerDropdownOpen, openLayerDropdown, layerButtonRef, layerDropdownRef, dropdownPos, dataStore, uiStore }) => {
        const strokeColor = activeLayer?.strokeColor || '#000000';
        const fillColor = activeLayer?.fillColor || '#FFFFFF';
        const iconColor = ensureContrastColor(fillColor === 'transparent' ? '#1e293b' : fillColor, UI.RIBBON_SURFACE_COLOR);
        const swatchBorderColor = ensureContrastColor(strokeColor, UI.RIBBON_SURFACE_COLOR, 0.6);
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
                                const ids: string[] = Array.from(uiStore.selectedShapeIds);
                                if (ids.length === 0 || !activeLayer) return;
                                ids.forEach(id => {
                                    const shape = dataStore.shapes[id];
                                    if (!shape) return;
                                    // Update layerId if different + set colorMode to 'layer'
                                    const updates: any = { 
                                        colorMode: { fill: 'layer', stroke: 'layer' }
                                    };
                                    // If element is on a different layer, also move it
                                    if (shape.layerId !== activeLayer.id) {
                                        updates.layerId = activeLayer.id;
                                    }
                                    dataStore.updateShape(id, updates, true);
                                });
                            }}
                            disabled={(() => {
                                // Only enabled if there's a selected shape with:
                                // 1) custom colorMode, OR
                                // 2) different layerId than active layer
                                if (uiStore.selectedShapeIds.size === 0) return true;
                                const firstId = (Array.from(uiStore.selectedShapeIds) as string[])[0];
                                const shape = dataStore.shapes[firstId];
                                if (!shape) return true;
                                
                                const hasCustomMode = shape.colorMode?.fill === 'custom' || shape.colorMode?.stroke === 'custom';
                                const isDifferentLayer = activeLayer && shape.layerId !== activeLayer.id;
                                
                                return !hasCustomMode && !isDifferentLayer;
                            })()}
                            className={`h-7 w-7 ${CENTERED_BUTTON_STYLE} ${(() => {
                                if (uiStore.selectedShapeIds.size === 0) return 'opacity-40 cursor-not-allowed';
                                const firstId = (Array.from(uiStore.selectedShapeIds) as string[])[0];
                                const shape = dataStore.shapes[firstId];
                                if (!shape) return 'opacity-40 cursor-not-allowed';
                                
                                const hasCustomMode = shape.colorMode?.fill === 'custom' || shape.colorMode?.stroke === 'custom';
                                const isDifferentLayer = activeLayer && shape.layerId !== activeLayer.id;
                                
                                if (hasCustomMode || isDifferentLayer) {
                                    return 'text-green-400 hover:text-green-300';
                                }
                                return 'opacity-40 cursor-not-allowed';
                            })()}`}
                            title="Aplicar camada ao elemento selecionado (cor e associação)"
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
    'ColorControl': ({ uiStore, dataStore, activeLayer, openColorPicker, selectedShapeIds, settingsStore }) => {
        // Get first selected shape (if any) to show its colors
        const selectedIds: string[] = Array.from(uiStore.selectedShapeIds);
        const firstSelectedShape = selectedIds.length > 0 ? dataStore.shapes[selectedIds[0]] : null;
        
        // Determine display colors: from selected shape or from active layer
        // NEVER show 'transparent' - always show the stored color so user knows what color will be used
        const effectiveStroke = firstSelectedShape 
            ? getEffectiveStrokeColor(firstSelectedShape, activeLayer) 
            : (activeLayer?.strokeColor || '#000000');
        const effectiveFill = firstSelectedShape 
            ? getEffectiveFillColor(firstSelectedShape, activeLayer) 
            : (activeLayer?.fillColor || '#ffffff');
        
        // Display colors: replace transparent with a fallback
        const displayStrokeColor = effectiveStroke;
        const displayFillColor = effectiveFill === 'transparent' 
            ? (activeLayer?.fillColor || '#ffffff') 
            : effectiveFill;
        
        // Determine if stroke/fill are enabled using unified effective resolution
        const strokeEnabled = firstSelectedShape 
            ? isStrokeEffectivelyEnabled(firstSelectedShape, activeLayer)
            : (activeLayer?.strokeEnabled !== false && settingsStore.toolDefaults.strokeEnabled !== false);
        const fillEnabled = firstSelectedShape 
            ? isFillEffectivelyEnabled(firstSelectedShape, activeLayer)
            : (activeLayer?.fillEnabled !== false && settingsStore.toolDefaults.fillColor !== 'transparent');

        // Stroke width - show selected shape's value or uiStore default
        const displayStrokeWidth = firstSelectedShape?.strokeWidth ?? settingsStore.toolDefaults.strokeWidth;
        
        // Get color mode for first selected shape (if any)
        const colorMode = firstSelectedShape ? getShapeColorMode(firstSelectedShape) : null;

        /**
         * UNIFIED TOGGLE BEHAVIOR:
         * - If no shape selected: toggle on uiStore (affects new shapes)
         * - If shape selected AND mode === 'layer': toggle on layer (affects all inheriting shapes)
         * - If shape selected AND mode === 'custom': toggle on shape only
         * This prevents accidental mode changes and keeps behavior consistent with Sidebar.
         */
        const handleStrokeEnabledChange = (checked: boolean) => {
            settingsStore.setStrokeEnabled(checked);
            
            if (selectedIds.length === 0) return; // Only update uiStore for new shapes
            
            selectedIds.forEach(id => {
                const shape = dataStore.shapes[id];
                if (!shape) return;
                
                const mode = getShapeColorMode(shape).stroke;
                if (mode === 'layer' && activeLayer) {
                    // Toggle on layer level - affects all elements inheriting from this layer
                    dataStore.updateLayer(activeLayer.id, { strokeEnabled: checked });
                } else {
                    // Toggle on element level only - no mode change
                    dataStore.updateShape(id, { strokeEnabled: checked }, true);
                }
            });
        };

        const handleFillEnabledChange = (checked: boolean) => {
            settingsStore.setFillColor(checked ? '#eeeeee' : 'transparent');
            
            if (selectedIds.length === 0) return; // Only update uiStore for new shapes
            
            selectedIds.forEach(id => {
                const shape = dataStore.shapes[id];
                if (!shape) return;
                
                const mode = getShapeColorMode(shape).fill;
                if (mode === 'layer' && activeLayer) {
                    // Toggle on layer level - affects all elements inheriting from this layer
                    dataStore.updateLayer(activeLayer.id, { fillEnabled: checked });
                } else {
                    // Toggle on element level only - no mode change
                    dataStore.updateShape(id, { fillEnabled: checked }, true);
                }
            });
        };

        const handleStrokeWidthChange = (value: number) => {
            settingsStore.setStrokeWidth(value);
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
    // LineWidthControl removed - functionality merged into ColorControl
    'GridControl': ({ settingsStore, openColorPicker }) => {
        return (
            <div className="flex flex-col gap-1.5 px-3 h-full justify-center">
                {/* Row 1: Toggle buttons */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => settingsStore.setGridShowDots(!settingsStore.grid.showDots)}
                        className={`h-6 px-2.5 rounded text-[10px] font-semibold transition-all border ${
                            settingsStore.grid.showDots 
                                ? 'bg-blue-500 text-white border-blue-600 shadow-md' 
                                : 'bg-slate-700/80 text-slate-300 border-slate-600 hover:bg-slate-600/80'
                        }`}
                    >
                        Pontos
                    </button>
                    <button
                        onClick={() => settingsStore.setGridShowLines(!settingsStore.grid.showLines)}
                        className={`h-6 px-2.5 rounded text-[10px] font-semibold transition-all border ${
                            settingsStore.grid.showLines 
                                ? 'bg-blue-500 text-white border-blue-600 shadow-md' 
                                : 'bg-slate-700/80 text-slate-300 border-slate-600 hover:bg-slate-600/80'
                        }`}
                    >
                        Linhas
                    </button>
                </div>
                
                {/* Row 2: Color and Size */}
                <div className="flex items-center gap-2">
                    <div 
                        className="w-5 h-5 rounded border-2 border-slate-500 cursor-pointer hover:scale-110 transition-transform"
                        style={{ backgroundColor: settingsStore.grid.color }}
                        onClick={(e) => openColorPicker(e, { type: 'grid' })}
                        title="Cor do Grid"
                    />
                    <div className="flex items-center gap-0.5">
                        <EditableNumber 
                            value={settingsStore.grid.size} 
                            onChange={settingsStore.setGridSize} 
                            min={10} 
                            max={500}
                            className="w-[38px] h-5"
                            displayClassName="text-[10px] font-mono"
                        />
                        <span className="text-[9px] text-slate-400">px</span>
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
  const settingsStore = useSettingsStore();
  const dataStore = useDataStore();
  const { deleteSelected, joinSelected, zoomToFit } = useEditorLogic();
  
  // Layer Dropdown State
  const [isLayerDropdownOpen, setLayerDropdownOpen] = useState(false);
  const layerButtonRef = useRef<HTMLButtonElement>(null);
  const layerDropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const handleAction = (action?: string) => {
      if (action === 'delete') deleteSelected();
      if (action === 'join') joinSelected();
      if (action === 'explore') { /* TODO: Implement explode */ }
      if (action === 'zoom-fit') zoomToFit();
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
      const nextFontSize = (diff.fontSize ?? shape.fontSize ?? settingsStore.toolDefaults.text.fontSize) || 16;
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
    if (colorPickerTarget.type === 'grid') {
      return settingsStore.grid.color;
    }
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
  }, [colorPickerTarget, firstSelectedShape, activeLayer, settingsStore.grid.color]);

  const handleColorChange = (newColor: string) => {
      if (!colorPickerTarget) return;

      // Update settings defaults
      if (colorPickerTarget.type === 'stroke') {
        settingsStore.setStrokeColor(newColor);
      } else {
        settingsStore.setFillColor(newColor);
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
        settingsStore.setGridColor(newColor);
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
      settingsStore,
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
                                    if(item.type === 'tool' && item.tool) {
                                        uiStore.setTool(item.tool);
                                        // Special handling for electrical symbol tools
                                        if (item.tool === 'electrical-symbol') {
                                            const symbolMap: Record<string, string> = {
                                                'outlet': 'duplex_outlet',
                                                'lamp': 'lamp'
                                            };
                                            if (symbolMap[item.id]) {
                                                uiStore.setElectricalSymbolId(symbolMap[item.id]);
                                                uiStore.resetElectricalPreview();
                                            }
                                        }
                                    }
                                    if(item.type === 'action' && item.action) handleAction(item.action);
                                }}
                                className={`flex flex-col items-center justify-center px-1 py-1 gap-0.5 rounded w-full min-w-[48px] transition-all duration-150
                                    ${(() => {
                                        if (item.type !== 'tool') return BASE_BUTTON_STYLE;
                                        if (item.tool === 'electrical-symbol') {
                                            const symbolMap: Record<string, string> = { 'outlet': 'duplex_outlet', 'lamp': 'lamp' };
                                            const isActive = uiStore.activeTool === 'electrical-symbol' && uiStore.activeElectricalSymbolId === symbolMap[item.id];
                                            return isActive ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                        }
                                        return uiStore.activeTool === item.tool ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                    })()}
                                `}
                                title={`${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}`}
                            >
                                <div className="text-slate-400">
                                    {getIcon(item.icon)}
                                </div>
                                <span className={`text-[9px] text-center whitespace-nowrap leading-none ${(() => {
                                    if (item.type !== 'tool') return '';
                                    if (item.tool === 'electrical-symbol') {
                                        const symbolMap: Record<string, string> = { 'outlet': 'duplex_outlet', 'lamp': 'lamp' };
                                        return uiStore.activeTool === 'electrical-symbol' && uiStore.activeElectricalSymbolId === symbolMap[item.id] ? 'text-blue-300' : '';
                                    }
                                    return uiStore.activeTool === item.tool ? 'text-blue-300' : '';
                                })()}`}>{item.label}</span>
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
                                        if(item.type === 'tool' && item.tool) {
                                            uiStore.setTool(item.tool);
                                            // Special handling for electrical symbol tools
                                            if (item.tool === 'electrical-symbol') {
                                                const symbolMap: Record<string, string> = {
                                                    'outlet': 'duplex_outlet',
                                                    'lamp': 'lamp'
                                                };
                                                if (symbolMap[item.id]) {
                                                    uiStore.setElectricalSymbolId(symbolMap[item.id]);
                                                    uiStore.resetElectricalPreview();
                                                }
                                            }
                                        }
                                        if(item.type === 'action' && item.action) handleAction(item.action);
                                    }}
                                    className={`flex flex-col items-center justify-center p-3 gap-2 rounded min-w-[64px] h-full transition-all duration-150 group/btn text-center
                                        ${(() => {
                                            if (item.type !== 'tool') return BASE_BUTTON_STYLE;
                                            if (item.tool === 'electrical-symbol') {
                                                const symbolMap: Record<string, string> = { 'outlet': 'duplex_outlet', 'lamp': 'lamp' };
                                                const isActive = uiStore.activeTool === 'electrical-symbol' && uiStore.activeElectricalSymbolId === symbolMap[item.id];
                                                return isActive ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                            }
                                            return uiStore.activeTool === item.tool ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                        })()}
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
