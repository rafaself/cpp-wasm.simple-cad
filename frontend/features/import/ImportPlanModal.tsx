import React, { useCallback, useRef, useState } from 'react';
import { X, FileUp } from 'lucide-react';

interface ImportOptions {
  explodeBlocks: boolean;
  maintainLayers: boolean;
  grayscale?: boolean;
  readOnly?: boolean;
}

interface ImportPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (file: File, options?: ImportOptions) => void;
  mode?: 'pdf' | 'image' | 'dxf';
  title?: string;
  accept?: string;
}

export const ImportPlanModal: React.FC<ImportPlanModalProps> = ({ 
  isOpen, 
  onClose, 
  onImport, 
  mode = 'pdf',
  title = "Importar Planta",
  accept = ".pdf,.svg"
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [options, setOptions] = useState<ImportOptions>({
    explodeBlocks: true,
    maintainLayers: true,
    grayscale: false,
    readOnly: true
  });

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
      onImport(e.dataTransfer.files[0], options);
    }
  }, [onImport, options]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      onImport(e.target.files[0], options);
    }
  }, [onImport, options]);

  const onButtonClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[400px] flex flex-col text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-base">{title}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 flex flex-col items-center gap-4">
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
              accept={accept}
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
                Formatos suportados: {accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')}
              </p>
            </label>
          </form>

          {/* DXF Specific Options */}
          {mode === 'dxf' && (
            <div className="w-full flex flex-col gap-2 bg-slate-700/30 p-3 rounded text-sm text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.maintainLayers}
                  onChange={e => setOptions(o => ({...o, maintainLayers: e.target.checked}))}
                  className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
                />
                Manter Layers do arquivo
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.grayscale}
                  onChange={e => setOptions(o => ({...o, grayscale: e.target.checked}))}
                  className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
                />
                Importar em Tons de Cinza
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.readOnly}
                  onChange={e => setOptions(o => ({...o, readOnly: e.target.checked}))}
                  className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
                />
                Importar como Referência (Read-only)
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none opacity-75" title="Sempre ativo para renderização correta atualmente">
                <input
                  type="checkbox"
                  checked={options.explodeBlocks}
                  readOnly
                  disabled
                  className="rounded border-slate-500 bg-slate-700 text-blue-500 focus:ring-blue-500/50"
                />
                Explodir Blocos (obrigatório)
              </label>
            </div>
          )}
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
