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
  inPaperSpace?: boolean; // True if entity is in Paper Space (Group 67 = 1)

  color?: number; // DXF color index (ACI)
  // dxf-parser exposes ACI separately from derived RGB
  colorIndex?: number;
  trueColor?: number; // 24-bit RGB value (optional)
  lineweight?: number; // Lineweight enum value (optional)
  lineType?: string; // Linetype name
  lineTypeScale?: number; // Entity linetype scale factor (CELTSCALE equivalent)

  // LINE, POLYLINE, LWPOLYLINE
  vertices?: DxfVector[];
  closed?: boolean; // LWPOLYLINE closed flag
  // dxf-parser uses `shape` for closed polylines
  shape?: boolean;

  // CIRCLE, ARC
  center?: DxfVector;
  radius?: number;
  startAngle?: number; // ARC
  endAngle?: number; // ARC

  // TEXT, MTEXT
  startPoint?: DxfVector;
  endPoint?: DxfVector; // Added for alignment
  textHeight?: number;
  text?: string;
  rotation?: number; // Degrees
  halign?: number; // Horizontal alignment
  valign?: number; // Vertical alignment
  attachmentPoint?: number; // MTEXT attachment point

  // INSERT (Block Reference)
  name?: string; // Block name
  position?: DxfVector;
  xScale?: number;
  yScale?: number;
  zScale?: number;
  attribs?: DxfEntity[]; // Attributes associated with this INSERT
  // rotation reused

  // SPLINE
  controlPoints?: DxfVector[];
  numberOfControlPoints?: number;
  degree?: number;

  knots?: number[];
  weights?: number[];

  // STYLE
  style?: string; // Style name reference
  widthFactor?: number; // Group 41
  obliqueAngle?: number; // Group 50
}

export interface DxfBlock {
  name: string;
  entities: DxfEntity[];
  position: DxfVector; // Base point
}

export interface DxfLayer {
  name: string;
  color?: number;
  colorIndex?: number;
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

export interface DxfStyle {
    name: string;
    fixedHeight?: number;
    fixedTextHeight?: number;
    widthFactor?: number;
    obliqueAngle?: number;
    fontFile?: string;
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
    };
    style?: {
        styles: Record<string, DxfStyle>;
    };
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
  grayscale?: boolean; // Deprecated, use colorMode
  colorMode?: 'original' | 'grayscale' | 'monochrome';
  sourceUnits?: 'auto' | 'meters' | 'cm' | 'mm' | 'feet' | 'inches';
  readOnly?: boolean;
  includePaperSpace?: boolean; // Defaults to false
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
