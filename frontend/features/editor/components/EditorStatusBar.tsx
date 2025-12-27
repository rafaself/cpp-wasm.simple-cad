import React, { useState } from 'react';
import { useUIStore } from '../../../stores/useUIStore';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useEditorLogic } from '../hooks/useEditorLogic';
import { Magnet, ZoomIn, ZoomOut, Target, CircleDot, Square, ChevronUp, Undo, Redo, Scan, Grid3x3, Crosshair } from 'lucide-react';
import { SnapOptions } from '../../../types';
import EditableNumber from '../../../components/EditableNumber';
import { getEngineRuntime } from '@/engine/core/singleton';
import { useEngineSelectionCount } from '@/engine/core/useEngineSelection';

const EditorStatusBar: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const selectionCount = useEngineSelectionCount();
  const mousePos = useUIStore((s) => s.mousePos);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const history = useUIStore((s) => s.history);
  const { zoomToFit } = useEditorLogic();
  const snapSettings = useSettingsStore(s => s.snap);
  const setSnapEnabled = useSettingsStore(s => s.setSnapEnabled);
  const setSnapOption = useSettingsStore(s => s.setSnapOption);
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  
  const toggleSnap = () => setSnapEnabled(!snapSettings.enabled);
  const toggleOption = (key: keyof SnapOptions) => setSnapOption(key, !snapSettings[key]);

  const handleZoomIn = () => setViewTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) }));
  const handleZoomOut = () => setViewTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
  const handleUndo = () => {
    void getEngineRuntime().then((runtime) => runtime.undo());
  };
  const handleRedo = () => {
    void getEngineRuntime().then((runtime) => runtime.redo());
  };

  return (
    <div className="w-full h-9 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-4 text-xs text-slate-300 select-none z-50">
      <div className="w-40 font-mono">
        {mousePos ? `${mousePos.x.toFixed(2)}, ${mousePos.y.toFixed(2)}` : ''}
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
           <div className="flex items-center bg-slate-800 rounded border border-slate-600">
              <button onClick={toggleSnap} className={`flex items-center gap-1 px-2 py-0.5 hover:bg-slate-700 ${snapSettings.enabled ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                <Magnet size={14} /> SNAP
              </button>
              <button
                onClick={() => setShowSnapMenu(!showSnapMenu)}
                className="px-1 py-0.5 border-l border-slate-600 hover:bg-slate-700"
                title="Opções de Snap"
                aria-label="Opções de Snap"
              >
                <ChevronUp size={14} />
              </button>
           </div>
           
           {showSnapMenu && (
             <div className="absolute bottom-full mb-1 left-0 w-40 bg-slate-800 border border-slate-600 shadow-xl rounded p-2 flex flex-col gap-1 menu-transition">
                <div className="text-[10px] text-slate-500 uppercase mb-1 font-bold">Snap ao Objeto</div>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={snapSettings.endpoint} onChange={() => toggleOption('endpoint')} /> <Square size={12} /> Extremidade
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={snapSettings.midpoint} onChange={() => toggleOption('midpoint')} /> <Target size={12} /> Ponto medio
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={snapSettings.center} onChange={() => toggleOption('center')} /> <CircleDot size={12} /> Centro
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={snapSettings.nearest} onChange={() => toggleOption('nearest')} /> <Crosshair size={12} /> Mais proximo
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={snapSettings.grid} onChange={() => toggleOption('grid')} /> <Grid3x3 size={12} /> Grade
                </label>
             </div>
           )}
        </div>
      </div>

      <div className="flex items-center gap-2">
         <button
           onClick={handleUndo}
           className={`p-1 hover:bg-slate-700 rounded ${history.canUndo ? '' : 'opacity-50 cursor-not-allowed'}`}
           disabled={!history.canUndo}
           title="Desfazer (Ctrl+Z)"
           aria-label="Desfazer"
         >
           <Undo size={14} />
         </button>
         <button
           onClick={handleRedo}
           className={`p-1 hover:bg-slate-700 rounded ${history.canRedo ? '' : 'opacity-50 cursor-not-allowed'}`}
           disabled={!history.canRedo}
           title="Refazer (Ctrl+Y)"
           aria-label="Refazer"
         >
           <Redo size={14} />
         </button>
         
         <div className="h-4 w-px bg-slate-600 mx-2" />
         
         <button
           onClick={zoomToFit}
           className="p-1 hover:bg-slate-700 rounded"
           title={selectionCount > 0 ? 'Zoom na selecao' : 'Ajustar Zoom'}
           aria-label={selectionCount > 0 ? 'Zoom na selecao' : 'Ajustar Zoom'}
         >
           <Scan size={14} />
         </button>
         
         <div className="w-16 h-full flex items-center justify-center py-0.5">
            <EditableNumber
                value={viewTransform.scale * 100}
                onChange={(val) => setViewTransform(prev => ({ ...prev, scale: val / 100 }))}
                min={10}
                max={500}
                step={10}
                suffix="%"
                className="w-full h-full"
                spinnerClassName="text-xs bg-slate-800 !h-full"
                displayClassName="text-xs"
            />
         </div>

         <button
           onClick={handleZoomOut}
           className="p-1 hover:bg-slate-700 rounded"
           title="Diminuir Zoom"
           aria-label="Diminuir Zoom"
         >
           <ZoomOut size={14} />
         </button>
         <button
           onClick={handleZoomIn}
           className="p-1 hover:bg-slate-700 rounded"
           title="Aumentar Zoom"
           aria-label="Aumentar Zoom"
         >
           <ZoomIn size={14} />
         </button>
      </div>
    </div>
  );
};

export default EditorStatusBar;
