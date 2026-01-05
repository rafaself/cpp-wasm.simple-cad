import {
  FilePlus,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  Type,
  MousePointer2,
  Square,
  Circle,
  Minus,
  PenTool,
  Hand,
  Move,
  RotateCw,
  Ruler,
  Grid3x3,
  ArrowUpRight,
  Shapes,
  FileCode2,
  Package,
  Trash2,
  Scan,
} from 'lucide-react';
import { ComponentType, ReactNode } from 'react';

import { LABELS } from '@/i18n/labels';

import { ColorsRibbonGroup } from '../components/ribbon/ColorsRibbonGroup';
import { LayerRibbonControls } from '../components/ribbon/LayerRibbonControls';
import { SelectionControls } from '../components/ribbon/SelectionControls';
import { TextFormattingControls } from '../components/ribbon/TextFormattingControls';

export type RibbonItemKind = 'action' | 'tool' | 'custom';
export type RibbonItemStatus = 'ready' | 'stub';

export type RibbonItem = {
  id: string;
  kind: RibbonItemKind;
  label: string;
  icon?: ComponentType<any>; // Icon is optional for custom items
  actionId?: string;
  toolId?: string;
  status: RibbonItemStatus;
  variant?: 'default' | 'large' | 'icon';
  width?: 'sm' | 'md' | 'lg' | 'auto';
  componentType?: ComponentType<any>; // For custom rendered items
};

export type RibbonGroup = {
  id: string;
  label?: string;
  layout?: 'flex-row' | 'grid-2x3' | 'stack';
  items: RibbonItem[];
};

export type RibbonTab = {
  id: string;
  label: string;
  groups: RibbonGroup[];
};

export const RIBBON_TABS: RibbonTab[] = [
  {
    id: 'home',
    label: 'Início',
    groups: [
      {
        id: 'file',
        label: 'Arquivo',
        items: [
          {
            id: 'new-file',
            kind: 'action',
            label: LABELS.menu.newFile,
            icon: FilePlus,
            actionId: 'new-file',
            status: 'stub',
            variant: 'large',
          },
          {
            id: 'open-file',
            kind: 'action',
            label: LABELS.menu.openFile,
            icon: FolderOpen,
            actionId: 'open-file',
            status: 'ready',
            variant: 'large',
          },
          {
            id: 'save-file',
            kind: 'action',
            label: LABELS.menu.saveFile,
            icon: Save,
            actionId: 'save-file',
            status: 'ready',
            variant: 'large',
          },
        ],
      },
      {
        id: 'project',
        label: 'Projeto',
        items: [
          {
            id: 'export-json',
            kind: 'action',
            label: 'Exportar JSON',
            icon: FileCode2,
            actionId: 'export-json',
            status: 'stub',
            variant: 'large',
          },
          {
            id: 'export-project',
            kind: 'action',
            label: 'Exportar Projeto',
            icon: Package,
            actionId: 'export-project',
            status: 'stub',
            variant: 'large',
          },
        ],
      },


    ],
  },
  {
    id: 'draw',
    label: 'Desenho',
    groups: [
      {
        id: 'shapes',
        label: 'Formas',
        layout: 'grid-2x3',
        items: [
          {
            id: 'line',
            kind: 'tool',
            label: LABELS.tools.line,
            icon: Minus,
            toolId: 'line',
            status: 'ready',
          },
          {
            id: 'polyline',
            kind: 'tool',
            label: LABELS.tools.polyline,
            icon: PenTool,
            toolId: 'polyline',
            status: 'ready',
          },
          {
            id: 'arrow',
            kind: 'tool',
            label: LABELS.tools.arrow,
            icon: ArrowUpRight,
            toolId: 'arrow',
            status: 'stub',
          },
          {
            id: 'rect',
            kind: 'tool',
            label: LABELS.tools.rect,
            icon: Square,
            toolId: 'rect',
            status: 'ready',
          },
          {
            id: 'circle',
            kind: 'tool',
            label: LABELS.tools.circle,
            icon: Circle,
            toolId: 'circle',
            status: 'ready',
          },
          {
            id: 'polygon',
            kind: 'tool',
            label: LABELS.tools.polygon,
            icon: Shapes,
            toolId: 'polygon',
            status: 'stub',
          },
        ],
      },
      {
        id: 'colors',
        label: 'Cores',
        items: [
          {
            id: 'color-controls',
            kind: 'custom',
            label: 'Cores',
            status: 'ready',
            componentType: ColorsRibbonGroup,
          },
        ],
      },
      {
        id: 'annotation',
        label: 'Anotação',
        items: [
          {
            id: 'text',
            kind: 'tool',
            label: LABELS.tools.text,
            icon: Type,
            toolId: 'text',
            status: 'ready',
            variant: 'large',
          },
          {
            id: 'text-formatting',
            kind: 'custom',
            label: 'Formatação',
            status: 'ready',
            componentType: TextFormattingControls,
          },
        ],
      },
      {
        id: 'layers',
        label: 'Camadas',
        items: [
          {
            id: 'layer-controls',
            kind: 'custom',
            label: 'Camadas',
            status: 'ready',
            componentType: LayerRibbonControls,
          },
        ],
      },
    ],
  },
  {
    id: 'tools',
    label: 'Ferramentas',
    groups: [
      {
        id: 'selection',
        label: 'Seleção',
        items: [
          {
            id: 'select',
            kind: 'tool',
            label: LABELS.tools.select,
            icon: MousePointer2,
            toolId: 'select',
            status: 'ready',
            variant: 'large',
          },
          {
            id: 'selection-controls',
            kind: 'custom',
            label: 'Modificar',
            status: 'ready',
            componentType: SelectionControls,
          },
        ],
      },
      {
        id: 'edit',
        label: 'Edição',
        layout: 'stack',
        items: [
          {
            id: 'undo',
            kind: 'action',
            label: LABELS.menu.undo,
            icon: Undo2,
            actionId: 'undo',
            status: 'ready',
          },
          {
            id: 'redo',
            kind: 'action',
            label: LABELS.menu.redo,
            icon: Redo2,
            actionId: 'redo',
            status: 'ready',
          },
        ],
      },
      {
        id: 'view',
        label: 'Exibição',
        items: [
          {
            id: 'pan',
            kind: 'tool',
            label: LABELS.tools.pan,
            icon: Hand,
            toolId: 'pan',
            status: 'ready',
            variant: 'large',
          },
          {
            id: 'zoom-to-fit',
            kind: 'action',
            label: 'Ajustar à tela',
            icon: Scan,
            actionId: 'zoom-to-fit',
            status: 'ready',
            variant: 'large',
            width: 'md',
          },
          {
            id: 'grid',
            kind: 'action',
            label: 'Grade',
            icon: Grid3x3,
            actionId: 'grid',
            status: 'ready',
            variant: 'large',
          },
        ],
      },
      {
        id: 'measure',
        label: 'Medir',
        items: [
          {
            id: 'measure',
            kind: 'tool',
            label: 'Medir',
            icon: Ruler,
            toolId: 'measure',
            status: 'stub',
            variant: 'large',
          },
        ],
      },
    ],
  },
];

export const RIBBON_OVERFLOW_ITEMS: RibbonItem[] = []; // Empty now as items are integrated
