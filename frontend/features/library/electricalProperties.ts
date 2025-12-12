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
  height: 30, // Default height cm
  name: '',
  description: '',
};

const symbolDefaults: Record<string, Record<string, ElectricalMetadataValue>> = {
  duplex_outlet: {
    voltage: 127,
    power: 600, // Normalized key
    height: 30,
    current: 10,
    circuit: 'TUG',
    mounting: 'Embutida',
    name: 'TUG',
    description: 'Tomada de Uso Geral',
  },
  lamp: {
    voltage: 127,
    power: 100,
    height: 280,
    luminousFlux: 900,
    circuit: 'ILU',
    technology: 'LED',
    name: 'Lâmpada',
    description: 'Ponto de Iluminação',
  },
};

const baseSchema: ElectricalPropertyDefinition[] = [
  {
    key: 'name',
    label: 'Nome',
    type: 'text',
    placeholder: 'Ex: TUG',
    helperText: 'Identificador do grupo de conexões',
  },
  {
    key: 'description',
    label: 'Descrição',
    type: 'text',
    placeholder: 'Ex: Tomada Uso Geral',
  },
  {
    key: 'voltage',
    label: 'Tensão',
    type: 'number',
    unit: 'V',
    step: 1,
  },
  {
    key: 'power',
    label: 'Potência',
    type: 'number',
    unit: 'W',
    step: 50,
  },
  {
    key: 'height',
    label: 'Altura',
    type: 'number',
    unit: 'cm',
    step: 5,
  },
  {
    key: 'circuit',
    label: 'Circuito',
    type: 'text',
    placeholder: 'Ex: 01',
  },
];

const symbolSchemas: Record<string, ElectricalPropertyDefinition[]> = {
  duplex_outlet: [
    ...baseSchema,
    {
      key: 'current',
      label: 'Corrente',
      type: 'number',
      unit: 'A',
      step: 1,
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
  ],
  conduit: [
    { key: 'diameter', label: 'Diâmetro', type: 'number', unit: 'mm', step: 5 },
    { key: 'material', label: 'Material', type: 'text', placeholder: 'PVC / Metal' },
    { key: 'circuit', label: 'Circuito', type: 'text', placeholder: 'Ex.: C-01' }
  ],
};

export const ELECTRICAL_LAYER_CONFIG: Record<string, { name: string; strokeColor: string; fillColor?: string; fillEnabled?: boolean }> = {
  duplex_outlet: { name: 'Tomadas', strokeColor: '#0ea5e9', fillEnabled: false },
  lamp: { name: 'Iluminação', strokeColor: '#f59e0b', fillEnabled: false },
  conduit: { name: 'Eletrodutos', strokeColor: '#8b5cf6', fillEnabled: false },
};

export const getPropertySchemaForSymbol = (
  symbolId?: string,
  category?: ElectricalCategory
): ElectricalPropertyDefinition[] => {
  if (symbolId && symbolSchemas[symbolId]) return symbolSchemas[symbolId];
  if (category === ElectricalCategory.CONDUIT) return symbolSchemas.conduit;
  if (category === ElectricalCategory.LIGHTING && symbolSchemas.lamp) return symbolSchemas.lamp;
  return baseSchema;
};

export const getElectricalLayerConfig = (
  symbolId?: string,
  category?: ElectricalCategory
): { name: string; strokeColor: string; fillColor?: string; fillEnabled?: boolean } => {
  if (symbolId && ELECTRICAL_LAYER_CONFIG[symbolId]) return ELECTRICAL_LAYER_CONFIG[symbolId];
  if (category === ElectricalCategory.CONDUIT) return ELECTRICAL_LAYER_CONFIG.conduit;
  if (category === ElectricalCategory.LIGHTING && ELECTRICAL_LAYER_CONFIG.lamp) return ELECTRICAL_LAYER_CONFIG.lamp;
  return { name: 'Elétrica', strokeColor: '#0f172a', fillEnabled: false };
};

export const getDefaultMetadataForSymbol = (
  symbolId?: string
): Record<string, ElectricalMetadataValue> => ({
  ...baseDefaults,
  ...(symbolId && symbolDefaults[symbolId] ? symbolDefaults[symbolId] : {}),
});
