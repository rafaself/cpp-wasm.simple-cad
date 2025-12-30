import { ComponentType } from 'react';
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
  FileSpreadsheet,
  Package,
  Eye,
  Trash2,
  Scan
} from 'lucide-react';
import { LABELS } from '@/i18n/labels';

export type RibbonItemKind = 'action' | 'tool';
export type RibbonItemStatus = 'ready' | 'stub';

export type RibbonItem = {
  id: string;
  kind: RibbonItemKind;
  label: string;
  icon: ComponentType<any>;
  actionId?: string;
  toolId?: string;
  status: RibbonItemStatus;
};

export type RibbonGroup = {
  id: string;
  items: RibbonItem[];
};

export const RIBBON_GROUPS: RibbonGroup[] = [
  {
    id: 'file-history',
    items: [
      {
        id: 'new-file',
        kind: 'action',
        label: LABELS.menu.newFile,
        icon: FilePlus,
        actionId: 'new-file',
        status: 'stub',
      },
      {
        id: 'open-file',
        kind: 'action',
        label: LABELS.menu.openFile,
        icon: FolderOpen,
        actionId: 'open-file',
        status: 'ready',
      },
      {
        id: 'save-file',
        kind: 'action',
        label: LABELS.menu.saveFile,
        icon: Save,
        actionId: 'save-file',
        status: 'ready',
      },
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
    id: 'tools',
    items: [
      { id: 'select', kind: 'tool', label: LABELS.tools.select, icon: MousePointer2, toolId: 'select', status: 'ready' },
      { id: 'line', kind: 'tool', label: LABELS.tools.line, icon: Minus, toolId: 'line', status: 'ready' },
      { id: 'rect', kind: 'tool', label: LABELS.tools.rect, icon: Square, toolId: 'rect', status: 'ready' },
      { id: 'circle', kind: 'tool', label: LABELS.tools.circle, icon: Circle, toolId: 'circle', status: 'ready' },
      { id: 'polyline', kind: 'tool', label: LABELS.tools.polyline, icon: PenTool, toolId: 'polyline', status: 'ready' },
      { id: 'text', kind: 'tool', label: LABELS.tools.text, icon: Type, toolId: 'text', status: 'ready' },
      { id: 'arrow', kind: 'tool', label: LABELS.tools.arrow, icon: ArrowUpRight, toolId: 'arrow', status: 'stub' },
      { id: 'polygon', kind: 'tool', label: LABELS.tools.polygon, icon: Shapes, toolId: 'polygon', status: 'stub' },
    ],
  },
  {
    id: 'edit-visual',
    items: [
      { id: 'delete', kind: 'action', label: LABELS.common.delete, icon: Trash2, actionId: 'delete', status: 'ready' },
      { id: 'pan', kind: 'tool', label: LABELS.tools.pan, icon: Hand, toolId: 'pan', status: 'stub' },
      { id: 'move', kind: 'tool', label: 'Mover', icon: Move, toolId: 'move', status: 'stub' },
      { id: 'rotate', kind: 'tool', label: 'Rotacionar', icon: RotateCw, toolId: 'rotate', status: 'stub' },
      { id: 'measure', kind: 'tool', label: 'Medir', icon: Ruler, toolId: 'measure', status: 'stub' },
      { id: 'zoom-to-fit', kind: 'action', label: 'Ajustar à tela', icon: Scan, actionId: 'zoom-to-fit', status: 'ready' },
      { id: 'grid', kind: 'action', label: 'Grade', icon: Grid3x3, actionId: 'grid', status: 'stub' },
    ],
  },
];

export const RIBBON_OVERFLOW_ITEMS: RibbonItem[] = [
  { id: 'export-json', kind: 'action', label: 'Exportar JSON', icon: FileCode2, actionId: 'export-json', status: 'stub' },
  { id: 'report-csv', kind: 'action', label: 'Relatório CSV', icon: FileSpreadsheet, actionId: 'report-csv', status: 'stub' },
  { id: 'export-project', kind: 'action', label: 'Exportar Projeto', icon: Package, actionId: 'export-project', status: 'stub' },
  { id: 'view-project', kind: 'action', label: 'Ver Projeto JSON', icon: Eye, actionId: 'view-project', status: 'stub' },
];
