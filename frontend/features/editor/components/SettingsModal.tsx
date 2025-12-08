import React, { useState } from 'react';
import { useAppStore } from '../../../stores/useAppStore';
import { X } from 'lucide-react';
import ColorPicker from '../../../components/ColorPicker';

const SettingsModal: React.FC = () => {
  const store = useAppStore();
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerPos, setColorPickerPos] = useState({ top: 0, left: 0 });

  const openColorPicker = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setColorPickerPos({ top: rect.bottom + 5, left: rect.left - 100 });
    setShowColorPicker(true);
  };

  if (!store.isSettingsModalOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-enter">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-80 text-slate-100 dialog-enter">
        <div className="flex items-center justify-between p-3 border-b border-slate-700">
          <h2 className="font-semibold text-sm uppercase tracking-wide">Configurações</h2>
          <button 
            onClick={() => store.setSettingsModalOpen(false)}
            className="text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="p-4 flex flex-col gap-4">
          
          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400 font-bold uppercase">Tamanho da Grade (px)</label>
            <div className="flex items-center gap-2">
                <input 
                    type="range" 
                    min="10" 
                    max="200" 
                    step="10" 
                    value={store.gridSize} 
                    onChange={(e) => store.setGridSize(parseInt(e.target.value))}
                    className="flex-grow h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <span className="text-sm font-mono w-10 text-right">{store.gridSize}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-slate-400 font-bold uppercase">Cor da Grade</label>
            <div className="flex items-center gap-2 bg-slate-900 p-2 rounded border border-slate-700">
                <div 
                    className="w-8 h-8 rounded border border-slate-600 cursor-pointer hover:scale-105 transition-transform"
                    style={{ backgroundColor: store.gridColor }}
                    onClick={openColorPicker}
                />
                <span className="text-xs font-mono text-slate-400">{store.gridColor}</span>
            </div>
          </div>

        </div>

        <div className="p-3 border-t border-slate-700 flex justify-end">
            <button 
                onClick={() => store.setSettingsModalOpen(false)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded text-sm font-medium"
            >
                Concluir
            </button>
        </div>
      </div>

      {/* Color Picker Popup */}
      {showColorPicker && (
        <>
          <div className="fixed inset-0 z-[110]" onClick={() => setShowColorPicker(false)} />
          <ColorPicker 
            color={store.gridColor}
            onChange={(c) => store.setGridColor(c)}
            onClose={() => setShowColorPicker(false)}
            initialPosition={colorPickerPos}
          />
        </>
      )}
    </div>
  );
};

export default SettingsModal;
