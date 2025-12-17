import { Shape, Layer } from '../../../../types';

export interface DxfVector {
  x: number;
  y: number;
  z?: number;
  bulge?: number; // Added for Polyline arc segments
}

export interface DxfEntity {
  type: string;
  layer: string; // Layer name
  handle?: string;

  color?: number; // DXF color index (ACI)
  trueColor?: number; // 24-bit RGB value (optional)
  lineweight?: number; // Lineweight enum value (optional)
  lineType?: string; // Linetype name
  lineTypeScale?: number; // Entity linetype scale factor (CELTSCALE equivalent)

  // LINE, POLYLINE, LWPOLYLINE
  vertices?: DxfVector[];
  closed?: boolean; // LWPOLYLINE closed flag

  // CIRCLE, ARC
  center?: DxfVector;
  radius?: number;
  startAngle?: number; // ARC
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
  attribs?: DxfEntity[]; // Attributes associated with this INSERT
  rotation?: number;

  // SPLINE
  controlPoints?: DxfVector[];
  numberOfControlPoints?: number;
  degree?: number;
  closed?: boolean;
  knots?: number[];
  weights?: number[];
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
  lineType?: string; // Default linetype for layer
  lineweight?: number; // Default lineweight for layer (optional)
}

export interface DxfLinetype {
    name: string;
    description?: string;
    patternLength?: number;
    pattern?: number[]; // The raw dash lengths
}

export interface DxfData {
  entities: DxfEntity[];
  blocks?: Record<string, DxfBlock>;
  tables?: {
    layer?: {
      layers: Record<string, DxfLayer>;
    };
    ltype?: {
        linetypes: Record<string, DxfLinetype>;
    }
  };
  header?: {
    $INSUNITS?: number; // Unit code
    $EXTMIN?: DxfVector;
    $EXTMAX?: DxfVector;
    $TEXTSIZE?: number;
    $LTSCALE?: number; // Global Linetype Scale
    $CELTSCALE?: number; // Current Entity Linetype Scale
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
