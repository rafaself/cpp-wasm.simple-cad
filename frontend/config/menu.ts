import { ToolType } from '../types';

export type MenuItemType = 'tool' | 'action' | 'component';

export interface MenuItem {
  id: string;
  label: string;
  icon: string; // Key for IconMap
  type: MenuItemType;
  tool?: ToolType; // If type is tool
  action?: string; // If type is action
  componentName?: string; // If type is component
  shortcut?: string;
}

export interface MenuSection {
  title: string;
  layout?: 'grid' | 'row' | 'column'; // Hint for rendering
  columns?: number;
  items: MenuItem[];
}

export interface MenuTab {
  id: string;
  label: string;
  sections: MenuSection[];
}

export const MENU_CONFIG: MenuTab[] = [
  {
    id: 'file',
    label: 'INÍCIO',
    sections: [
      {
        title: 'Operações',
        layout: 'row',
        items: [
          { id: 'new', label: 'Novo', icon: 'New', type: 'action', action: 'new-file' },
          { id: 'open', label: 'Abrir', icon: 'Open', type: 'action', action: 'open-file' },
          { id: 'save', label: 'Salvar', icon: 'Save', type: 'action', action: 'save-file' },
        ]
      },
      {
        title: 'Exportar',
        layout: 'row',
        items: [
           { id: 'export-json', label: 'Exportar JSON', icon: 'ExportJSON', type: 'action', action: 'export-json' },
           { id: 'report-csv', label: 'Relatório CSV', icon: 'ExportCSV', type: 'action', action: 'export-csv' }
        ]
      },
      {
        title: 'Janela',
        layout: 'row',
        items: [
            { id: 'settings', label: 'Configurações', icon: 'Settings', type: 'action', action: 'open-settings' }
        ]
      }
    ]
  },
  {
    id: 'draw',
    label: 'DESENHO',
    sections: [
      {
        title: 'Formas',
        layout: 'grid',
        columns: 3,
        items: [
          { id: 'line', label: 'Linha', icon: 'Line', type: 'tool', tool: 'line', shortcut: 'L' },
          { id: 'arrow', label: 'Seta', icon: 'Arrow', type: 'tool', tool: 'arrow' },
          { id: 'polyline', label: 'Polilinha', icon: 'Polyline', type: 'tool', tool: 'polyline', shortcut: 'P' },
          { id: 'circle', label: 'Círculo', icon: 'Circle', type: 'tool', tool: 'circle', shortcut: 'C' },
          { id: 'arc', label: 'Arco', icon: 'Arc', type: 'tool', tool: 'arc', shortcut: 'A' },
          { id: 'rect', label: 'Retângulo', icon: 'Rect', type: 'tool', tool: 'rect', shortcut: 'R' },
          { id: 'polygon', label: 'Polígono', icon: 'Polygon', type: 'tool', tool: 'polygon', shortcut: 'G' },
        ]
      },
      {
          title: 'Texto',
          layout: 'row',
          items: [
              { id: 'text-tool', label: 'Texto', icon: 'Text', type: 'tool', tool: 'text', shortcut: 'T' },
              { id: 'text-format-group', label: 'Formatação', icon: 'Settings', type: 'component', componentName: 'TextFormatGroup' },
          ]
      },

      {
          title: 'Aparência',
          layout: 'row',
          items: [
              { id: 'color-control', label: 'Cores', icon: 'Palette', type: 'component', componentName: 'ColorControl' },
              { id: 'line-width-control', label: 'Largura', icon: 'Line', type: 'component', componentName: 'LineWidthControl' }
          ]
      },
      {
          title: 'Camadas',
          layout: 'column',
          items: [
              { id: 'layer-control', label: 'Camadas', icon: 'Layers', type: 'component', componentName: 'LayerControl' }
          ]
      },
      {
          title: 'Grid',
          layout: 'row',
          items: [
              { id: 'grid-control', label: 'Grid', icon: 'Grid', type: 'component', componentName: 'GridControl' }
          ]
      }
    ]
  },
  {
    id: 'tools',
    label: 'FERRAMENTAS',
    sections: [
      {
        title: 'Modificar',
        layout: 'grid',
        columns: 3,
        items: [
            { id: 'select', label: 'Selecionar', icon: 'Select', type: 'tool', tool: 'select', shortcut: 'V' },
            { id: 'move', label: 'Mover', icon: 'Move', type: 'tool', tool: 'move' },
            { id: 'rotate', label: 'Rotacionar', icon: 'Rotate', type: 'tool', tool: 'rotate' },
            { id: 'delete', label: 'Excluir', icon: 'Delete', type: 'action', action: 'delete', shortcut: 'Del' },
            { id: 'join', label: 'Unir', icon: 'Join', type: 'action', action: 'join' },
            { id: 'explode', label: 'Explodir', icon: 'Explode', type: 'action', action: 'explode' },
        ]
      },
      {
          title: 'Medição',
          layout: 'row',
          items: [
              { id: 'measure', label: 'Medir', icon: 'Measure', type: 'tool', tool: 'measure', shortcut: 'M' }
          ]
      },
      {
        title: 'Navegar',
        layout: 'row',
        items: [
          { id: 'pan', label: 'Pan', icon: 'Hand', type: 'tool', tool: 'pan', shortcut: 'H' },
          { id: 'zoom-fit', label: 'Ajustar Zoom', icon: 'Scan', type: 'action', action: 'zoom-fit', shortcut: 'Z' }
        ]
      },
      {
        title: 'Histórico',
        layout: 'row',
        items: [
            { id: 'undo', label: 'Desfazer', icon: 'Undo', type: 'action', action: 'undo', shortcut: 'Ctrl+Z' },
            { id: 'redo', label: 'Refazer', icon: 'Redo', type: 'action', action: 'redo', shortcut: 'Ctrl+Y' },
        ]
      }
    ]
  },
  {
    id: 'electrical',
    label: 'LANÇAMENTO',
    sections: [
      {
        title: 'Caminhos',
        layout: 'row',
        items: [
           { id: 'conduit', label: 'Eletroduto', icon: 'Conduit', type: 'tool', tool: 'eletroduto' }
        ]
      },
      {
        title: 'Pontos',
        layout: 'row',
        items: [
          { id: 'outlet', label: 'Tomada', icon: 'Plug', type: 'tool', tool: 'electrical-symbol' },
          { id: 'lamp', label: 'Lâmpada', icon: 'Lightbulb', type: 'tool', tool: 'electrical-symbol' }
        ]
      }
    ]
  }
];
