import React, { useCallback, useRef, useState, useEffect } from 'react';
import { FileUp, Home, Layers, ChevronDown, ChevronUp, Info, Settings2, CheckCircle2 } from 'lucide-react';
import Dialog, { DialogCard, DialogButton } from '@/components/ui/Dialog';
import ColorPicker from '../../components/ColorPicker';
import { DxfColorScheme } from './utils/dxf/colorScheme';
import DxfWorker from './utils/dxf/dxfWorker?worker';
import { useDataStore } from '../../stores/useDataStore';
import { LayerNameConflictPolicy, mapImportedLayerNames } from './utils/layerNameCollision';

export interface ImportOptions {
  explodeBlocks: boolean;
  maintainLayers: boolean;
  layerNameConflictPolicy?: LayerNameConflictPolicy;
  readOnly?: boolean;
  importMode?: 'shapes' | 'svg';
  colorScheme?: DxfColorScheme;
  customColor?: string;
  sourceUnits?: 'auto' | 'meters' | 'cm' | 'mm' | 'feet' | 'inches';
}

const DXF_COLOR_SCHEMES: Array<{ id: DxfColorScheme; label: string; description: string; swatch?: string }> = [
  { id: 'fixedGray153', label: 'Cinza', description: 'Aplica um cinza neutro (#999999) para toda a geometria.', swatch: '#999999' },
  { id: 'original', label: 'Cores originais', description: 'Mantém as cores definidas no arquivo DXF.', swatch: 'conic-gradient(from 0deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' },
  { id: 'grayscale', label: 'Tons de cinza', description: 'Converte cada cor para tons de cinza mantendo a luminância relativa.', swatch: 'linear-gradient(135deg, #ffffff 0%, #64748b 100%)' },
  { id: 'custom', label: 'Escolher cor', description: 'Define uma única cor personalizada para todos os elementos.', swatch: '#000000' }
];

interface ImportPlanModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onImport: (file: File, options?: ImportOptions) => void;
  mode?: 'pdf' | 'dxf';
  title?: string;
  accept?: string;
}

export const ImportPlanModal: React.FC<ImportPlanModalProps> = ({ 
  isOpen, 
  isLoading = false,
  onClose, 
  onImport, 
  mode = 'pdf',
  title = "Importar Planta",
  accept = ".pdf,.svg"
}) => {
  const DEFAULT_OPTIONS_DXF: ImportOptions = {
    explodeBlocks: true,
    maintainLayers: true,
    readOnly: false,
    importMode: 'svg',
    colorScheme: 'fixedGray153',
    customColor: '#000000',
    layerNameConflictPolicy: 'merge',
    sourceUnits: 'auto',
  };

  const DEFAULT_OPTIONS_PDF: ImportOptions = {
    explodeBlocks: false,
    maintainLayers: false,
    readOnly: false,
    importMode: 'shapes',
    colorScheme: 'custom',
    customColor: '#000000',
    layerNameConflictPolicy: 'merge',
    sourceUnits: 'auto',
  };

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
  const [options, setOptions] = useState<ImportOptions>(() => (mode === 'dxf' ? DEFAULT_OPTIONS_DXF : DEFAULT_OPTIONS_PDF));
  const existingLayers = useDataStore((s) => s.layers);
  const [dxfLayerNames, setDxfLayerNames] = useState<string[] | null>(null);
  const [dxfLayerAnalysisError, setDxfLayerAnalysisError] = useState<string | null>(null);
  const [isAnalyzingDxfLayers, setIsAnalyzingDxfLayers] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [colorPickerAnchor, setColorPickerAnchor] = useState<{ top: number; left: number } | null>(null);
  const customColorButtonRef = useRef<HTMLButtonElement>(null);

  const openColorPicker = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const rect = customColorButtonRef.current?.getBoundingClientRect();
    if (rect) {
      setColorPickerAnchor({ top: rect.bottom + 8, left: rect.left });
    }
    setIsColorPickerOpen(true);
  };

  const closeColorPicker = () => {
    setIsColorPickerOpen(false);
    setColorPickerAnchor(null);
  };

  const inputRef = useRef<HTMLInputElement>(null);
  const activeColorScheme = DXF_COLOR_SCHEMES.find((scheme) => scheme.id === options.colorScheme) ?? DXF_COLOR_SCHEMES[0];

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null);
      setError(null);
      setAdvancedOpen(false);
      setDxfLayerNames(null);
      setDxfLayerAnalysisError(null);
      setIsAnalyzingDxfLayers(false);
      setOptions(mode === 'dxf' ? DEFAULT_OPTIONS_DXF : DEFAULT_OPTIONS_PDF);
    }
  }, [isOpen, mode]);

  // DXF-only: analyze layers after file selection so we can warn about name collisions.
  useEffect(() => {
    if (!isOpen) return;
    if (mode !== 'dxf') return;
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith('.dxf')) return;

    let cancelled = false;
    setIsAnalyzingDxfLayers(true);
    setDxfLayerAnalysisError(null);

    (async () => {
      try {
        const buffer = await selectedFile.arrayBuffer();
        let text: string;
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          text = decoder.decode(buffer);
        } catch {
          const decoder = new TextDecoder('windows-1252');
          text = decoder.decode(buffer);
        }

        const worker = new DxfWorker();
        const result = await new Promise<string[]>((resolve, reject) => {
          worker.onmessage = (e) => {
            const data = e.data as {
              success: boolean;
              data?: { kind?: string; layerNames?: string[] };
              error?: string;
            };
            if (data.success && data.data?.kind === 'analysis' && Array.isArray(data.data.layerNames)) {
              resolve(data.data.layerNames);
            }
            else reject(new Error(data.error || 'Falha ao analisar camadas do DXF'));
            worker.terminate();
          };
          worker.onerror = (err) => {
            reject(err);
            worker.terminate();
          };
          worker.postMessage({ text, task: 'analyzeLayers' });
        });

        if (cancelled) return;
        setDxfLayerNames(result);
      } catch (err) {
        if (cancelled) return;
        setDxfLayerAnalysisError(err instanceof Error ? err.message : String(err));
        setDxfLayerNames(null);
      } finally {
        if (!cancelled) setIsAnalyzingDxfLayers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, mode, selectedFile]);

  const dxfLayerCollisionInfo = (() => {
    if (mode !== 'dxf') return null;
    if (!dxfLayerNames) return null;
    const existingNames = existingLayers.map((l) => l.name);
    return mapImportedLayerNames({
      importedNames: dxfLayerNames,
      existingNames,
      policy: options.layerNameConflictPolicy ?? 'merge',
    });
  })();

  const validateFile = (file: File) => {
    const fileName = file.name.toLowerCase();
    if (mode === 'dxf' && (fileName.endsWith('.dwg') || fileName.endsWith('.dwf'))) {
      setError("O formato DWG/DWF não é suportado diretamente. Por favor, salve ou converta seu arquivo original para DXF (AutoCAD 2000 ASCII ou superior) antes de importar.");
      setSelectedFile(null);
      return false;
    }
    setError(null);
    return true;
  };

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
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    }
  }, [mode]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        setSelectedFile(file);
      }
    }
  }, [mode]);

  const onButtonClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleImportClick = () => {
    if (selectedFile) {
      onImport(selectedFile, options);
    }
  };

  return (
    <Dialog
      modelValue={isOpen}
      onUpdate={(val) => !val && onClose()}
      maxWidth="440px"
      showCloseButton
      zIndex={1200}
    >
      <DialogCard
        title={title}
        className="max-h-[85vh] flex flex-col"
        contentClassName="flex flex-col overflow-y-auto custom-scrollbar p-0"
        actions={
          <div className="flex gap-2 w-full justify-end">
            <DialogButton onClick={onClose} variant="secondary">
              Cancelar
            </DialogButton>
            <DialogButton 
              onClick={handleImportClick} 
              variant="primary"
              disabled={!selectedFile || isLoading}
            >
              {isLoading ? 'Processando...' : 'Importar'}
            </DialogButton>
          </div>
        }
      >
        <div className="flex flex-col px-6 py-4 gap-5">
          {/* File Selection Area */}
          <div className="flex flex-col gap-2">
            <form
              id="form-file-upload"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onSubmit={(e) => e.preventDefault()}
              className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-all relative group
                ${dragActive ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600 bg-slate-800/20 hover:border-slate-500 hover:bg-slate-800/40'}
                ${isLoading ? 'opacity-50 pointer-events-none' : ''}
                ${selectedFile ? 'border-emerald-500/50 bg-emerald-500/5' : ''}`}
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
              
              {!selectedFile && !error ? (
                <label
                  htmlFor="file-upload-input"
                  className="flex flex-col items-center justify-center cursor-pointer space-y-3"
                >
                  <div className="p-3 bg-slate-700/50 rounded-full text-slate-400 group-hover:text-blue-400 group-hover:bg-blue-500/10 transition-colors">
                    <FileUp size={32} />
                  </div>
                    <p className="text-sm text-slate-200 font-medium">
                      Arraste o arquivo ou <span className="text-blue-400 hover:underline">clique para procurar</span>
                    </p>
                    <div className="flex flex-col items-center gap-1">
                      <p className="text-xs text-slate-500 uppercase tracking-tight">
                        Formatos: {accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')}
                      </p>
                    </div>
                </label>
              ) : error ? (
                <div className="flex flex-col items-center justify-center space-y-3 p-2">
                  <div className="p-3 bg-amber-500/20 rounded-full text-amber-500">
                    <Info size={32} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-amber-200 font-semibold uppercase tracking-wider">Conversão Necessária</p>
                    <p className="text-xs text-slate-400 leading-relaxed max-w-[280px]">
                      {error}
                    </p>
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); setError(null); onButtonClick(); }}
                      className="text-[10px] text-blue-400 hover:text-blue-300 underline uppercase tracking-wider font-bold"
                    >
                      Tentar outro arquivo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 bg-emerald-500/20 rounded-full text-emerald-400">
                    <CheckCircle2 size={32} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-emerald-100 font-medium truncate max-w-[300px]">
                      {selectedFile?.name}
                    </p>
                    <button 
                      type="button" 
                      onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                      className="text-[10px] text-slate-400 hover:text-amber-500 underline uppercase tracking-wider"
                    >
                      Alterar arquivo
                    </button>
                  </div>
                </div>
              )}
              
              {/* Loading Overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/60 rounded-xl backdrop-blur-[2px] z-10">
                  <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <span className="text-xs font-semibold text-white tracking-widest uppercase">Processando Arquivo</span>
                </div>
              )}
            </form>
          </div>

          {/* PDF info for consistency (Only when not in DXF mode) */}
          {mode !== 'dxf' && !selectedFile && (
            <div className="flex flex-col gap-3 py-2">
               <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-800/30 p-3 rounded-lg border border-slate-700/50">
                  <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
                  <p>O arquivo será importado para o andar ativo. Após a importação, você poderá ajustar a escala e posição manualmente.</p>
               </div>
            </div>
          )}

          {/* Advanced Toggle */}
          {(mode === 'dxf' || mode === 'pdf') && (
            <div className="mt-1 pb-1">
              <button
                type="button"
                onClick={() => setAdvancedOpen(!advancedOpen)}
                className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors w-full group"
              >
                <Settings2 size={14} className={advancedOpen ? 'text-blue-400' : ''} />
                <span>Configurações Avançadas</span>
                <div className="h-px flex-grow bg-slate-700/30 group-hover:bg-slate-700/60 transition-colors" />
                {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
          )}
        </div>

        {/* Dynamic Area: Import Options */}
        {mode === 'pdf' && (
          <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${advancedOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
            <div className="overflow-hidden">
              <div className="flex flex-col rounded-xl bg-slate-800/30 border border-slate-600/60 overflow-hidden mx-6 mb-6">
                <div className="flex flex-col gap-6 py-4 px-4">
                  <div className="flex flex-col gap-3">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em] leading-none px-1">Tipo de Importação</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-900/40 border border-slate-700/60 rounded-xl p-2">
                      <button
                        type="button"
                        onClick={() => setOptions(o => ({ ...o, importMode: 'svg' }))}
                        className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
                          options.importMode === 'svg' ? 'bg-blue-500/10 border-blue-500/40' : 'bg-slate-800/30 border-slate-700/50 text-slate-500 hover:bg-slate-800/40'
                        }`}
                      >
                        <span className={`text-[12px] font-bold ${options.importMode === 'svg' ? 'text-blue-50' : 'text-slate-200'}`}>Planta de Referência</span>
                        <span className="text-[10px] opacity-70">Objeto único (SVG)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setOptions(o => ({ ...o, importMode: 'shapes' }))}
                        className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all ${
                          options.importMode === 'shapes' ? 'bg-blue-500/10 border-blue-500/40' : 'bg-slate-800/30 border-slate-700/50 text-slate-500 hover:bg-slate-800/40'
                        }`}
                      >
                        <span className={`text-[12px] font-bold ${options.importMode === 'shapes' ? 'text-blue-50' : 'text-slate-200'}`}>Geometria Editável</span>
                        <span className="text-[10px] opacity-70">Vetor em shapes</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <label className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em] leading-none px-1">Estilo e Cores</label>
                    <div className="flex flex-col bg-slate-900/40 border border-slate-700/60 rounded-xl overflow-hidden">
                      {DXF_COLOR_SCHEMES.map((scheme) => (
                        <button
                          key={scheme.id}
                          type="button"
                          onClick={() => setOptions(o => ({ ...o, colorScheme: scheme.id }))}
                          className={`flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                            options.colorScheme === scheme.id ? 'bg-slate-700/60' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full border border-slate-500/70 shrink-0"
                            style={{ background: scheme.swatch }}
                          />
                          <span className="flex flex-col">
                            <span className="text-[13px] font-bold text-slate-50">{scheme.label}</span>
                            <span className="text-[11px] text-slate-300/80 leading-snug">{scheme.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>

                    {activeColorScheme.id === 'custom' && (
                      <button
                        type="button"
                        ref={customColorButtonRef}
                        onClick={openColorPicker}
                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-700/60 bg-slate-900/40 hover:bg-slate-800/40 transition-colors"
                      >
                        <span className="text-[13px] font-bold text-slate-50">Cor personalizada</span>
                        <span className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-300/70">{options.customColor}</span>
                          <span className="w-5 h-5 rounded border border-slate-600" style={{ background: options.customColor }} />
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Area: DXF Options */}
        {mode === 'dxf' && (
          <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${advancedOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
            <div className="overflow-hidden">
              {/* Outer Container with Border and Background */}
              <div className="flex flex-col rounded-xl bg-slate-800/30 border border-slate-600/60 overflow-hidden mx-6 mb-6">
                {/* Inner Scrollable Area - Isolated from the border */}
                <div className="flex flex-col gap-6 py-4 px-4">
                  
                  {/* Primary Option: Import Mode */}
                  <div className="flex flex-col gap-6">
                    {/* --- SEÇÃO: CORES --- */}
                    <div className="flex flex-col gap-3">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em] leading-none px-1">Estilo e Cores</label>
                      <div className="flex flex-col bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden p-4 gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="text-[14px] font-bold text-slate-50 uppercase tracking-tight">Esquema de Cores</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {DXF_COLOR_SCHEMES.map((scheme) => (
                            <button
                              key={scheme.id}
                              type="button"
                              onClick={() => {
                                setOptions(o => ({ ...o, colorScheme: scheme.id }));
                                if (scheme.id !== 'custom') closeColorPicker();
                              }}
                              className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all duration-200 ${
                                options.colorScheme === scheme.id
                                  ? 'bg-blue-500/10 border-blue-500/50 text-blue-50 ring-1 ring-blue-500/20'
                                  : 'bg-slate-800/40 border-slate-700 hover:border-slate-600 hover:text-slate-100'
                              }`}
                            >
                              <div className="shrink-0 w-3 h-3 rounded-full border border-white/10 shadow-sm" style={{
                                background: scheme.id === 'custom' ? options.customColor ?? '#000000' : scheme.swatch
                              }} />
                              <span className="text-[12px] font-semibold truncate uppercase tracking-tight">{scheme.label}</span>
                            </button>
                          ))}
                        </div>
                        
                        <div className="text-[13px] text-slate-300 leading-relaxed">{activeColorScheme.description}</div>

                        {options.colorScheme === 'custom' && (
                          <div className="flex items-center gap-3 animate-in fade-in duration-300">
                            <button
                              type="button"
                              className="flex items-center gap-2.5 py-2 px-4 rounded-full border border-slate-600 bg-slate-800 hover:bg-slate-700/60 transition-all font-bold text-[11px] text-slate-100 shadow-sm"
                              onClick={openColorPicker}
                              ref={customColorButtonRef}
                            >
                              <div className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: options.customColor || '#000000' }} />
                              Escolher Cor Personalizada
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* --- SEÇÃO: QUALIDADE --- */}
                    <div className="flex flex-col gap-3">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em] leading-none px-1">Processamento e Qualidade</label>
                      <div className="flex flex-col bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden divide-y divide-slate-700/30">
                        {/* Planta de Referência */}
                        <button
                          type="button"
                          onClick={() => setOptions(o => ({...o, importMode: 'svg'}))}
                          className={`group flex items-start gap-4 p-4 text-left transition-all duration-300 ${
                              options.importMode === 'svg' ? 'bg-blue-500/10' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <div className={`mt-0.5 p-2 rounded-lg transition-all ${options.importMode === 'svg' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-700 text-slate-400'}`}>
                            <Home size={18} />
                          </div>
                          <div className="flex-grow">
                            <div className={`text-[14px] font-bold transition-colors ${options.importMode === 'svg' ? 'text-blue-50' : 'text-slate-50'}`}>Planta de Referência</div>
                            <div className="text-[13px] text-slate-300 leading-relaxed mt-1">
                              Foco em <strong>performance</strong>. O desenho é importado como uma referência visual única, ideal para plantas muito grandes ou complexas.
                            </div>
                          </div>
                          <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 transition-all ${
                            options.importMode === 'svg' ? 'border-blue-500 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'border-slate-600'
                          }`}>
                            {options.importMode === 'svg' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </button>

                        {/* Geometria Editável */}
                        <button
                          type="button"
                          onClick={() => setOptions(o => ({...o, importMode: 'shapes'}))}
                          className={`group flex items-start gap-4 p-4 text-left transition-all duration-300 ${
                              options.importMode === 'shapes' ? 'bg-blue-500/10' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <div className={`mt-0.5 p-2 rounded-lg transition-all ${options.importMode === 'shapes' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-slate-700 text-slate-400'}`}>
                            <Layers size={18} />
                          </div>
                          <div className="flex-grow">
                            <div className={`text-[14px] font-bold transition-colors ${options.importMode === 'shapes' ? 'text-blue-50' : 'text-slate-50'}`}>Geometria Editável</div>
                            <div className="text-[13px] text-slate-300 leading-relaxed mt-1">
                              Cada linha e arco torna-se um elemento <strong>individual e editável</strong>. Recomendado para medições precisas e pequenas alterações.
                            </div>
                          </div>
                          <div className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 transition-all ${
                            options.importMode === 'shapes' ? 'border-blue-500 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'border-slate-600'
                          }`}>
                            {options.importMode === 'shapes' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* --- SEÇÃO: UNIDADE --- */}
                    <div className="flex flex-col gap-3">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em] leading-none px-1">Configuração de Escala</label>
                      <div className="bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden p-4">
                        <div className="flex flex-col gap-3">
                          <div className="text-slate-50 font-bold text-[14px]">Unidade do Arquivo</div>
                          <div className="relative">
                            <select
                              value={options.sourceUnits || 'auto'}
                              onChange={e => setOptions(o => ({...o, sourceUnits: e.target.value as any}))}
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-3 pr-8 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500/50 cursor-pointer hover:border-slate-600 appearance-none transition-all font-medium"
                            >
                              <option value="auto">Auto-detectar</option>
                              <option value="meters">Metros (m)</option>
                              <option value="cm">Centímetros (cm)</option>
                              <option value="mm">Milímetros (mm)</option>
                              <option value="inches">Polegadas (in)</option>
                              <option value="feet">Pés (ft)</option>
                            </select>
                            <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
                          </div>
                          <div className="text-[13px] text-slate-300 leading-relaxed">
                            {options.sourceUnits === 'auto' 
                              ? "Auto-detectar: O sistema identifica a unidade ideal baseada nos metadados do arquivo."
                              : "Unidade personalizada: Força a escala do desenho para a unidade selecionada."}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* --- SEÇÃO: ESTRUTURA --- */}
                    <div className="flex flex-col gap-3">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-[0.15em] leading-none px-1">Estrutura e Organização</label>
                      <div className="flex flex-col bg-slate-900/40 border border-slate-700/50 rounded-xl overflow-hidden divide-y divide-slate-700/30">
                        {/* Maintain Layers */}
                        <div className="group flex flex-col p-4 transition-colors hover:bg-slate-800/20 gap-2">
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[14px] font-bold text-slate-50">Preservar Layers Originais</span>
                            <label className="premium-switch">
                              <input
                                type="checkbox"
                                checked={options.maintainLayers}
                                onChange={e => setOptions(o => ({...o, maintainLayers: e.target.checked}))}
                                className="premium-switch-input"
                              />
                              <div className="premium-switch-track">
                                <div className="premium-switch-handle" />
                              </div>
                            </label>
                          </div>
                          <span className="text-[13px] text-slate-300 group-hover:text-slate-200 leading-relaxed">
                            {options.maintainLayers 
                              ? "Mantém a organização de camadas original do arquivo DXF no projeto."
                              : "Ignora camadas originais e importa elementos para a camada ativa."}
                          </span>
                        </div>

                        {/* Layer Conflicts */}
                        {options.maintainLayers && mode === 'dxf' && (
                          <div className="flex flex-col gap-4 p-4 bg-slate-800/10 shadow-inner animate-in fade-in duration-300">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between text-[11px] uppercase tracking-widest text-slate-400 font-bold mb-1">
                                Conflito de Nomes
                                {isAnalyzingDxfLayers && <span className="text-blue-500 animate-pulse">Analisando DXF...</span>}
                              </div>
                              <div className="text-[13px] text-slate-300 mb-2">
                                {(options.layerNameConflictPolicy ?? 'merge') === 'merge'
                                  ? "Fundir: Reutiliza a camada existente se o nome for igual ao do DXF."
                                  : "Único: Cria uma nova camada (ex: Parede (1)) para evitar alterações na existente."}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setOptions(o => ({ ...o, layerNameConflictPolicy: 'merge' }))}
                                className={`flex flex-col gap-0.5 p-3 rounded-lg border text-left transition-all ${
                                  (options.layerNameConflictPolicy ?? 'merge') === 'merge' ? 'bg-slate-700 border-slate-500 shadow-sm' : 'bg-slate-800/30 border-slate-700/50 text-slate-500'
                                }`}
                              >
                                <span className={`text-[12px] font-bold ${ (options.layerNameConflictPolicy ?? 'merge') === 'merge' ? 'text-blue-50' : 'text-slate-400' }`}>Merge</span>
                                <span className="text-[10px] opacity-70">Fundir com existentes</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setOptions(o => ({ ...o, layerNameConflictPolicy: 'createUnique' }))}
                                className={`flex flex-col gap-0.5 p-3 rounded-lg border text-left transition-all ${
                                  (options.layerNameConflictPolicy ?? 'merge') === 'createUnique' ? 'bg-slate-700 border-slate-500 shadow-sm' : 'bg-slate-800/30 border-slate-700/50 text-slate-500'
                                }`}
                              >
                                <span className={`text-[12px] font-bold ${ (options.layerNameConflictPolicy ?? 'merge') === 'createUnique' ? 'text-blue-50' : 'text-slate-400' }`}>Único</span>
                                <span className="text-[10px] opacity-70">Criar nova separada</span>
                              </button>
                            </div>

                            {dxfLayerCollisionInfo && dxfLayerCollisionInfo.conflicts.length > 0 && (
                              <div className="flex items-start gap-2 bg-amber-900/10 border border-amber-500/20 p-2.5 rounded-lg text-[11px] text-amber-200/80">
                                <Info size={14} className="shrink-0 mt-0.5" />
                                <span><strong>{dxfLayerCollisionInfo.conflicts.length} conflitos encontrados:</strong> {dxfLayerCollisionInfo.conflicts.slice(0, 3).join(', ')}...</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Read Only Toggle */}
                        <div className="group flex flex-col p-4 transition-colors hover:bg-slate-800/20 gap-2">
                          <div className="flex items-center justify-between w-full">
                            <span className="text-[14px] font-bold text-slate-50">Trancar Edição</span>
                            <label className="premium-switch">
                              <input
                                type="checkbox"
                                checked={options.readOnly}
                                onChange={e => setOptions(o => ({...o, readOnly: e.target.checked}))}
                                className="premium-switch-input"
                              />
                              <div className="premium-switch-track">
                                <div className="premium-switch-handle" />
                              </div>
                            </label>
                          </div>
                          <span className="text-[13px] text-slate-300 group-hover:text-slate-200 leading-relaxed">
                            {options.readOnly 
                              ? "O desenho será importado como Apenas Leitura, evitando modificações acidentais."
                              : "O desenho será importado normalmente e poderá ser editado livremente."}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        </DialogCard>
        {isColorPickerOpen && (
          <>
            <div className="fixed inset-0 z-[110]" onClick={closeColorPicker} />
            <ColorPicker
              color={options.customColor || '#000000'}
              onChange={(color) => setOptions(o => ({ ...o, customColor: color }))}
              onClose={closeColorPicker}
              initialPosition={colorPickerAnchor ?? undefined}
            />
          </>
        )}
    </Dialog>
  );
};
