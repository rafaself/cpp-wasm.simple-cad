import React from 'react';
import { Section } from '../../../components/ui/Section';
import { Toggle } from '../../../components/ui/Toggle';
import NumberSpinner from '../../../components/NumberSpinner';
import { useDataStore } from '../../../stores/useDataStore';
import { computeFrameData } from '../../../utils/frame';

const DocumentSettings: React.FC = () => {
  const {
    worldScale,
    setWorldScale,
    frame,
    setFrameEnabled,
    setFrameSize,
    setFrameMargin,
  } = useDataStore();

  const frameData = computeFrameData(frame, worldScale);
  const pxPerMm = (worldScale / 1000).toFixed(3);
  const frameSizePx = frameData
    ? `${Math.round(frameData.outerRect.width)} x ${Math.round(frameData.outerRect.height)} px`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Section title="Escala do Mundo">
        <div className="flex items-center justify-between gap-4 py-2">
          <div>
            <p className="text-sm text-slate-200">Pixels por metro</p>
            <p className="text-xs text-slate-400">Afeta o cálculo de importações futuras.</p>
          </div>
          <NumberSpinner
            value={worldScale}
            onChange={(v) => setWorldScale(Math.max(1, v))}
            min={1}
            max={5000}
            step={10}
            className="w-[120px]"
          />
        </div>
        <p className="text-xs text-slate-400">≈ {pxPerMm} px/mm</p>
      </Section>

      <Section title="Frame de Plotagem">
        <div className="flex items-center justify-between py-2">
          <span className="text-sm text-slate-200">Ativar frame</span>
          <Toggle checked={frame.enabled} onChange={setFrameEnabled} />
        </div>

        <div className={`grid grid-cols-3 gap-3 ${frame.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Largura (mm)</span>
            <NumberSpinner
              value={frame.widthMm}
              onChange={(v) => setFrameSize(v, frame.heightMm)}
              min={1}
              max={5000}
              step={5}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Altura (mm)</span>
            <NumberSpinner
              value={frame.heightMm}
              onChange={(v) => setFrameSize(frame.widthMm, v)}
              min={1}
              max={5000}
              step={5}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-slate-400">Margem (mm)</span>
            <NumberSpinner
              value={frame.marginMm}
              onChange={setFrameMargin}
              min={0}
              max={Math.min(frame.widthMm, frame.heightMm) / 2}
              step={1}
            />
          </div>
        </div>

        {frame.enabled && frameData && (
          <p className="text-xs text-slate-400 mt-2">
            Área útil: {frameSizePx}
            {frameData.marginRect
              ? ` • Margem: ${Math.round(frameData.marginRect.x - frameData.outerRect.x)} px`
              : ''}
          </p>
        )}
      </Section>
    </div>
  );
};

export default DocumentSettings;
