import React, { useCallback, useRef, useState } from 'react';
import { X, Upload, FileText, FileUp } from 'lucide-react';

interface ImportPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File) => void;
}

export const ImportPlanModal: React.FC<ImportPlanModalProps> = ({ isOpen, onClose, onImport }) => {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onImport(e.dataTransfer.files[0]);
    }
  }, [onImport]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onImport(e.target.files[0]);
    }
  }, [onImport]);

  const onButtonClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[400px] flex flex-col text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-base">Importar Planta</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center">
          <form
            id="form-file-upload"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onSubmit={(e) => e.preventDefault()}
            className={`w-full border-2 border-dashed rounded-lg p-6 text-center transition-colors
              ${dragActive ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600 bg-slate-700/30'}`}
          >
            <input
              ref={inputRef}
              type="file"
              id="file-upload-input"
              multiple={false}
              onChange={handleChange}
              className="hidden"
              accept=".pdf,.svg"
            />
            <label
              htmlFor="file-upload-input"
              className="flex flex-col items-center justify-center cursor-pointer space-y-2"
            >
              <FileUp size={48} className="text-slate-400" />
              <p className="text-sm text-slate-300">
                Arraste e solte o arquivo aqui, ou{' '}
                <span className="text-blue-400 font-medium hover:underline" onClick={onButtonClick}>
                  clique para procurar
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Formatos suportados: PDF, SVG
              </p>
            </label>
          </form>
        </div>

        <div className="px-4 py-3 border-t border-slate-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-300"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};