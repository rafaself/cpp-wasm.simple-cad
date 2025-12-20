import { ToolType } from '../types';
import { getShortcutLabel } from './keybindings';

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
    label: 'INICIO',
    sections: [
      {
        title: 'Operacoes',
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
            { id: 'report-csv', label: 'Relatorio CSV', icon: 'ExportCSV', type: 'action', action: 'report-csv' },
            { id: 'export-connections', label: 'Exportar Conexoes', icon: 'ExportJSON', type: 'action', action: 'export-connections' },
             { id: 'export-project', label: 'Exportar Projeto (download)', icon: 'ExportJSON', type: 'action', action: 'export-project' },
             { id: 'view-project', label: 'Ver Projeto JSON (nova aba)', icon: 'ExportJSON', type: 'action', action: 'view-project' },
            { id: 'view-connections', label: 'Ver Relatorio', icon: 'ExportJSON', type: 'action', action: 'view-connections' }
        ]
      },
      {
        title: 'Janela',
        layout: 'row',
        items: [
            { id: 'settings', label: 'Configuracoes', icon: 'Settings', type: 'action', action: 'open-settings' }
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
          { id: 'line', label: 'Linha', icon: 'Line', type: 'tool', tool: 'line', shortcut: getShortcutLabel('tools.line') },
          { id: 'arrow', label: 'Seta', icon: 'Arrow', type: 'tool', tool: 'arrow' },
          { id: 'polyline', label: 'Polilinha', icon: 'Polyline', type: 'tool', tool: 'polyline', shortcut: getShortcutLabel('tools.polyline') },
          { id: 'circle', label: 'Elipse', icon: 'Circle', type: 'tool', tool: 'circle', shortcut: getShortcutLabel('tools.circle') },
          { id: 'rect', label: 'Retangulo', icon: 'Rect', type: 'tool', tool: 'rect', shortcut: getShortcutLabel('tools.rect') },
          { id: 'polygon', label: 'Poligono', icon: 'Polygon', type: 'tool', tool: 'polygon', shortcut: getShortcutLabel('tools.polygon') },
        ]
      },
      {
          title: 'Texto',
          layout: 'row',
          items: [
              { id: 'text-tool', label: 'Texto', icon: 'Text', type: 'tool', tool: 'text', shortcut: getShortcutLabel('tools.text') },
              { id: 'text-format-group', label: 'Formatacao', icon: 'Settings', type: 'component', componentName: 'TextFormatGroup' },
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
            { id: 'select', label: 'Selecionar', icon: 'Select', type: 'tool', tool: 'select', shortcut: getShortcutLabel('tools.select') },
            { id: 'move', label: 'Mover', icon: 'Move', type: 'tool', tool: 'move' },
            { id: 'rotate', label: 'Rotacionar', icon: 'Rotate', type: 'tool', tool: 'rotate' },
            { id: 'delete', label: 'Excluir', icon: 'Delete', type: 'action', action: 'delete', shortcut: getShortcutLabel('editor.delete') },
            { id: 'join', label: 'Unir', icon: 'Join', type: 'action', action: 'join' },
            { id: 'explode', label: 'Explodir', icon: 'Explode', type: 'action', action: 'explode' },
        ]
      },
      {
          title: 'Medicao',
          layout: 'row',
          items: [
              { id: 'measure', label: 'Medir', icon: 'Measure', type: 'tool', tool: 'measure', shortcut: getShortcutLabel('tools.measure') }
          ]
      },
      {
        title: 'Navegar',
        layout: 'row',
        items: [
          { id: 'pan', label: 'Pan', icon: 'Hand', type: 'tool', tool: 'pan', shortcut: getShortcutLabel('nav.pan') },
          { id: 'zoom-fit', label: 'Ajustar Zoom', icon: 'Scan', type: 'action', action: 'zoom-fit', shortcut: getShortcutLabel('nav.zoomFit') }
        ]
      },
      {
        title: 'Historico',
        layout: 'row',
        items: [
            { id: 'undo', label: 'Desfazer', icon: 'Undo', type: 'action', action: 'undo', shortcut: getShortcutLabel('editor.undo') },
            { id: 'redo', label: 'Refazer', icon: 'Redo', type: 'action', action: 'redo', shortcut: getShortcutLabel('editor.redo') },
        ]
      }
    ]
  },
  {
    id: 'electrical',
    label: 'LANCAMENTO',
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
          { id: 'lamp', label: 'Lampada', icon: 'Lightbulb', type: 'tool', tool: 'electrical-symbol' }
        ]
      }
    ]
  }
];
