/**
 * Ribbon Configuration V2 - Phase 3: IA Reorganization
 *
 * NEW 4-TAB STRUCTURE (Jobs-to-be-Done):
 * 1. Home - File and project operations
 * 2. Draw - Create and modify content (select → draw → edit workflow)
 * 3. Annotate - Add information to drawings (text, colors, layers)
 * 4. View - Control display and navigation
 *
 * Changes from V1:
 * - Consolidated "Arquivo" + "Projeto" into "File" + "Export" groups
 * - Moved Selection and Edit to Draw tab (workflow continuity)
 * - Created new Annotate tab for properties (Text, Colors, Layers)
 * - Created new View tab for display controls (Pan, Zoom, Grid, Measure)
 * - All 42 commands preserved with improved organization
 */

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
  Slash,
  Activity,
  Hand,
  Ruler,
  Grid3x3,
  MoveUpRight,
  Shapes,
  FileCode2,
  Package,
  Scan,
} from 'lucide-react';

import { LABELS } from '@/i18n/labels';

import { ColorRibbonControls } from '../colors/ColorRibbonControls';
import { LayerRibbonControls } from '../components/ribbon/LayerRibbonControls';
import { SelectionControls } from '../components/ribbon/SelectionControls';
import { TextFormattingControls } from '../components/ribbon/TextFormattingControls';

import { RibbonGroup, RibbonItem, RibbonTab } from './ribbonConfig';

/**
 * Build Annotate tab groups
 * Conditional based on feature flags
 */
const buildAnnotateGroups = (enableColorsRibbon: boolean): RibbonGroup[] => {
  const groups: RibbonGroup[] = [
    // Text Group - Text tool + formatting
    {
      id: 'text',
      label: 'Texto',
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
  ];

  // Colors Group - Optional based on feature flag
  if (enableColorsRibbon) {
    groups.push({
      id: 'colors',
      label: LABELS.colors.group,
      items: [
        {
          id: 'colors-controls',
          kind: 'custom',
          label: LABELS.colors.group,
          status: 'ready',
          componentType: ColorRibbonControls,
        },
      ],
    });
  }

  // Layers Group - Always present
  groups.push({
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
  });

  return groups;
};

/**
 * Ribbon Configuration V2 - 4-Tab Structure
 */
export const getRibbonTabsV2 = (enableColorsRibbon: boolean): RibbonTab[] => [
  // ============================================================================
  // TAB 1: HOME - File and Project Operations
  // ============================================================================
  {
    id: 'home',
    label: 'Início',
    groups: [
      // File Group - Document operations (New, Open, Save)
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
      // Export Group - Project export operations
      {
        id: 'export',
        label: 'Exportar',
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

  // ============================================================================
  // TAB 2: DRAW - Create and Modify Content
  // ============================================================================
  {
    id: 'draw',
    label: 'Desenhar',
    groups: [
      // Select Group - Selection tool + modification actions
      {
        id: 'select',
        label: 'Selecionar',
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
      // Shapes Group - Drawing primitives
      {
        id: 'shapes',
        label: 'Formas',
        layout: 'grid-2x3',
        items: [
          {
            id: 'line',
            kind: 'tool',
            label: LABELS.tools.line,
            icon: Slash,
            toolId: 'line',
            status: 'ready',
            hideLabel: true,
          },
          {
            id: 'polyline',
            kind: 'tool',
            label: LABELS.tools.polyline,
            icon: Activity,
            toolId: 'polyline',
            status: 'ready',
            hideLabel: true,
          },
          {
            id: 'arrow',
            kind: 'tool',
            label: LABELS.tools.arrow,
            icon: MoveUpRight,
            toolId: 'arrow',
            status: 'ready',
            hideLabel: true,
          },
          {
            id: 'rect',
            kind: 'tool',
            label: LABELS.tools.rect,
            icon: Square,
            toolId: 'rect',
            status: 'ready',
            hideLabel: true,
          },
          {
            id: 'circle',
            kind: 'tool',
            label: LABELS.tools.circle,
            icon: Circle,
            toolId: 'circle',
            status: 'ready',
            hideLabel: true,
          },
          {
            id: 'polygon',
            kind: 'tool',
            label: LABELS.tools.polygon,
            icon: Shapes,
            toolId: 'polygon',
            status: 'ready',
            hideLabel: true,
          },
        ],
      },
      // Edit Group - Undo/Redo (always accessible during drawing)
      {
        id: 'edit',
        label: 'Editar',
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
    ],
  },

  // ============================================================================
  // TAB 3: ANNOTATE - Add Information to Drawings
  // ============================================================================
  {
    id: 'annotate',
    label: 'Anotar',
    groups: buildAnnotateGroups(enableColorsRibbon),
  },

  // ============================================================================
  // TAB 4: VIEW - Control Display and Navigation
  // ============================================================================
  {
    id: 'view',
    label: 'Visualizar',
    groups: [
      // Navigate Group - Pan and zoom controls
      {
        id: 'navigate',
        label: 'Navegar',
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
        ],
      },
      // Display Group - Visual settings (grid, etc.)
      {
        id: 'display',
        label: 'Exibir',
        items: [
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
      // Measure Group - Measurement tools
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

export const RIBBON_OVERFLOW_ITEMS: RibbonItem[] = []; // Empty for now
