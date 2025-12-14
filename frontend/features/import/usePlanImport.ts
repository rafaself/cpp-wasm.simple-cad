import { useState, useCallback, useRef } from 'react';
import { useUIStore } from '../../stores/useUIStore';
import { useDataStore } from '../../stores/useDataStore';
import { NormalizedViewBox, Shape } from '../../../types';
import * as pdfjs from 'pdfjs-dist/build/pdf';
import { convertPdfPageToShapes } from './utils/pdfToShapes';

// Configure PDF.js worker source using CDN to avoid local build issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PlanImportResult {
  shapes: Shape[];
  originalWidth: number; // For calibration
  originalHeight: number; // For calibration
}

interface PlanImportHook {
  openImportPdfModal: () => void;
  openImportImageModal: () => void;
  closeImportModal: () => void;
  handleFileImport: (file: File) => Promise<void>;
  isImportModalOpen: boolean;
  importMode: 'pdf' | 'image';
}

export const usePlanImport = (): PlanImportHook => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importMode, setImportMode] = useState<'pdf' | 'image'>('pdf');
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

  const closeImportModal = useCallback(() => setIsImportModalOpen(false), []);

  const processFile = useCallback(async (file: File): Promise<PlanImportResult | null> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const fileContent = e.target?.result;
          let svgString: string = '';
          let viewBox: NormalizedViewBox = { x: 0, y: 0, width: 1000, height: 1000 }; // Default / Placeholder
          let originalWidth = 1000;
          let originalHeight = 1000;

          if (file.type === 'application/pdf') {
            const pdfData = new Uint8Array(fileContent as ArrayBuffer);
            const loadingTask = pdfjs.getDocument({ data: pdfData });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1); // Get first page

            const viewport = page.getViewport({ scale: 1.0 });
            originalWidth = viewport.width;
            originalHeight = viewport.height;

            // Attempt vector conversion
            const vectorShapes = await convertPdfPageToShapes(
                page, 
                uiStore.activeFloorId || 'default', 
                dataStore.activeLayerId
            );

            if (vectorShapes.length > 0) {
                 resolve({ shapes: vectorShapes, originalWidth, originalHeight });
                 return;
            }

            // Fallback to raster if no vector shapes found (e.g. scanned PDF)
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
            // Attempt to parse viewBox from SVG string
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
                // If no viewBox, try width/height attributes
                originalWidth = Number(svgElement.getAttribute('width')) || 1000;
                originalHeight = Number(svgElement.getAttribute('height')) || 1000;
                viewBox = { x: 0, y: 0, width: originalWidth, height: originalHeight };
            }

          } else if (file.type.startsWith('image/')) {
             // Handle PNG, JPEG, etc.
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

          const newShapeId = `plan-${Date.now()}`;
          const newShape: Shape = {
            id: newShapeId,
            layerId: dataStore.activeLayerId, // Use current active layer
            type: 'rect', // Using rect type for SVG container
            x: 0, // Default position
            y: 0, // Default position
            width: originalWidth, // Default to original size, will be calibrated
            height: originalHeight, // Default to original size, will be calibrated
            strokeColor: 'transparent',
            strokeWidth: 0,
            strokeEnabled: false,
            fillColor: 'transparent',
            colorMode: { fill: 'custom', stroke: 'custom' },
            svgRaw: svgString,
            svgViewBox: viewBox,
            discipline: 'architecture', // Mark as architectural plan
            floorId: uiStore.activeFloorId, // Assign to current active floor
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
      reader.readAsArrayBuffer(file); // Read as ArrayBuffer for PDF.js
    });
  }, [dataStore, uiStore]);

  const handleFileImport = useCallback(async (file: File) => {
    try {
      if (importMode === 'pdf') {
          if (file.type !== 'application/pdf' && file.type !== 'image/svg+xml') {
              throw new Error("Por favor, selecione um arquivo PDF ou SVG.");
          }
      } else if (importMode === 'image') {
          // Allow internal image/svg+xml to fail here if intended strictly for raster,
          // but usually users won't pick SVG in image mode if filtered.
          // Strict check:
          if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
              throw new Error("Por favor, selecione uma imagem (PNG, JPG).");
          }
      }

      const result = await processFile(file);
      if (result && result.shapes.length > 0) {
        console.log(`Importing ${result.shapes.length} shapes.`);
        dataStore.addShapes(result.shapes);
        
        // Select the imported shapes for easy manipulation
        uiStore.setSelectedShapeIds(new Set(result.shapes.map(s => s.id)));
        uiStore.setTool('select');
      }
      closeImportModal();
    } catch (error) {
      alert(`Erro ao importar arquivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [processFile, dataStore, closeImportModal, importMode]);

  return {
    isImportModalOpen,
    importMode,
    openImportPdfModal,
    openImportImageModal,
    closeImportModal,
    handleFileImport,
  };
};