import { useCallback } from 'react';
import { useDataStore } from '../../../stores/useDataStore';
import { useUIStore } from '../../../stores/useUIStore';
import { generateId } from '../../../utils/uuid';
import { NormalizedViewBox, Shape } from '../../../types';

interface ImportPlanResult {
  shapeId: string;
  warning?: string;
}

const parseSvgViewBox = (svgRaw: string): NormalizedViewBox | null => {
  try {
    const doc = new DOMParser().parseFromString(svgRaw, 'image/svg+xml');
    const root = doc.documentElement;
    const viewBox = root.getAttribute('viewBox');
    if (viewBox) {
      const [x, y, w, h] = viewBox.split(/\s+/).map(Number);
      if ([x, y, w, h].every(isFinite) && w > 0 && h > 0) {
        return { x, y, width: w, height: h };
      }
    }
    const width = Number(root.getAttribute('width'));
    const height = Number(root.getAttribute('height'));
    if (isFinite(width) && isFinite(height) && width > 0 && height > 0) {
      return { x: 0, y: 0, width, height };
    }
    return null;
  } catch (err) {
    console.error('Failed to parse SVG viewBox', err);
    return null;
  }
};

const buildPlanShape = (
  svgRaw: string,
  viewBox: NormalizedViewBox | null,
  defaults: { layerId: string; floorId?: string; discipline: 'architecture' | 'electrical' }
): Shape => {
  const vb = viewBox ?? { x: 0, y: 0, width: 1000, height: 1000 };
  return {
    id: generateId(),
    type: 'rect',
    layerId: defaults.layerId,
    discipline: defaults.discipline,
    floorId: defaults.floorId,
    x: vb.x,
    y: vb.y,
    width: vb.width,
    height: vb.height,
    strokeColor: '#000000',
    fillColor: '#ffffff',
    svgRaw,
    svgOriginalRaw: svgRaw,
    svgViewBox: vb,
    points: [],
  };
};

export const usePlanImport = () => {
  const addShape = useDataStore(s => s.addShape);
  const layerId = useDataStore(s => s.activeLayerId);
  const activeFloorId = useUIStore(s => s.activeFloorId);
  const activeDiscipline = useUIStore(s => s.activeDiscipline);

  const importSvgPlan = useCallback(
    async (file: File): Promise<ImportPlanResult> => {
      const svgRaw = await file.text();
      const viewBox = parseSvgViewBox(svgRaw);
      const shape = buildPlanShape(svgRaw, viewBox, {
        layerId,
        floorId: activeFloorId,
        discipline: activeDiscipline,
      });
      addShape(shape);
      return { shapeId: shape.id };
    },
    [activeDiscipline, activeFloorId, addShape, layerId]
  );

  const importPdfPlan = useCallback(
    async (): Promise<ImportPlanResult> => {
      return {
        shapeId: '',
        warning:
          'Importação de PDF vetorial requer pdf.js; adicione a dependência ou converta o arquivo para SVG antes de importar.',
      };
    },
    []
  );

  const importPlan = useCallback(
    async (file: File): Promise<ImportPlanResult> => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext === 'svg' || file.type === 'image/svg+xml') {
        return importSvgPlan(file);
      }
      if (ext === 'pdf' || file.type === 'application/pdf') {
        return importPdfPlan();
      }
      return {
        shapeId: '',
        warning: 'Formato não suportado. Use SVG para manter qualidade vetorial.',
      };
    },
    [importPdfPlan, importSvgPlan]
  );

  return { importPlan };
};
