
export type ToolType = 
  | 'select' 
  | 'pan' 
  | 'line' 
  | 'arrow'
  | 'circle' 
  | 'rect' 
  | 'polygon' 
  | 'polyline' 
  | 'arc' 
  | 'measure'
  | 'move'
  | 'rotate'
  | 'text';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layer {
  id: string;
  name: string;
  strokeColor: string;
  fillColor: string;
  visible: boolean;
  locked: boolean;
  isNative?: boolean; // If true, layer cannot be deleted
}

export type ColorInheritanceMode = 'layer' | 'custom';

export interface ShapeColorMode {
  fill: ColorInheritanceMode;
  stroke: ColorInheritanceMode;
}

export interface SnapOptions {
  enabled: boolean;
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  nearest: boolean;
  grid: boolean; // Added
}

export interface Shape {
  id: string;
  layerId: string;
  type: ToolType;
  points: Point[]; 
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  sides?: number;
  startAngle?: number;
  endAngle?: number;
  arrowHeadSize?: number; // Size of arrow head for arrow type
  strokeColor: string;
  strokeWidth?: number;
  strokeOpacity?: number; // 0-100
  strokeEnabled?: boolean; // false = no stroke
  fillColor: string; // Background color for text
  fillEnabled?: boolean; // false = no fill (transparent), keeps fillColor for restoration
  fillOpacity?: number; // 0-100
  colorMode?: ShapeColorMode;
  
  // Text Properties
  textContent?: string;
  fontSize?: number;
  fontFamily?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;

  label?: string; // For measurements
  
  rotation?: number; // Rotation in radians
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

// History Patch Types
export type PatchType = 'ADD' | 'UPDATE' | 'DELETE';

export interface Patch {
  type: PatchType;
  id: string;
  data?: Shape; // For ADD
  diff?: Partial<Shape>; // For UPDATE
  prev?: Partial<Shape> | Shape; // For UNDO
}
