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
    id: 'home',
    label: 'HOME',
    sections: [
      {
        title: 'Draw',
        layout: 'grid',
        columns: 3,
        items: [
          { id: 'line', label: 'Line', icon: 'Line', type: 'tool', tool: 'line', shortcut: 'L' },
          { id: 'polyline', label: 'Polyline', icon: 'Polyline', type: 'tool', tool: 'polyline', shortcut: 'P' },
          { id: 'circle', label: 'Circle', icon: 'Circle', type: 'tool', tool: 'circle', shortcut: 'C' },
          { id: 'arc', label: 'Arc', icon: 'Arc', type: 'tool', tool: 'arc', shortcut: 'A' },
          { id: 'rect', label: 'Rect', icon: 'Rect', type: 'tool', tool: 'rect', shortcut: 'R' },
          { id: 'polygon', label: 'Polygon', icon: 'Polygon', type: 'tool', tool: 'polygon', shortcut: 'G' },
        ]
      },
      {
        title: 'Modify',
        layout: 'grid',
        columns: 2,
        items: [
            { id: 'select', label: 'Select', icon: 'Select', type: 'tool', tool: 'select', shortcut: 'V' },
            { id: 'delete', label: 'Delete', icon: 'Delete', type: 'action', action: 'delete', shortcut: 'Del' },
            { id: 'join', label: 'Join', icon: 'Join', type: 'action', action: 'join' },
            { id: 'explode', label: 'Explode', icon: 'Explode', type: 'action', action: 'explode' },
        ]
      },
      {
          title: 'Annotation',
          layout: 'row',
          items: [
              { id: 'measure', label: 'Measure', icon: 'Measure', type: 'tool', tool: 'measure', shortcut: 'M' }
          ]
      },
      {
          title: 'Layers',
          layout: 'column',
          items: [
              { id: 'layer-control', label: 'Layers', icon: 'Layers', type: 'component', componentName: 'LayerControl' }
          ]
      },
      {
          title: 'Properties',
          layout: 'column',
          items: [
              { id: 'prop-color', label: 'Color', icon: 'Palette', type: 'component', componentName: 'ColorControl' },
              { id: 'prop-width', label: 'Stroke', icon: 'Activity', type: 'component', componentName: 'LineWidthControl' }
          ]
      }
    ]
  },
  {
    id: 'view',
    label: 'VIEW',
    sections: [
      {
        title: 'Navigate',
        layout: 'row',
        items: [
          { id: 'pan', label: 'Pan', icon: 'Hand', type: 'tool', tool: 'pan', shortcut: 'H' },
          { id: 'zoom-fit', label: 'Zoom Fit', icon: 'Scan', type: 'action', action: 'zoom-fit', shortcut: 'Z' }
        ]
      }
    ]
  }
];