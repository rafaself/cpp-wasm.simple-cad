import React, { useState } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { Magnet, ZoomIn, ZoomOut, Target, CircleDot, Square, ChevronUp } from 'lucide-react';
import { SnapOptions } from '../../../types';

const EditorStatusBar: React.FC = () => {
  const store = useAppStore();
  const [showSnapMenu, setShowSnapMenu] = useState(false);

  const toggleSnap = () => store.setSnapOptions(prev => ({ ...prev, enabled: !prev.enabled }));
  const toggleOption = (key: keyof SnapOptions) => store.setSnapOptions(prev => ({ ...prev, [key]: !prev[key] }));

  const handleZoomIn = () => store.setViewTransform(prev => ({ ...prev, scale: Math.min(prev.scale * 1.2, 50) }));
  const handleZoomOut = () => store.setViewTransform(prev => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));

  return (
    <div className="w-full h-8 bg-slate-900 border-t border-slate-700 flex items-center justify-between px-4 text-xs text-slate-300 select-none z-50">
      <div className="w-40 font-mono">
        {store.mousePos ? `${store.mousePos.x.toFixed(2)}, ${store.mousePos.y.toFixed(2)}` : ''}
      </div>

      <div className="flex items-center gap-4">
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
                <div className="text-[10px] text-slate-500 uppercase mb-1 font-bold">Object Snap</div>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={store.snapOptions.endpoint} onChange={() => toggleOption('endpoint')} /> <Square size={12} /> Endpoint
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={store.snapOptions.midpoint} onChange={() => toggleOption('midpoint')} /> <Target size={12} /> Midpoint
                </label>
                <label className="flex items-center gap-2 hover:bg-slate-700 p-1 rounded cursor-pointer">
                  <input type="checkbox" checked={store.snapOptions.center} onChange={() => toggleOption('center')} /> <CircleDot size={12} /> Center
                </label>
             </div>
           )}
        </div>
      </div>

      <div className="flex items-center gap-2">
         <span>{(store.viewTransform.scale * 100).toFixed(0)}%</span>
         <button onClick={handleZoomOut} className="p-1 hover:bg-slate-700 rounded"><ZoomOut size={14} /></button>
         <button onClick={handleZoomIn} className="p-1 hover:bg-slate-700 rounded"><ZoomIn size={14} /></button>
      </div>
    </div>
  );
};

export default EditorStatusBar;
