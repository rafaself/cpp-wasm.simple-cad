import { useState, useCallback } from 'react';
import { useUIStore } from '../../stores/useUIStore';
import { useDataStore } from '../../stores/useDataStore';
import { useEditorLogic } from '../editor/hooks/useEditorLogic';
import { NormalizedViewBox, Shape } from '../../types';
import * as pdfjs from 'pdfjs-dist';
import { convertPdfPageToShapes } from './utils/pdfToShapes';
import { generateId } from '../../utils/uuid';
import DxfWorker from './utils/dxf/dxfWorker?worker';
import { DxfColorScheme } from './utils/dxf/colorScheme';
import { LayerNameConflictPolicy, mapImportedLayerNames } from './utils/layerNameCollision';

// Configure PDF.js worker source using CDN to avoid local build issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PlanImportResult {
  shapes: Shape[];
  originalWidth: number;
  originalHeight: number;
}

interface ImportOptions {
  explodeBlocks?: boolean;
  maintainLayers?: boolean;
  layerNameConflictPolicy?: LayerNameConflictPolicy;
  readOnly?: boolean;
  importMode?: 'shapes' | 'svg';
  colorScheme?: DxfColorScheme;
  customColor?: string;
  sourceUnits?: 'auto' | 'meters' | 'cm' | 'mm' | 'feet' | 'inches';
}

interface PlanImportHook {
  openImportPdfModal: () => void;
  openImportDxfModal: () => void;
  closeImportModal: () => void;
  handleFileImport: (file: File, options?: ImportOptions) => Promise<void>;
  isImportModalOpen: boolean;
  isLoading: boolean;
  importMode: 'pdf' | 'dxf';
}

export const usePlanImport = (): PlanImportHook => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [importMode, setImportMode] = useState<'pdf' | 'dxf'>('pdf');
  const uiStore = useUIStore();
  const dataStore = useDataStore();
  const { zoomToFit } = useEditorLogic();

  const openImportPdfModal = useCallback(() => {
    setImportMode('pdf');
    setIsImportModalOpen(true);
  }, []);

  const openImportDxfModal = useCallback(() => {
    setImportMode('dxf');
    setIsImportModalOpen(true);
  }, []);

  const closeImportModal = useCallback(() => setIsImportModalOpen(false), []);

  const processFile = useCallback(async (
    file: File,
    params?: { targetLayerId?: string; options?: ImportOptions }
  ): Promise<PlanImportResult | null> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const fileContent = e.target?.result;
          let svgString: string = '';
          let viewBox: NormalizedViewBox = { x: 0, y: 0, width: 1000, height: 1000 };
          let originalWidth = 1000;
          let originalHeight = 1000;
          const targetLayerId = params?.targetLayerId ?? dataStore.activeLayerId;
          const importAs = params?.options?.importMode ?? 'shapes';

          if (file.type === 'application/pdf') {
            const pdfData = new Uint8Array(fileContent as ArrayBuffer);
            const loadingTask = pdfjs.getDocument({ data: pdfData });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);

            const viewport = page.getViewport({ scale: 1.0 });
            originalWidth = viewport.width;
            originalHeight = viewport.height;

            if (importAs === 'shapes') {
              const vectorShapes = await convertPdfPageToShapes(
                  page, 
                  uiStore.activeFloorId || 'default', 
                  targetLayerId,
                  {
                    colorScheme: params?.options?.colorScheme,
                    customColor: params?.options?.customColor,
                  }
              );

              if (vectorShapes.length > 0) {
                   resolve({ shapes: vectorShapes, originalWidth, originalHeight });
                   return;
              }
            }

            console.warn("No vector shapes found, falling back to raster import.");
            const canvas = document.createElement('canvas');
            const canvasContext = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (canvasContext) {
              await page.render({ canvasContext, viewport }).promise;
              const pngDataUrl = canvas.toDataURL('image/png');
              
              svgString = `<svg width="${originalWidth}" height="${originalHeight}" viewBox="0 0 ${originalWidth} ${originalHeight}" xmlns="http://www.w3.org/2000/svg">
                             <image href="${pngDataUrl}" x="0" y="0" width="${originalWidth}" height="${originalHeight}"/>
                           </svg>`;
              viewBox = { x: 0, y: 0, width: originalWidth, height: originalHeight };
            } else {
              throw new Error("Could not get 2D canvas context.");
            }

          } else if (file.type === 'image/svg+xml') {
            const decoder = new TextDecoder('utf-8');
            svgString = decoder.decode(fileContent as ArrayBuffer);
            
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
            const svgElement = svgDoc.documentElement;

            const vb = svgElement.getAttribute('viewBox');
            if (vb) {
              const parts = vb.split(' ').map(Number);
              if (parts.length === 4 && !parts.some(isNaN)) {
                viewBox = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
                originalWidth = parts[2];
                originalHeight = parts[3];
              }
            } else {
                originalWidth = Number(svgElement.getAttribute('width')) || 1000;
                originalHeight = Number(svgElement.getAttribute('height')) || 1000;
                viewBox = { x: 0, y: 0, width: originalWidth, height: originalHeight };
            }

          } else {
            throw new Error(`Unsupported file type: ${file.type}`);
          }

          const newShapeId = generateId('plan');
          const newShape: Shape = {
            id: newShapeId,
            layerId: targetLayerId,
            type: 'rect',
            x: 0,
            y: 0,
            points: [],
            width: originalWidth,
            height: originalHeight,
            strokeColor: 'transparent',
            strokeWidth: 0,
            strokeEnabled: false,
            fillColor: 'transparent',
            colorMode: { fill: 'custom', stroke: 'custom' },
            svgRaw: svgString,
            svgViewBox: viewBox,
            discipline: 'architecture',
            floorId: uiStore.activeFloorId,
          };

          resolve({ shapes: [newShape], originalWidth, originalHeight });

        } catch (error) {
          console.error("Error processing file:", error);
          reject(error);
        }
      };
      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        reject(error);
      };
      reader.readAsArrayBuffer(file);
    });
  }, [dataStore, uiStore]);

  const handleFileImport = useCallback(async (file: File, options?: ImportOptions) => {
    setIsLoading(true);
    try {
      if (importMode === 'dxf') {
          // DXF Handling
          const isDwg = file.name.toLowerCase().endsWith('.dwg');
          const isDxf = file.name.toLowerCase().endsWith('.dxf');

          if (isDwg) {
             throw new Error("Formato não suportado diretamente. Por favor, utilize um arquivo DXF (recomendado: versão AutoCAD 2000 ASCII).");
          }
          if (!isDxf) {
             throw new Error("Por favor, selecione um arquivo .DXF válido.");
          }

          const MAX_SIZE = 50 * 1024 * 1024; // 50MB
          if (file.size > MAX_SIZE) {
              throw new Error("Arquivo muito grande. O limite é 50MB.");
          }

          const buffer = await file.arrayBuffer();
          let text: string;

          try {
              const decoder = new TextDecoder('utf-8', { fatal: true });
              text = decoder.decode(buffer);
          } catch (e) {
              console.warn("UTF-8 decoding failed, falling back to Windows-1252", e);
              const decoder = new TextDecoder('windows-1252');
              text = decoder.decode(buffer);
          }

          const workerData = await new Promise<any>((resolve, reject) => {
              const worker = new DxfWorker();
              worker.onmessage = (e) => {
                  if (e.data.success) resolve(e.data.data);
                  else reject(new Error(e.data.error || 'Erro no processamento do DXF'));
                  worker.terminate();
              };
              worker.onerror = (err) => {
                  reject(err);
                  worker.terminate();
              };
                worker.postMessage({
                    text,
                    mode: options?.importMode || 'shapes',
                    options: {
                        floorId: uiStore.activeFloorId || 'default',
                        defaultLayerId: dataStore.activeLayerId,
                        explodeBlocks: true,
                        colorScheme: options?.colorScheme,
                        customColor: options?.customColor,
                        readOnly: options?.readOnly,
                        sourceUnits: options?.sourceUnits || 'auto'
                    }
                });
          });

          let shapesToAdd = workerData.shapes;
          const newLayers = workerData.layers;

          // Always import the DXF layers into the project (as requested), but only
          // assign imported shapes to those layers when maintainLayers is enabled.
          const layerMap = new Map<string, string>();

          if (newLayers && newLayers.length > 0) {
              const existingLayerNames = dataStore.layers.map((l) => l.name);
              const policy: LayerNameConflictPolicy = options?.layerNameConflictPolicy ?? 'merge';
              const { mapping: nameMap } = mapImportedLayerNames({
                  importedNames: newLayers.map((l: any) => l.name),
                  existingNames: existingLayerNames,
                  policy
              });

              newLayers.forEach((l: any) => {
                  const targetName = nameMap.get(l.name) ?? l.name;
                  const storeId = dataStore.ensureLayer(targetName, {
                      strokeColor: l.strokeColor,
                      strokeEnabled: l.strokeEnabled,
                      fillColor: l.fillColor,
                      fillEnabled: l.fillEnabled,
                      visible: l.visible,
                      locked: l.locked
                  });
                  layerMap.set(l.id, storeId);
              });
          }

          if (options?.maintainLayers && options?.importMode !== 'svg') {
              shapesToAdd = shapesToAdd.map((s: any) => ({
                  ...s,
                  layerId: layerMap.get(s.layerId) || dataStore.activeLayerId
              }));
          }

          console.log(`Imported ${shapesToAdd.length} shapes from DXF (Mode: ${options?.importMode})`);
          dataStore.addShapes(shapesToAdd);
          uiStore.setSelectedShapeIds(new Set(shapesToAdd.map(s => s.id)));
          uiStore.setTool('select');
          
          // Center content after import
          // We use a slightly longer timeout and requestAnimationFrame to ensure
          // the modal has started closing and layout has updated.
          setTimeout(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => zoomToFit());
            });
          }, 150);

          closeImportModal();
          return;
      }

      if (importMode === 'pdf') {
          if (file.type !== 'application/pdf' && file.type !== 'image/svg+xml') {
              throw new Error("Por favor, selecione um arquivo PDF ou SVG.");
          }
      }

      let targetLayerId = dataStore.activeLayerId;
      if (importMode === 'pdf' && file.type === 'application/pdf') {
        const baseName = `PDF - ${file.name.replace(/\\.[^/.]+$/i, '')}`;
        const existingNames = dataStore.layers.map((l) => l.name);
        const { mapping } = mapImportedLayerNames({
          importedNames: [baseName],
          existingNames,
          policy: 'createUnique',
        });
        const layerName = mapping.get(baseName) ?? baseName;
        targetLayerId = dataStore.ensureLayer(layerName, {
          strokeColor: '#000000',
          strokeEnabled: true,
          fillColor: 'transparent',
          fillEnabled: false,
          visible: true,
          locked: false,
        });
      }

      const result = await processFile(file, { targetLayerId, options });
      if (result && result.shapes.length > 0) {
        console.log(`Importing ${result.shapes.length} shapes.`);
        dataStore.addShapes(result.shapes);
        uiStore.setSelectedShapeIds(new Set(result.shapes.map(s => s.id)));
        uiStore.setTool('select');
        
        // Center content after import
        setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => zoomToFit());
          });
        }, 150);
      }
      closeImportModal();
    } catch (error) {
      alert(`Erro ao importar arquivo: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [processFile, dataStore, closeImportModal, importMode, uiStore]);

  return {
    isImportModalOpen,
    isLoading,
    importMode,
    openImportPdfModal,
    openImportDxfModal,
    closeImportModal,
    handleFileImport,
  };
};
