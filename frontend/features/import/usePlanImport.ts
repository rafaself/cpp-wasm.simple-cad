import { useState, useCallback } from 'react';
import { useUIStore } from '../../stores/useUIStore';
import { useDataStore } from '../../stores/useDataStore';
import { NormalizedViewBox, Shape } from '../../types';
import * as pdfjs from 'pdfjs-dist/build/pdf';
import { convertPdfPageToShapes } from './utils/pdfToShapes';
import { generateId } from '../../utils/uuid';
import DxfWorker from './utils/dxf/dxfWorker?worker';
import { convertDxfToShapes } from './utils/dxf/dxfToShapes';
import { cleanupShapes } from './utils/dxf/cleanup';
import { DxfWorkerOutput } from './utils/dxf/types';

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
}

interface PlanImportHook {
  openImportPdfModal: () => void;
  openImportImageModal: () => void;
  openImportDxfModal: () => void;
  closeImportModal: () => void;
  handleFileImport: (file: File, options?: ImportOptions) => Promise<void>;
  isImportModalOpen: boolean;
  importMode: 'pdf' | 'image' | 'dxf';
}

export const usePlanImport = (): PlanImportHook => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'pdf' | 'image' | 'dxf'>('pdf');
  const uiStore = useUIStore();
  const dataStore = useDataStore();

  const openImportPdfModal = useCallback(() => {
    setImportMode('pdf');
    setIsImportModalOpen(true);
  }, []);

  const openImportImageModal = useCallback(() => {
    setImportMode('image');
    setIsImportModalOpen(true);
  }, []);

  const openImportDxfModal = useCallback(() => {
    setImportMode('dxf');
    setIsImportModalOpen(true);
  }, []);

  const closeImportModal = useCallback(() => setIsImportModalOpen(false), []);

  const processFile = useCallback(async (file: File): Promise<PlanImportResult | null> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const fileContent = e.target?.result;
          let svgString: string = '';
          let viewBox: NormalizedViewBox = { x: 0, y: 0, width: 1000, height: 1000 };
          let originalWidth = 1000;
          let originalHeight = 1000;

          if (file.type === 'application/pdf') {
            const pdfData = new Uint8Array(fileContent as ArrayBuffer);
            const loadingTask = pdfjs.getDocument({ data: pdfData });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1);

            const viewport = page.getViewport({ scale: 1.0 });
            originalWidth = viewport.width;
            originalHeight = viewport.height;

            const vectorShapes = await convertPdfPageToShapes(
                page, 
                uiStore.activeFloorId || 'default', 
                dataStore.activeLayerId
            );

            if (vectorShapes.length > 0) {
                 resolve({ shapes: vectorShapes, originalWidth, originalHeight });
                 return;
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
            svgString = fileContent as string;
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

          } else if (file.type.startsWith('image/')) {
             const imgDataUrl = await new Promise<string>((resolveImg, rejectImg) => {
                 const imgReader = new FileReader();
                 imgReader.onload = () => resolveImg(imgReader.result as string);
                 imgReader.onerror = rejectImg;
                 imgReader.readAsDataURL(file);
             });

             const img = new Image();
             await new Promise<void>((resolveImgLoad, rejectImgLoad) => {
                 img.onload = () => resolveImgLoad();
                 img.onerror = rejectImgLoad;
                 img.src = imgDataUrl;
             });

             originalWidth = img.width;
             originalHeight = img.height;
             viewBox = { x: 0, y: 0, width: originalWidth, height: originalHeight };
             
             svgString = `<svg width="${originalWidth}" height="${originalHeight}" viewBox="0 0 ${originalWidth} ${originalHeight}" xmlns="http://www.w3.org/2000/svg">
                             <image href="${imgDataUrl}" x="0" y="0" width="${originalWidth}" height="${originalHeight}"/>
                           </svg>`;

          } else {
            throw new Error(`Unsupported file type: ${file.type}`);
          }

          const newShapeId = generateId('plan');
          const newShape: Shape = {
            id: newShapeId,
            layerId: dataStore.activeLayerId,
            type: 'rect',
            x: 0,
            y: 0,
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
    try {
      if (importMode === 'dxf') {
          // DXF/DWG Handling
          const isDwg = file.name.toLowerCase().endsWith('.dwg');
          const isDxf = file.name.toLowerCase().endsWith('.dxf');

          if (isDwg) {
             throw new Error("Arquivos DWG binários requerem conversão prévia. Por favor, converta para DXF (AutoCAD 2000+ ASCII) e tente novamente.");
          }
          if (!isDxf) {
             throw new Error("Por favor, selecione um arquivo .DXF válido.");
          }

          // Safety Check: File Size Limit (50MB)
          const MAX_SIZE = 50 * 1024 * 1024; // 50MB
          if (file.size > MAX_SIZE) {
              throw new Error("Arquivo muito grande. O limite é 50MB.");
          }

          // Read as text
          const text = await file.text();

          // Worker Processing
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
              worker.postMessage({ text });
          });

          // Convert to Shapes
          const result = convertDxfToShapes(workerData, {
              floorId: uiStore.activeFloorId || 'default',
              defaultLayerId: dataStore.activeLayerId,
              explodeBlocks: true // Always explode for now
          });

          let shapesToAdd = cleanupShapes(result.shapes);

          // Handle Layers
          if (options?.maintainLayers && result.layers.length > 0) {
              const layerMap = new Map<string, string>();

              result.layers.forEach(l => {
                  // Create or Get Layer ID
                  // ensureLayer returns the ID
                  const storeId = dataStore.ensureLayer(l.name, {
                      strokeColor: l.strokeColor,
                      strokeEnabled: l.strokeEnabled,
                      fillColor: l.fillColor,
                      fillEnabled: l.fillEnabled,
                      visible: l.visible,
                      locked: l.locked
                  });
                  layerMap.set(l.id, storeId);
              });

              // Remap shapes
              shapesToAdd = shapesToAdd.map(s => ({
                  ...s,
                  layerId: layerMap.get(s.layerId) || dataStore.activeLayerId
              }));
          }

          console.log(`Imported ${shapesToAdd.length} shapes from DXF`);
          dataStore.addShapes(shapesToAdd);
          uiStore.setSelectedShapeIds(new Set(shapesToAdd.map(s => s.id)));
          uiStore.setTool('select');

          closeImportModal();
          return;
      }

      // Legacy PDF/Image Handling
      if (importMode === 'pdf') {
          if (file.type !== 'application/pdf' && file.type !== 'image/svg+xml') {
              throw new Error("Por favor, selecione um arquivo PDF ou SVG.");
          }
      } else if (importMode === 'image') {
          if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
              throw new Error("Por favor, selecione uma imagem (PNG, JPG).");
          }
      }

      const result = await processFile(file);
      if (result && result.shapes.length > 0) {
        console.log(`Importing ${result.shapes.length} shapes.`);
        dataStore.addShapes(result.shapes);
        uiStore.setSelectedShapeIds(new Set(result.shapes.map(s => s.id)));
        uiStore.setTool('select');
      }
      closeImportModal();
    } catch (error) {
      alert(`Erro ao importar arquivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [processFile, dataStore, closeImportModal, importMode, uiStore]);

  return {
    isImportModalOpen,
    importMode,
    openImportPdfModal,
    openImportImageModal,
    openImportDxfModal,
    closeImportModal,
    handleFileImport,
  };
};
