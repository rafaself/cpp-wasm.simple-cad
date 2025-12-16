import React, { useMemo } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Shape } from '../../../types';
import { useDataStore } from '../../../../stores/useDataStore';

interface Props {
  shape: Shape;
}

interface SvgLayer {
  id: string;
  label: string;
}

const parseSvgLayers = (svgRaw?: string): SvgLayer[] => {
  if (!svgRaw) return [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgRaw, 'image/svg+xml');
  const groups = Array.from(doc.querySelectorAll('g[id]'));
  return groups.map(g => ({
    id: g.getAttribute('id') || '',
    label: g.getAttribute('id') || g.getAttribute('inkscape:label') || 'Layer',
  })).filter(l => l.id);
};

const PlanLayerControls: React.FC<Props> = ({ shape }) => {
  const updateShape = useDataStore(s => s.updateShape);

  const layers = useMemo(() => parseSvgLayers(shape.svgOriginalRaw ?? shape.svgRaw), [shape.svgOriginalRaw, shape.svgRaw]);
  const hidden = new Set(shape.svgHiddenLayers ?? []);

  if (!layers.length) return null;

  const toggleLayer = (id: string) => {
    const nextHidden = new Set(shape.svgHiddenLayers ?? []);
    if (nextHidden.has(id)) {
      nextHidden.delete(id);
    } else {
      nextHidden.add(id);
    }
    updateShape(shape.id, { svgHiddenLayers: Array.from(nextHidden) });
  };

  return (
    <div className="border-t border-slate-100 p-3">
      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Camadas internas</h4>
      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
        {layers.map(layer => {
          const isVisible = !hidden.has(layer.id);
          return (
            <button
              key={layer.id}
              onClick={() => toggleLayer(layer.id)}
              className={`w-full flex items-center justify-between text-xs px-2 py-1 rounded-md border transition ${isVisible ? 'bg-slate-100 border-slate-200 text-slate-700' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'}`}
            >
              <span className="truncate" title={layer.id}>{layer.label}</span>
              {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PlanLayerControls;
