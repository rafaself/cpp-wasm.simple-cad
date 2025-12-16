import { Shape, Layer } from '../../../../types';

export interface DxfVector {
  x: number;
  y: number;
  z?: number;
}

export interface DxfEntity {
  type: string;
  layer: string; // Layer name
  handle?: string;
  color?: number; // DXF color index

  // LINE, POLYLINE, LWPOLYLINE
  vertices?: DxfVector[];

  // CIRCLE, ARC
  center?: DxfVector;
  radius?: number;
  startAngle?: number; // ARC (radians or degrees? Usually degrees in DXF)
  endAngle?: number; // ARC

  // TEXT, MTEXT
  startPoint?: DxfVector;
  textHeight?: number;
  text?: string;
  rotation?: number; // Degrees
  halign?: number; // Horizontal alignment
  valign?: number; // Vertical alignment

  // INSERT (Block Reference)
  name?: string; // Block name
  position?: DxfVector;
  xScale?: number;
  yScale?: number;
  zScale?: number;

  // SPLINE
  controlPoints?: DxfVector[];
  numberOfControlPoints?: number;
  degree?: number;
  closed?: boolean;
}

export interface DxfBlock {
  name: string;
  entities: DxfEntity[];
  position: DxfVector; // Base point
}

export interface DxfLayer {
  name: string;
  color?: number;
  frozen?: boolean;
  visible?: boolean;
}

export interface DxfData {
  entities: DxfEntity[];
  blocks?: Record<string, DxfBlock>;
  tables?: {
    layer?: {
      layers: Record<string, DxfLayer>;
    };
  };
  header?: {
    $INSUNITS?: number; // Unit code
    $EXTMIN?: DxfVector;
    $EXTMAX?: DxfVector;
  };
}

export interface DxfImportOptions {
  floorId: string;
  defaultLayerId: string;
  explodeBlocks?: boolean;
  grayscale?: boolean;
  readOnly?: boolean;
}

export interface DxfWorkerInput {
  text: string;
  options: DxfImportOptions;
}

export interface DxfWorkerOutput {
  success: boolean;
  data?: {
      shapes: Shape[];
      layers: Layer[];
      width: number;
      height: number;
      origin: { x: number; y: number };
  };
  error?: string;
}
