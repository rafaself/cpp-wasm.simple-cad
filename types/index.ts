export type ToolType = 
  | 'select' 
  | 'pan' 
  | 'line' 
  | 'circle' 
  | 'rect' 
  | 'polygon' 
  | 'polyline' 
  | 'arc' 
  | 'measure';

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
  color: string;
  visible: boolean;
  locked: boolean;
}

export interface SnapOptions {
  enabled: boolean;
  endpoint: boolean;
  midpoint: boolean;
  center: boolean;
  nearest: boolean;
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
  strokeColor: string;
  strokeWidth?: number;
  fillColor: string;
  label?: string;
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}