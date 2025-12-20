import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useDataStore } from '../../../stores/useDataStore';
import { useEditorLogic } from '../hooks/useEditorLogic';
import { MENU_CONFIG, MenuItem } from '../../../config/menu';
import { getIcon } from '../../../utils/iconMap';
import ColorPicker from '../../../components/ColorPicker';
import { getWrappedLines, TEXT_PADDING, getDistance } from '../../../utils/geometry';
import { Shape } from '../../../types';
import { ColorPickerTarget } from '../types/ribbon';
import { TEXT_STYLES, BUTTON_STYLES } from '../../../design/tokens';
import ElectricalRibbonGallery from '../../library/ElectricalRibbonGallery';
import { getConnectionPoint } from '../snapEngine/detectors';
import { resolveConnectionNodePosition } from '../../../utils/connections';
import { FontFamilyControl, FontSizeControl, TextAlignControl, TextStyleControl, TextFormatGroup } from '../ribbon/components/TextControls';
import LayerControl from '../ribbon/components/LayerControl';
import GridControl from '../ribbon/components/GridControl';
import ElectricalShortcuts from '../ribbon/components/ElectricalShortcuts';
import { decodeNextDocumentFile, encodeNextDocumentFile } from '../../../persistence/nextDocumentFile';
import { getEngineRuntime } from '@/engine/runtime/singleton';

// Shared styles - using design tokens
const LABEL_STYLE = `${TEXT_STYLES.label} mb-1 block text-center`;
const BASE_BUTTON_STYLE = BUTTON_STYLES.base;
const ACTIVE_BUTTON_STYLE = BUTTON_STYLES.active;




// Component Registry for config-driven ribbon widgets
const ComponentRegistry: Record<string, React.FC<any>> = {
    FontFamilyControl,
    FontSizeControl,
    TextAlignControl,
    TextStyleControl,
    TextFormatGroup,
    ElectricalLibrary: ElectricalRibbonGallery,
    ElectricalShortcuts,
    LayerControl,
    GridControl,
};

const IMPLEMENTED_ACTIONS = new Set<string>([
    'delete',
    'join',
    'explode',
    'zoom-fit',
    'undo',
    'redo',
    'open-settings',
    'export-connections',
    'export-project',
    'view-project',
    'view-connections',
]);

const ACTION_BADGES: Record<string, string> = {
    'export-project': 'Download',
    'export-connections': 'Download',
    'export-json': 'Download',
    'report-csv': 'Download',
    'view-project': 'Nova aba',
    'view-connections': 'Nova aba',
};

const getActionBadgeLabel = (action?: string) => (action ? ACTION_BADGES[action] : undefined);

const isActionImplemented = (action?: string) => !!action && IMPLEMENTED_ACTIONS.has(action);

const shouldDisableAction = (item: MenuItem) => item.type === 'action' && !isActionImplemented(item.action);

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
  const activeTool = useUIStore((s) => s.activeTool);
  const sidebarTab = useUIStore((s) => s.sidebarTab);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const selectedShapeIds = useUIStore((s) => s.selectedShapeIds);
  const activeElectricalSymbolId = useUIStore((s) => s.activeElectricalSymbolId);
  const setSettingsModalOpen = useUIStore((s) => s.setSettingsModalOpen);
  const setTool = useUIStore((s) => s.setTool);
  const setElectricalSymbolId = useUIStore((s) => s.setElectricalSymbolId);
  const resetElectricalPreview = useUIStore((s) => s.resetElectricalPreview);
  const settingsStore = useSettingsStore();
  const dataStore = useDataStore();
  const { deleteSelected, joinSelected, explodeSelected, zoomToFit } = useEditorLogic();
  
  // Layer Dropdown State
  const [isLayerDropdownOpen, setLayerDropdownOpen] = useState(false);
  const layerButtonRef = useRef<HTMLButtonElement>(null);
  const layerDropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });

  const isConduitShape = (s: Shape) => s.type === 'eletroduto';

  const serializeProject = useDataStore((state) => state.serializeProject);
  const worldScale = useDataStore((state) => state.worldScale);
  const frame = useDataStore((state) => state.frame);

  const escapeHtml = (value: string) => {
      return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const exportProjectData = useCallback(() => {
      const project = serializeProject();
      const payload = {
      meta: {
          generatedAt: new Date().toISOString(),
          worldScale,
          frame,
          viewTransform,
          activeTool,
          sidebarTab,
          selectedShapeIds: Array.from(selectedShapeIds)
      },
          project
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'endeavour-project.json';
      a.click();
      URL.revokeObjectURL(url);
  }, [serializeProject, worldScale, frame, activeTool, sidebarTab, viewTransform, selectedShapeIds]);

  const saveNextDocument = useCallback(() => {
      void (async () => {
        const payload = {
          worldScale,
          frame,
          project: serializeProject(),
          history: { past: dataStore.past, future: dataStore.future },
        };

        const runtime = await getEngineRuntime();
        const snapMeta = runtime.engine.getSnapshotBufferMeta();
        const engineSnapshot = new Uint8Array(runtime.module.HEAPU8.subarray(snapMeta.ptr, snapMeta.ptr + snapMeta.byteCount));

        const bytes = encodeNextDocumentFile(payload, { engineSnapshot });
        const blob = new Blob([bytes], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'eletrocad-next.ewnd';
        a.click();
        URL.revokeObjectURL(url);
      })();
  }, [dataStore.future, dataStore.past, frame, serializeProject, worldScale]);

  const openNextDocument = useCallback(() => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ewnd,application/octet-stream';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        const payload = decodeNextDocumentFile(new Uint8Array(buf));

        // The WASM runtime is a singleton; restore (or at least clear) it immediately
        // to avoid rendering stale geometry from the previous document.
        try {
          const runtime = await getEngineRuntime();
          runtime.resetIds();
          if (payload.engineSnapshot && payload.engineSnapshot.byteLength > 0) {
            runtime.loadSnapshotBytes(payload.engineSnapshot);
          } else {
            runtime.clear();
          }
        } catch (e) {
          console.error(e);
        }

        dataStore.loadSerializedProject({
          project: payload.project,
          worldScale: payload.worldScale,
          frame: payload.frame,
          history: payload.history,
        });
        useUIStore.getState().setSelectedShapeIds(new Set());
        useUIStore.getState().setTool('select');
      };
      input.click();
  }, [dataStore]);

  const newNextDocument = useCallback(() => {
      void (async () => {
        try {
          const runtime = await getEngineRuntime();
          runtime.resetIds();
          runtime.clear();
        } catch (e) {
          console.error(e);
        }
      })();
      dataStore.resetDocument();
      useUIStore.getState().setSelectedShapeIds(new Set());
      useUIStore.getState().setTool('select');
  }, [dataStore]);

  const openProjectPreview = useCallback(() => {
      const project = serializeProject();
      const payload = {
      meta: {
          generatedAt: new Date().toISOString(),
          worldScale,
          frame,
          viewTransform,
          activeTool,
          sidebarTab,
          selectedShapeIds: Array.from(selectedShapeIds)
      },
          project
      };
      const serialized = JSON.stringify(payload, null, 2);
      const win = window.open('', '_blank');
      if (!win) return;
      win.document.write(`<!doctype html><html><head><title>Projeto Endeavour</title><style>body{background:#0f172a;color:#e2e8f0;font-family:Menlo,Consolas,monospace;margin:0;padding:16px;}pre{white-space:pre-wrap;font-size:12px;line-height:1.4;}</style></head><body><pre>${escapeHtml(serialized)}</pre></body></html>`);
      win.document.close();
  }, [serializeProject, worldScale, frame, activeTool, sidebarTab, viewTransform, selectedShapeIds]);

  const exportConnectionsMap = useCallback(() => {
      const shapes = dataStore.shapes;
      const electrical = dataStore.electricalElements;
      const nodesById = dataStore.connectionNodes;

      const connections = Object.values(shapes)
        .filter(s => s && s.svgRaw && s.connectionPoint && s.x !== undefined && s.y !== undefined && s.width !== undefined && s.height !== undefined)
        .map(s => {
            const el = s.electricalElementId ? electrical[s.electricalElementId] : undefined;
            const point = getConnectionPoint(s);
            return {
                id: s.id,
                name: el?.name ?? s.svgSymbolId ?? s.id,
                category: el?.category ?? null,
                position: point,
                electricalElementId: s.electricalElementId ?? null,
                layerId: s.layerId,
            };
        })
        .filter(c => c.position);

      const nodes = Object.values(nodesById).map(n => ({
          id: n.id,
          kind: n.kind,
          anchorShapeId: n.anchorShapeId ?? null,
          position: resolveConnectionNodePosition(n, shapes),
      }));

      const conduits = Object.values(shapes)
        .filter(isConduitShape)
        .flatMap((s) => {
          const fromNodeId = s.fromNodeId ?? null;
          const toNodeId = s.toNodeId ?? null;
          if (!fromNodeId || !toNodeId) return [];
          return [
            {
              id: s.id,
              fromNodeId,
              toNodeId,
              length: s.points && s.points.length >= 2 ? getDistance(s.points[0], s.points[1]) : null,
              controlPoint: s.controlPoint,
              layerId: s.layerId,
            },
          ];
        });

      const payload = {
          generatedAt: new Date().toISOString(),
          connections,
          nodes,
          conduits,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'connections-map.json';
      a.click();
      URL.revokeObjectURL(url);
  }, [dataStore.shapes, dataStore.electricalElements, dataStore.connectionNodes]);

  const viewConnectionsReport = useCallback(() => {
      const shapes = dataStore.shapes;
      const electrical = dataStore.electricalElements;
      const nodesById = dataStore.connectionNodes;

      const connections = Object.values(shapes)
        .filter(s => s && s.svgRaw && s.connectionPoint && s.x !== undefined && s.y !== undefined && s.width !== undefined && s.height !== undefined)
        .map(s => {
            const el = s.electricalElementId ? electrical[s.electricalElementId] : undefined;
            const point = getConnectionPoint(s);
            return {
                id: s.id,
                name: el?.name ?? s.svgSymbolId ?? s.id,
                category: el?.category ?? '',
                position: point,
            };
        })
        .filter(c => c.position);

      const conduits = Object.values(shapes)
        .filter(isConduitShape)
        .flatMap((s) => {
          const fromNodeId = s.fromNodeId ?? null;
          const toNodeId = s.toNodeId ?? null;
          if (!fromNodeId || !toNodeId) return [];
          return [
            {
              id: s.id,
              fromNodeId,
              toNodeId,
              length: s.points && s.points.length >= 2 ? getDistance(s.points[0], s.points[1]).toFixed(2) : '0.00',
            },
          ];
        });

      const htmlRows = conduits.map(c => {
          const fromNode = c.fromNodeId ? nodesById[c.fromNodeId] : null;
          const toNode = c.toNodeId ? nodesById[c.toNodeId] : null;
          const fromAnchor = fromNode?.kind === 'anchored' && fromNode.anchorShapeId ? connections.find(n => n.id === fromNode.anchorShapeId) : null;
          const toAnchor = toNode?.kind === 'anchored' && toNode.anchorShapeId ? connections.find(n => n.id === toNode.anchorShapeId) : null;
          const fromLabel = fromAnchor?.name || fromAnchor?.id || c.fromNodeId || '—';
          const toLabel = toAnchor?.name || toAnchor?.id || c.toNodeId || '—';
          return `<tr><td>${c.id}</td><td>${fromLabel}</td><td>${toLabel}</td><td>${c.length}</td></tr>`;
      }).join('');

      const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Relatorio de Conexoes</title>
<style>
body{font-family:Arial, sans-serif;padding:16px;background:#0f172a;color:#e2e8f0;}
table{border-collapse:collapse;width:100%;margin-top:12px;background:#1e293b;}
th,td{border:1px solid #334155;padding:8px;text-align:left;}
th{background:#0ea5e9;color:#0b1223;}
tr:nth-child(even){background:#111827;}
</style></head><body>
<h2>Relatório de Conexões</h2>
<p>${Object.keys(nodesById).length} nós, ${conduits.length} eletrodutos.</p>
<table><thead><tr><th>ID</th><th>De</th><th>Para</th><th>Comprimento</th></tr></thead><tbody>${htmlRows || '<tr><td colspan=\"4\">Nenhum eletroduto encontrado.</td></tr>'}</tbody></table>
</body></html>`;

      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [dataStore.shapes, dataStore.electricalElements, dataStore.connectionNodes]);

  const handleAction = (action?: string) => {
      if (action === 'new-file') newNextDocument();
      if (action === 'open-file') openNextDocument();
      if (action === 'save-file') saveNextDocument();
      if (action === 'delete') deleteSelected();
      if (action === 'join') joinSelected();
      if (action === 'explode') explodeSelected();
      if (action === 'zoom-fit') zoomToFit();
      if (action === 'undo') dataStore.undo();
      if (action === 'redo') dataStore.redo();
      if (action === 'open-settings') setSettingsModalOpen(true);
      if (action === 'export-connections') exportConnectionsMap();
      if (action === 'export-project') exportProjectData();
      if (action === 'view-project') openProjectPreview();
      if (action === 'view-connections') viewConnectionsReport();
  };

  const activeTab = MENU_CONFIG.find(t => t.id === activeTabId) || MENU_CONFIG[0];
  const activeLayer = dataStore.layers.find(l => l.id === dataStore.activeLayerId);
  const selectedTextIds = useMemo(
    () => Array.from(selectedShapeIds).filter(id => dataStore.shapes[id]?.type === 'text'),
    [selectedShapeIds, dataStore.shapes]
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
      if (target.type !== 'grid') return;
      e.stopPropagation();
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      setColorPickerPos({ top: rect.bottom + 8, left: rect.left - 10 });
      setColorPickerTarget(target);
  };

  const activeColor = useMemo(() => {
    if (!colorPickerTarget) return '#FFFFFF';
    return settingsStore.grid.color;
  }, [colorPickerTarget, settingsStore.grid.color]);

  const handleColorChange = (newColor: string) => {
      if (!colorPickerTarget) return;
      if (colorPickerTarget.type !== 'grid') return;
      settingsStore.setGridColor(newColor);
  };

  const componentProps = {
      activeLayer,
      isLayerDropdownOpen,
      setLayerDropdownOpen,
      openLayerDropdown,
      layerButtonRef,
      layerDropdownRef,
      dropdownPos,
      selectedTextIds,
      applyTextUpdate,
      openColorPicker
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
                        {section.items.map(item => {
                            const actionDisabled = shouldDisableAction(item);
                            const actionBadge = getActionBadgeLabel(item.action);
                            const labelColorClass = (() => {
                                if (item.type !== 'tool') return '';
                                if (item.tool === 'electrical-symbol') {
                                    const symbolMap: Record<string, string> = { 'outlet': 'duplex_outlet', 'lamp': 'lamp' };
                                        return activeTool === 'electrical-symbol' && activeElectricalSymbolId === symbolMap[item.id] ? 'text-blue-300' : '';
                                }
                                return activeTool === item.tool ? 'text-blue-300' : '';
                            })();
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => {
                                        if(item.type === 'tool' && item.tool) {
                                            setTool(item.tool);
                                            if (item.tool === 'electrical-symbol') {
                                                const symbolMap: Record<string, string> = {
                                                    'outlet': 'duplex_outlet',
                                                    'lamp': 'lamp'
                                                };
                                                if (symbolMap[item.id]) {
                                                    setElectricalSymbolId(symbolMap[item.id]);
                                                    resetElectricalPreview();
                                                }
                                            }
                                        }
                                        if(item.type === 'action' && item.action) handleAction(item.action);
                                    }}
                                    className={`flex flex-col items-center justify-center px-1 py-1 gap-0.5 rounded w-full min-w-[48px] transition-all duration-150
                                    ${(() => {
                                        if (item.type !== 'tool') return `${BASE_BUTTON_STYLE}${actionDisabled ? ' opacity-30 cursor-not-allowed' : ''}`;
                                        if (item.tool === 'electrical-symbol') {
                                            const symbolMap: Record<string, string> = { 'outlet': 'duplex_outlet', 'lamp': 'lamp' };
                                            const isActive = activeTool === 'electrical-symbol' && activeElectricalSymbolId === symbolMap[item.id];
                                            return isActive ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                        }
                                        return activeTool === item.tool ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                    })()}
                                `}
                                    title={`${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}`}
                                    disabled={actionDisabled}
                                    aria-disabled={actionDisabled}
                                >
                                    <div className="text-slate-400">
                                        {getIcon(item.icon)}
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5 text-[9px] text-center whitespace-nowrap leading-none">
                                        <span className={labelColorClass}>{item.label}</span>
                                        {actionBadge && (
                                            <span className="text-[7px] uppercase tracking-wider text-slate-400">{actionBadge}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}

                    </div>
                ) : (
                    <div className="flex gap-2 h-full items-center px-1">
                    {section.items.map(item => {
                        const actionDisabled = shouldDisableAction(item);
                        const actionBadge = getActionBadgeLabel(item.action);
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
                                            setTool(item.tool);
                                            // Special handling for electrical symbol tools
                                            if (item.tool === 'electrical-symbol') {
                                                const symbolMap: Record<string, string> = {
                                                    'outlet': 'duplex_outlet',
                                                    'lamp': 'lamp'
                                                };
                                                if (symbolMap[item.id]) {
                                                    setElectricalSymbolId(symbolMap[item.id]);
                                                    resetElectricalPreview();
                                                }
                                            }
                                        }
                                        if(item.type === 'action' && item.action) handleAction(item.action);
                                    }}
                                className={`flex flex-col items-center justify-center p-3 gap-2 rounded min-w-[64px] h-full transition-all duration-150 group/btn text-center
                                    ${(() => {
                                        if (item.type !== 'tool') return `${BASE_BUTTON_STYLE}${actionDisabled ? ' opacity-30 cursor-not-allowed' : ''}`;
                                        if (actionDisabled) return `${BASE_BUTTON_STYLE} opacity-30 cursor-not-allowed`;
                                        if (item.tool === 'electrical-symbol') {
                                            const symbolMap: Record<string, string> = { 'outlet': 'duplex_outlet', 'lamp': 'lamp' };
                                            const isActive = activeTool === 'electrical-symbol' && activeElectricalSymbolId === symbolMap[item.id];
                                            return isActive ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                        }
                                            return activeTool === item.tool ? ACTIVE_BUTTON_STYLE : BASE_BUTTON_STYLE;
                                        })()}
                                `}
                                title={`${item.label} ${item.shortcut ? `(${item.shortcut})` : ''}`}
                                disabled={actionDisabled}
                                aria-disabled={actionDisabled}
                            >
                                    <div className="transform transition-transform group-hover/btn:scale-110 duration-200">
                                         {getIcon(item.icon)}
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5">
                                        <span className="text-[10px] font-medium text-center leading-tight">{item.label}</span>
                                        {actionBadge && (
                                            <span className="text-[8px] uppercase tracking-wider text-slate-400">{actionBadge}</span>
                                        )}
                                    </div>
                                </button>
                        );
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
