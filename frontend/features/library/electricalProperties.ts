import { ElectricalCategory } from '../../types';

export type ElectricalMetadataValue = string | number | boolean;

export interface ElectricalPropertyDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  unit?: string;
  helperText?: string;
  placeholder?: string;
  step?: number;
  min?: number;
  options?: { label: string; value: string | number }[];
}

const baseDefaults: Record<string, ElectricalMetadataValue> = {
  voltage: 127,
};

const symbolDefaults: Record<string, Record<string, ElectricalMetadataValue>> = {
  duplex_outlet: {
    voltage: 127,
    powerVA: 600,
    current: 10,
    circuit: 'TUG',
    mounting: 'Embutida',
  },
  lamp: {
    voltage: 127,
    power: 100,
    luminousFlux: 900,
    circuit: 'Iluminação',
    technology: 'LED',
  },
};

const baseSchema: ElectricalPropertyDefinition[] = [
  {
    key: 'voltage',
    label: 'Tensão',
    type: 'number',
    unit: 'V',
    step: 1,
  },
];

const symbolSchemas: Record<string, ElectricalPropertyDefinition[]> = {
  duplex_outlet: [
    ...baseSchema,
    {
      key: 'powerVA',
      label: 'Potência prevista',
      type: 'number',
      unit: 'VA',
      step: 50,
      helperText: 'Carga atribuída ao ponto de tomada.',
    },
    {
      key: 'current',
      label: 'Corrente',
      type: 'number',
      unit: 'A',
      step: 1,
    },
    {
      key: 'circuit',
      label: 'Circuito',
      type: 'text',
      placeholder: 'Ex.: TUG-01',
    },
    {
      key: 'mounting',
      label: 'Instalação',
      type: 'text',
      placeholder: 'Aparente / Embutida',
    },
  ],
  lamp: [
    ...baseSchema,
    {
      key: 'power',
      label: 'Potência',
      type: 'number',
      unit: 'W',
      step: 5,
    },
    {
      key: 'luminousFlux',
      label: 'Fluxo luminoso',
      type: 'number',
      unit: 'lm',
      step: 50,
    },
    {
      key: 'technology',
      label: 'Tecnologia',
      type: 'text',
      placeholder: 'LED / Fluorescente',
    },
    {
      key: 'circuit',
      label: 'Circuito',
      type: 'text',
      placeholder: 'Ex.: ILU-01',
    },
  ],
  conduit: [
    { key: 'diameter', label: 'Diâmetro', type: 'number', unit: 'mm', step: 5 }, // Added
    { key: 'material', label: 'Material', type: 'text', placeholder: 'PVC / Metal' }, // Added
    { key: 'circuit', label: 'Circuito', type: 'text', placeholder: 'Ex.: C-01' } // Added
  ],
};

export const ELECTRICAL_LAYER_CONFIG: Record<string, { name: string; strokeColor: string; fillColor?: string; fillEnabled?: boolean }> = {
  duplex_outlet: { name: 'Tomadas', strokeColor: '#0ea5e9', fillEnabled: false },
  lamp: { name: 'Iluminação', strokeColor: '#f59e0b', fillEnabled: false },
  conduit: { name: 'Eletrodutos', strokeColor: '#8b5cf6', fillEnabled: false }, // Added
};

export const getPropertySchemaForSymbol = (
  symbolId?: string,
  category?: ElectricalCategory
): ElectricalPropertyDefinition[] => {
  if (symbolId && symbolSchemas[symbolId]) return symbolSchemas[symbolId];
  if (category === ElectricalCategory.CONDUIT) return symbolSchemas.conduit; // Added
  if (category === ElectricalCategory.LIGHTING && symbolSchemas.lamp) return symbolSchemas.lamp;
  return baseSchema;
};

export const getElectricalLayerConfig = (
  symbolId?: string,
  category?: ElectricalCategory
): { name: string; strokeColor: string; fillColor?: string; fillEnabled?: boolean } => {
  if (symbolId && ELECTRICAL_LAYER_CONFIG[symbolId]) return ELECTRICAL_LAYER_CONFIG[symbolId];
  if (category === ElectricalCategory.CONDUIT) return ELECTRICAL_LAYER_CONFIG.conduit; // Added
  if (category === ElectricalCategory.LIGHTING && ELECTRICAL_LAYER_CONFIG.lamp) return ELECTRICAL_LAYER_CONFIG.lamp;
  return { name: 'Elétrica', strokeColor: '#0f172a', fillEnabled: false };
};

export const getDefaultMetadataForSymbol = (
  symbolId?: string
): Record<string, ElectricalMetadataValue> => ({
  ...baseDefaults,
  ...(symbolId && symbolDefaults[symbolId] ? symbolDefaults[symbolId] : {}),
});
