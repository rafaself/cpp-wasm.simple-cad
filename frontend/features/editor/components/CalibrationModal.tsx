import React, { useState } from 'react';
import NumberSpinner from '../../../components/NumberSpinner';

interface CalibrationModalProps {
  isOpen: boolean;
  currentDistancePx: number;
  onConfirm: (realDistanceCm: number) => void;
  onCancel: () => void;
}

const CalibrationModal: React.FC<CalibrationModalProps> = ({ isOpen, currentDistancePx, onConfirm, onCancel }) => {
  const [distanceCm, setDistanceCm] = useState(100);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-4 flex flex-col gap-4 text-slate-100 min-w-[300px]">
        <h3 className="font-semibold text-lg">Calibrar Escala</h3>
        <p className="text-sm text-slate-400">
          A distância selecionada é de <span className="font-mono text-white">{currentDistancePx.toFixed(1)}px</span>.
          <br />
          Qual é o tamanho real desta medida?
        </p>

        <div className="flex items-center gap-2">
          <NumberSpinner
            value={distanceCm}
            onChange={setDistanceCm}
            min={1}
            max={10000}
            className="flex-1 bg-slate-700 h-9"
          />
          <span className="text-sm font-medium">cm</span>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm bg-slate-700 hover:bg-slate-600 text-slate-300"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(distanceCm)}
            className="px-3 py-1.5 rounded text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalibrationModal;
