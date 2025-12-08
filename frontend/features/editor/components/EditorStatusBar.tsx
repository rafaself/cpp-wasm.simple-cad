import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { Magnet, ZoomIn, ZoomOut, Target, CircleDot, Square, ChevronUp, Undo, Redo, Scan, Calculator } from 'lucide-react';
import { SnapOptions } from '../../../types';
import { getDistance } from '../../../utils/geometry';

const EditorStatusBar: React.FC = () => {
  const store = useAppStore();
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const [totalLength, setTotalLength] = useState<string | null>(null);

  // POC: Calculate total length of selected lines
  useEffect(() => {
    if (store.selectedShapeIds.size > 0) {
        let total = 0;
        let hasLines = false;
        store.selectedShapeIds.forEach(id => {
            const s = store.shapes[id];
            if (!s) return;
            if (s.type === 'line' || s.type === 'polyline' || s.type === 'measure') {
                hasLines = true;
                if (s.points && s.points.length >= 2) {
                    if (s.type === 'line' || s.type === 'measure') {
                       total += getDistance(s.points[0], s.points[1]);
                    } else if (s.type === 'polyline') {
                       for(let i=0; i<s.points.length-1; i++) {
                          total += getDistance(s.points[i], s.points[i+1]);
                       }
                    }
                }
            }
        });

        if (hasLines) {
            const meters = total / store.worldScale;
            setTotalLength(meters.toFixed(2) + "m");
        } else {
            setTotalLength(null);
        }
    } else {
        setTotalLength(null);
    }
  }, [store.selectedShapeIds, store.shapes, store.worldScale]);
  
  // Zoom Editing State
  const [isEditingZoom, setIsEditingZoom] = useState(false);
  const [zoomInputValue, setZoomInputValue] = useState("");
  const zoomInputRef = useRef<HTMLInputElement>(null);

  const toggleSnap = () => store.setSnapOptions(prev => ({ ...prev, enabled: !prev.enabled }));
  const toggleOption = (key: keyof SnapOptions) => store.setSnapOptions(prev => ({ ...prev, [key]: !prev[key] }));

  // Limit max scale to 5 (500%)
  const handleZoomIn = () => store.setViewTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) }));
  const handleZoomOut = () => store.setViewTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));

  const startEditingZoom = () => {
      setZoomInputValue((store.viewTransform.scale * 100).toFixed(0));
      setIsEditingZoom(true);
      // Wait for render to focus
      setTimeout(() => zoomInputRef.current?.focus(), 0);
  };

  const commitZoom = () => {
      let val = parseInt(zoomInputValue);
      if (isNaN(val)) val = 100;
      
      // Constraint: 10% to 500%
      val = Math.max(10, Math.min(val, 500));
      
      store.setViewTransform(prev => ({ ...prev, scale: val / 100 }));
      setIsEditingZoom(false);
  };

  const handleZoomKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          commitZoom();
      }
      if (e.key === 'Escape') {
          setIsEditingZoom(false);
      }
  };

  return (
    <div className="w-full h-8 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-4 text-xs text-slate-300 select-none z-50">
      <div className="w-40 font-mono">
        {store.mousePos ? `${store.mousePos.x.toFixed(2)}, ${store.mousePos.y.toFixed(2)}` : ''}
      </div>

      <div className="flex items-center gap-4">

        {/* POC: Material Calculator Display */}
        {totalLength && (
            <div className="flex items-center gap-2 bg-blue-900/30 border border-blue-500/50 px-2 py-0.5 rounded text-blue-200" title="Comprimento total dos fios selecionados (POC de Inteligência)">
                <Calculator size={14} />
                <span className="font-bold">{totalLength}</span>
                <span className="text-[10px] opacity-60">(Fio)</span>
            </div>
        )}

        <div className="relative">
           <div className="flex items-center bg-slate-800 rounded border border-slate-600">
              <button onClick={toggleSnap} className={`flex items-center gap-1 px-2 py-0.5 hover:bg-slate-700 ${store.snapOptions.enabled ? 'text-blue-400 font-bold' : 'text-slate-500'}`}>
                <Magnet size={14} /> SNAP
              </button>
              <button onClick={() => setShowSnapMenu(!showSnapMenu)} className="px-1 py-0.5 border-l border-slate-600 hover:bg-slate-700">
                <ChevronUp size={14} />
              </button>
           </div>
           
           {showSnapMenu && (
             <div className="absolute bottom-full mb-1 left-0 w-40 bg-slate-800 border border-slate-600 shadow-xl rounded p-2 flex flex-col gap-1">
                <div className="text-[10px] text-slate-500 uppercase mb-1 font-bold">Snap ao Objeto</div>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={store.snapOptions.endpoint} onChange={() => toggleOption('endpoint')} /> <Square size={12} /> Extremidade
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={store.snapOptions.midpoint} onChange={() => toggleOption('midpoint')} /> <Target size={12} /> Ponto Médio
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={store.snapOptions.center} onChange={() => toggleOption('center')} /> <CircleDot size={12} /> Centro
                </label>
             </div>
           )}
        </div>
      </div>

      <div className="flex items-center gap-2">
         <button onClick={store.undo} className={`p-1 hover:bg-slate-700 rounded ${store.past.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={store.past.length === 0} title="Desfazer (Ctrl+Z)"><Undo size={14} /></button>
         <button onClick={store.redo} className={`p-1 hover:bg-slate-700 rounded ${store.future.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`} disabled={store.future.length === 0} title="Refazer (Ctrl+Y)"><Redo size={14} /></button>
         
         <div className="h-4 w-px bg-slate-600 mx-2" />
         
         <button onClick={store.zoomToFit} className="p-1 hover:bg-slate-700 rounded" title={store.selectedShapeIds.size > 0 ? "Zoom na Seleção" : "Ajustar Zoom"}><Scan size={14} /></button>
         
         {/* Zoom Editable Area */}
         <div className="w-12 text-center relative">
            {isEditingZoom ? (
                <input 
                    ref={zoomInputRef}
                    type="number"
                    min="10"
                    max="500"
                    value={zoomInputValue}
                    onChange={(e) => setZoomInputValue(e.target.value)}
                    onBlur={commitZoom}
                    onKeyDown={handleZoomKeyDown}
                    className="w-full bg-slate-800 text-white text-center border border-blue-500 rounded outline-none h-5 text-xs p-0"
                />
            ) : (
                <span 
                    onClick={startEditingZoom}
                    className="cursor-pointer hover:bg-slate-700 px-1 rounded hover:text-white transition-colors"
                    title="Clique para editar zoom"
                >
                    {(store.viewTransform.scale * 100).toFixed(0)}%
                </span>
            )}
         </div>

         <button onClick={handleZoomOut} className="p-1 hover:bg-slate-700 rounded"><ZoomOut size={14} /></button>
         <button onClick={handleZoomIn} className="p-1 hover:bg-slate-700 rounded"><ZoomIn size={14} /></button>
      </div>
    </div>
  );
};

export default EditorStatusBar;