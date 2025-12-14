import { useState, useCallback, useRef } from 'react';
import { useUIStore } from '../../stores/useUIStore';
import { useDataStore } from '../../stores/useDataStore';
import { NormalizedViewBox, Shape } from '../../../types';
import * as pdfjs from 'pdfjs-dist';
// Configure PDF.js worker source using CDN to avoid local build issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PlanImportResult {
  shape: Shape;
  originalWidth: number; // For calibration
  originalHeight: number; // For calibration
}

export const usePlanImport = () => {
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const uiStore = useUIStore();
  const dataStore = useDataStore();

  const openImportModal = useCallback(() => setIsImportModalOpen(true), []);
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
            console.warn("PDFs are currently rasterized to PNG for import. Full vector PDF to SVG conversion is a future enhancement.");
            
            // Temporary: Render PDF to canvas, then to PNG data URL
            const pdfData = new Uint8Array(fileContent as ArrayBuffer);
            const loadingTask = pdfjs.getDocument({ data: pdfData });
            const pdf = await loadingTask.promise;
            const page = await pdf.getPage(1); // Get first page

            const viewport = page.getViewport({ scale: 2 }); // Scale up for better quality
            originalWidth = viewport.width;
            originalHeight = viewport.height;

            const canvas = document.createElement('canvas');
            const canvasContext = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (canvasContext) {
              await page.render({ canvasContext, viewport }).promise;
              const pngDataUrl = canvas.toDataURL('image/png');
              
              // Embed as SVG with an <image> tag
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

          resolve({ shape: newShape, originalWidth, originalHeight });

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
      const result = await processFile(file);
      if (result) {
        // Here you would typically add the shape to the dataStore
        // and then potentially start a calibration process.
        console.log("Imported Shape:", result.shape);
        dataStore.addShape(result.shape);
        // Maybe activate a calibration tool here?
        // uiStore.setTool('calibrate');
        // uiStore.setCalibrationTarget(result.shape.id);
      }
      closeImportModal();
    } catch (error) {
      alert(`Erro ao importar arquivo: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [processFile, dataStore, closeImportModal]); // Include closeImportModal here

  return {
    isImportModalOpen,
    openImportModal,
    closeImportModal,
    handleFileImport,
  };
};