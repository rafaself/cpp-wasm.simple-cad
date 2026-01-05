// ... (imports)
import { ColorsRibbonGroup } from '../components/ribbon/ColorsRibbonGroup'; // Import new component

// ... (RibbonItem, RibbonGroup, RibbonTab types)

export const RIBBON_TABS: RibbonTab[] = [
  // ... (home tab)
  {
    id: 'draw',
    label: 'Desenho',
    groups: [
      {
        id: 'shapes',
        label: 'Formas',
        layout: 'grid-2x3',
        items: [
          // ... (shape tools)
          {
            id: 'line',
            kind: 'tool',
            label: LABELS.tools.line,
            icon: Slash,
            toolId: 'line',
            status: 'ready',
          },
          {
            id: 'polyline',
            kind: 'tool',
            label: LABELS.tools.polyline,
            icon: Activity,
            toolId: 'polyline',
            status: 'ready',
          },
          {
            id: 'arrow',
            kind: 'tool',
            label: LABELS.tools.arrow,
            icon: ArrowUpRight,
            toolId: 'arrow',
            status: 'ready',
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
            status: 'ready',
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
      // New Colors Group
      {
        id: 'colors',
        label: 'Cores',
        items: [
          {
            id: 'colors-group',
            kind: 'custom',
            label: 'Cores',
            status: 'ready',
            componentType: ColorsRibbonGroup,
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
  // ... (tools tab)
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
