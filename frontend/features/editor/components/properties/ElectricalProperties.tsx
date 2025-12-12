import React, { useEffect, useMemo } from 'react';
import { Info } from 'lucide-react';
import { Shape } from '../../../../types';
import { useDataStore } from '../../../../stores/useDataStore';
import {
  ElectricalPropertyDefinition,
  getDefaultMetadataForSymbol,
  getPropertySchemaForSymbol,
} from '../../../library/electricalProperties';

interface ElectricalPropertiesProps {
  selectedShape: Shape;
}

const formatCategory = (value?: string) => {
  if (!value) return 'Eletrica';
  if (value === 'lighting') return 'Iluminacao';
  if (value === 'power') return 'Potencia';
  if (value === 'control') return 'Controle';
  if (value === 'signal') return 'Sinal';
  if (value === 'conduit' || value === 'eletroduto') return 'Eletrodutos';
  return value;
};

export const ElectricalProperties: React.FC<ElectricalPropertiesProps> = ({ selectedShape }) => {
  const store = useDataStore();
  const elementId = selectedShape.electricalElementId;
  const element = elementId ? store.electricalElements[elementId] : undefined;

  const schema = useMemo(
    () => getPropertySchemaForSymbol(element?.name, element?.category),
    [element?.category, element?.name]
  );

  const defaults = useMemo(() => getDefaultMetadataForSymbol(element?.name), [element?.name]);
  const mergedMetadata = useMemo(
    () => ({ ...defaults, ...(element?.metadata ?? {}) }),
    [defaults, element?.metadata]
  );

  useEffect(() => {
    if (!element) return;
    const hasMissing = schema.some((def) => element.metadata?.[def.key] === undefined);
    if (!element.metadata || hasMissing) {
      store.updateElectricalElement(element.id, { metadata: mergedMetadata });
    }
  }, [element, mergedMetadata, schema, store]);

  if (!element) {
    return (
      <div className="p-3 border-b border-slate-100">
        <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide mb-2">Propriedades eletricas</h3>
        <p className="text-xs text-slate-500">Selecione um simbolo eletrico para editar.</p>
      </div>
    );
  }

  const handleChange = (definition: ElectricalPropertyDefinition, raw: string) => {
    let value: string | number = raw;
    if (definition.type === 'number') {
      const parsed = Number.parseFloat(raw);
      value = Number.isFinite(parsed) ? parsed : 0;
    }

    const isSharedProperty = definition.key === 'name' || definition.key === 'description';

    if (isSharedProperty) {
        store.updateSharedElectricalProperties(element, { [definition.key]: value });
    } else {
        const updated = { ...mergedMetadata, [definition.key]: value };
        store.updateElectricalElement(element.id, { metadata: updated });
    }
  };

  return (
    <div className="p-3 border-b border-slate-100 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-wide">Propriedades eletricas</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {mergedMetadata.name || element.name || 'Simbolo'} {'->'} {formatCategory(element.category)}
          </p>
        </div>
        <Info size={14} className="text-slate-400" />
      </div>

      <div className="flex flex-col gap-3">
        {schema.map((definition) => (
          <div key={definition.key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700">{definition.label}</span>
              {definition.unit && (
                <span className="text-[10px] text-slate-400 font-mono">{definition.unit}</span>
              )}
            </div>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded px-2 h-8 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
              <input
                type={definition.type === 'number' ? 'number' : 'text'}
                step={definition.step}
                min={definition.min}
                value={mergedMetadata[definition.key] ?? ''}
                onChange={(e) => handleChange(definition, e.target.value)}
                placeholder={definition.placeholder}
                className="w-full bg-transparent border-none text-[12px] text-slate-700 h-full focus:ring-0 focus:outline-none"
              />
            </div>
            {definition.helperText && (
              <p className="text-[11px] text-slate-400 leading-snug">{definition.helperText}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ElectricalProperties;
