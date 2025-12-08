import React, { useState, useEffect } from 'react';

interface RadiusInputModalProps {
  initialRadius: number;
  position: { x: number; y: number };
  onConfirm: (radius: number) => void;
  onCancel: () => void;
}

const RadiusInputModal: React.FC<RadiusInputModalProps> = ({ initialRadius, position, onConfirm, onCancel }) => {
  const [radius, setRadius] = useState(initialRadius);

  useEffect(() => {
    // Auto-focus logic could go here if we had a ref
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onConfirm(radius);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="fixed z-[100] bg-white border border-slate-300 shadow-xl rounded-md p-2 flex flex-col gap-2 w-48"
      style={{ left: position.x, top: position.y }}
    >
      <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1">
        <span className="text-xs font-bold text-slate-700 uppercase">Definir Raio</span>
      </div>
      <div className="flex items-center gap-2">
         <span className="text-xs text-slate-500">R:</span>
         <input
            type="number"
            autoFocus
            value={Math.round(radius)}
            onChange={(e) => setRadius(parseFloat(e.target.value))}
            onKeyDown={handleKeyDown}
            className="flex-grow border border-slate-200 rounded px-1 py-0.5 text-sm"
         />
         <span className="text-xs text-slate-400">px</span>
      </div>
      <div className="flex justify-end gap-2 mt-1">
          <button onClick={onCancel} className="px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded">Cancelar</button>
          <button onClick={() => onConfirm(radius)} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">OK</button>
      </div>
    </div>
  );
};

export default RadiusInputModal;
