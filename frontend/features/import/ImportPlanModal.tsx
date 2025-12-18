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
  { id: 'original', label: 'Cores originais', description: 'Mantém as cores definidas no arquivo DXF.' },
  { id: 'fixedGray153', label: 'Cinza (153,153,153)', description: 'Aplica um cinza neutro (#999999) para toda a geometria.', swatch: '#999999' },
  { id: 'grayscale', label: 'Tons de cinza', description: 'Converte cada cor para tons de cinza mantendo a luminância relativa.' },
  { id: 'custom', label: 'Escolher cor', description: 'Define uma única cor personalizada para todos os elementos.', swatch: '#000000' }
];

interface ImportPlanModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onImport: (file: File, options?: ImportOptions) => void;
  mode?: 'pdf' | 'image' | 'dxf';
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
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  
  const [options, setOptions] = useState<ImportOptions>({
    explodeBlocks: true,
    maintainLayers: true,
    readOnly: false,
    importMode: 'svg',
    colorScheme: 'original',
    customColor: '#000000',
    layerNameConflictPolicy: 'merge',
    sourceUnits: 'auto'
  });
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
    }
  }, [isOpen]);

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
        className="h-full"
        contentClassName="flex flex-col overflow-hidden"
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
        {/* Fixed Area: Header and File Selector */}
        <div className="flex flex-col gap-5 pt-1 shrink-0">
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

          {/* PDF/Image info for consistency (Only when not in DXF mode) */}
          {mode !== 'dxf' && !selectedFile && (
            <div className="flex flex-col gap-3 py-2">
               <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-slate-800/30 p-3 rounded-lg border border-slate-700/50">
                  <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
                  <p>O arquivo será importado para o andar ativo. Após a importação, você poderá ajustar a escala e posição manualmente.</p>
               </div>
            </div>
          )}

          {/* DXF Advanced Toggle (Fixed) */}
          {mode === 'dxf' && (
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

        {/* Dynamic/Scrollable Area: DXF Options */}
        {mode === 'dxf' && (
          <div className={`grid transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] flex-grow min-h-0 ${advancedOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0 mt-0 pointer-events-none'}`}>
            <div className="overflow-hidden flex flex-col min-h-0">
              {/* Outer Container with Border and Background */}
              <div className="flex flex-col rounded-xl bg-slate-800/30 border border-slate-600/60 flex-grow min-h-0 overflow-hidden">
                {/* Inner Scrollable Area - Isolated from the border */}
                <div className="flex flex-col gap-6 py-4 px-4 overflow-y-auto custom-scrollbar flex-grow min-h-0">
                  
                  {/* Primary Option: Import Mode */}
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Qualidade da Importação</label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setOptions(o => ({...o, importMode: 'svg'}))}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-200 ${
                            options.importMode === 'svg'
                            ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_15px_-5px_rgba(59,130,246,0.3)]'
                            : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className={`mt-0.5 p-1.5 rounded ${options.importMode === 'svg' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                          <Home size={16} />
                        </div>
                        <div>
                          <div className={`text-sm font-semibold ${options.importMode === 'svg' ? 'text-blue-100' : 'text-slate-300'}`}>Planta de Referência</div>
                          <div className="text-[11px] text-slate-500 leading-tight mt-0.5">Modo de <strong>alta performance</strong>. O desenho é importado como uma referência visual única, garantindo fluidez total em arquivos grandes e complexos.</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setOptions(o => ({...o, importMode: 'shapes'}))}
                        className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all duration-200 ${
                            options.importMode === 'shapes'
                            ? 'bg-blue-600/10 border-blue-500 shadow-[0_0_15px_-5px_rgba(59,130,246,0.3)]'
                            : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className={`mt-0.5 p-1.5 rounded ${options.importMode === 'shapes' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                          <Layers size={16} />
                        </div>
                        <div>
                          <div className={`text-sm font-semibold ${options.importMode === 'shapes' ? 'text-blue-100' : 'text-slate-300'}`}>Geometria Editável</div>
                          <div className="text-[11px] text-slate-500 leading-tight mt-0.5">Importa cada linha e arco como um elemento individual. Recomendado para pequenas correções e medições precisas.</div>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Unit Selection */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 leading-none">
                      Unidade do Arquivo
                      <div title="Define como a escala do arquivo original será interpretada.">
                        <Info size={10} />
                      </div>
                    </label>
                    <select
                      value={options.sourceUnits || 'auto'}
                      onChange={e => setOptions(o => ({...o, sourceUnits: e.target.value as any}))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500 transition-all cursor-pointer"
                    >
                      <option value="auto">Auto-detectar (Recomendado)</option>
                      <option value="meters">Metros (m)</option>
                      <option value="cm">Centímetros (cm)</option>
                      <option value="mm">Milímetros (mm)</option>
                      <option value="inches">Polegadas (in)</option>
                      <option value="feet">Pés (ft)</option>
                    </select>
                    <p className="text-[10px] text-slate-500 italic">
                      {options.sourceUnits === 'auto' 
                        ? "O sistema identificará a unidade ideal baseada nos metadados do arquivo original."
                        : "Forçar a interpretação da escala para a unidade selecionada."}
                    </p>
                  </div>

                  {/* Color Schemes */}
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Esquema de Cores</label>
                    <div className="grid grid-cols-2 gap-2">
                      {DXF_COLOR_SCHEMES.map((scheme) => (
                        <button
                          key={scheme.id}
                          type="button"
                          onClick={() => {
                            setOptions(o => ({ ...o, colorScheme: scheme.id }));
                            if (scheme.id !== 'custom') closeColorPicker();
                          }}
                          className={`flex flex-col gap-1 p-3 rounded-lg border text-left transition-all duration-200 ${
                            options.colorScheme === scheme.id
                              ? 'bg-slate-700 border-slate-500 text-blue-200 shadow-[0_0_15px_-5px_rgba(59,130,246,0.3)]'
                              : 'bg-slate-800/70 border-slate-700 hover:border-slate-600 hover:text-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wide">{scheme.label}</span>
                            {(scheme.swatch || scheme.id === 'custom') && (
                              <span
                                className="w-3 h-3 rounded border border-slate-500"
                                style={{
                                  background: scheme.id === 'custom'
                                    ? options.customColor ?? '#000000'
                                    : scheme.swatch
                                }}
                              />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {activeColorScheme.description}
                    </p>
                    {options.colorScheme === 'custom' && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          className="flex items-center gap-2 py-1.5 px-3 rounded-full border border-slate-600 bg-slate-900/80 text-[11px] font-semibold text-slate-100"
                          onClick={openColorPicker}
                          ref={customColorButtonRef}
                        >
                          <span
                            className="w-4 h-4 rounded border border-slate-500 shadow-inner"
                            style={{ backgroundColor: options.customColor || '#000000' }}
                          />
                          Escolher cor
                        </button>
                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">
                          Aplicada em todos os elementos
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Structure Options */}
                  <div className="flex flex-col gap-3 pt-4 border-t border-slate-700/50">
                    <label className="flex items-center gap-2.5 cursor-pointer group select-none">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={options.maintainLayers}
                          onChange={e => setOptions(o => ({...o, maintainLayers: e.target.checked}))}
                          className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500/20 focus:ring-offset-0 transition-all border"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] text-slate-300 group-hover:text-slate-100 transition-colors font-medium">Aplicar camadas do DXF aos elementos importados</span>
                        <span className="text-[9px] text-slate-500 uppercase tracking-tighter">As camadas do DXF sempre serAœo criadas no projeto; esta opA§A£o controla apenas em qual camada os elementos vA£o cair</span>
                      </div>
                    </label>

                    {mode === 'dxf' && (
                      <div className="flex flex-col gap-2 pl-6">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Conflito de nomes de camadas</span>
                          {isAnalyzingDxfLayers && (
                            <span className="text-[10px] text-slate-500 uppercase tracking-wide">Analisando...</span>
                          )}
                        </div>

                        {dxfLayerAnalysisError && (
                          <div className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                            NA£o foi possA­vel analisar as camadas do DXF: {dxfLayerAnalysisError}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setOptions(o => ({ ...o, layerNameConflictPolicy: 'merge' }))}
                            className={`text-left px-3 py-2 rounded border text-[11px] transition-colors ${
                              (options.layerNameConflictPolicy ?? 'merge') === 'merge'
                                ? 'bg-slate-700 border-slate-500 text-blue-200'
                                : 'bg-slate-800/70 border-slate-700 hover:border-slate-600 text-slate-200'
                            }`}
                          >
                            <div className="font-semibold">Reutilizar existente</div>
                            <div className="text-[10px] text-slate-400">PadrA£o CAD: se `C1` jA¡ existir, usa `C1` e mantA©m o estilo do projeto</div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setOptions(o => ({ ...o, layerNameConflictPolicy: 'createUnique' }))}
                            className={`text-left px-3 py-2 rounded border text-[11px] transition-colors ${
                              (options.layerNameConflictPolicy ?? 'merge') === 'createUnique'
                                ? 'bg-slate-700 border-slate-500 text-blue-200'
                                : 'bg-slate-800/70 border-slate-700 hover:border-slate-600 text-slate-200'
                            }`}
                          >
                            <div className="font-semibold">Criar nova (1), (2)...</div>
                            <div className="text-[10px] text-slate-400">Evita heranA§a silenciosa entre imports com nomes repetidos</div>
                          </button>
                        </div>

                        {dxfLayerCollisionInfo && dxfLayerCollisionInfo.conflicts.length > 0 && (
                          <div className="text-[10px] text-slate-300 bg-slate-900/50 border border-slate-700 rounded px-2 py-1">
                            Conflitos detectados: {dxfLayerCollisionInfo.conflicts.slice(0, 6).join(', ')}
                            {dxfLayerCollisionInfo.conflicts.length > 6 ? '...' : ''}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <label className="flex items-center gap-2.5 cursor-pointer group select-none">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={options.readOnly}
                          onChange={e => setOptions(o => ({...o, readOnly: e.target.checked}))}
                          className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-blue-500/20 focus:ring-offset-0 transition-all border"
                        />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] text-slate-300 group-hover:text-slate-100 transition-colors font-medium">Bloquear edição (Apenas Leitura)</span>
                        <span className="text-[9px] text-slate-500 uppercase tracking-tighter">Evita alterações acidentais na planta base</span>
                      </div>
                    </label>
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
