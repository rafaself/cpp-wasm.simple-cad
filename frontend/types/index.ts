
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
  | 'text'
  | 'electrical-symbol'
  | 'conduit' // Legacy name kept for compatibility
  | 'eletroduto'
  | 'calibrate';

export type DiagramNodeKind =
  | 'board'
  | 'circuit-group'
  | 'circuit'
  | 'command'
  | 'load'
  | 'note';

export enum ElectricalCategory {
  POWER = 'power',
  CONTROL = 'control',
  SIGNAL = 'signal',
  LIGHTING = 'lighting',
  CONDUIT = 'conduit'
}

export type ConnectionNodeKind = 'free' | 'anchored';

export interface ConnectionNode {
  id: string;
  kind: ConnectionNodeKind;
  /**
   * Cached/authoritative world position.
   * - For `free` nodes: authoritative.
   * - For `anchored` nodes: last known resolved position (fallback if the anchor is missing).
   */
  position?: Point;
  /** Shape id this node is anchored to (electrical symbol). */
  anchorShapeId?: string;
  /**
   * When true, the node should not be auto-anchored by the resolver (e.g., user just detached the conduit).
   */
  pinned?: boolean;
}

export interface DiagramNode {
  id: string;
  shapeId: string;
  kind: DiagramNodeKind;
  title: string;
  description?: string;
}

export interface DiagramEdge {
  id: string;
  shapeId: string;
  fromId: string;
  toId: string;
  label?: string;
}

export interface NormalizedViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElectricalElement {
  id: string;
  shapeId: string;
  category: ElectricalCategory;
  /**
   * Optional semantic refinement (e.g. for POWER devices: outlet vs switch).
   * Backward-compatible: legacy projects simply omit it.
   */
  subcategory?: string;
  name?: string;
  description?: string;
  metadata?: Record<string, string | number | boolean>;
  circuitId?: string; // #TODO: To be implemented with Load Board
}

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
  strokeEnabled: boolean; // Whether stroke is active for ByLayer elements
  fillColor: string;
  fillEnabled: boolean;   // Whether fill is active for ByLayer elements
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

export interface FrameSettings {
  enabled: boolean;
  widthMm: number;
  heightMm: number;
  marginMm: number;
}

export interface Shape {
  id: string;
  layerId: string;
  type: ToolType;
  points: Point[];
  floorId?: string;
  discipline?: 'architecture' | 'electrical';
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
  scaleX?: number; // 1 = normal, -1 = flipped horizontally
  scaleY?: number; // 1 = normal, -1 = flipped vertically

  // Symbol / SVG rendering support
  svgSymbolId?: string;
  svgRaw?: string;
  svgViewBox?: NormalizedViewBox;
  symbolScale?: number;
  svgHiddenLayers?: string[];
  svgOriginalRaw?: string;

  // Electrical metadata linkage
  electricalElementId?: string;
  connectionPoint?: { x: number; y: number }; // Normalized 0-1 connection anchor point

  // Conduit-specific properties
  controlPoint?: Point; // Quadratic Bezier control point
  /** New topology model: conduit endpoints reference connection node ids. */
  fromNodeId?: string;
  toNodeId?: string;

  fromConnectionId?: string; // Shape ID connected to start point (preferred)
  toConnectionId?: string;   // Shape ID connected to end point (preferred)
  connectedStartId?: string; // Legacy alias for fromConnectionId
  connectedEndId?: string;   // Legacy alias for toConnectionId

  // Special flags
  diagramNodeId?: string;
  diagramEdgeId?: string;
  isFrame?: boolean;

  // Project Structure
  floorId?: string;
  discipline?: 'architecture' | 'electrical';
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
  electricalElement?: ElectricalElement; // Metadata tied to the shape
  diagramNode?: DiagramNode;
  diagramEdge?: DiagramEdge;
}

export interface SerializedProject {
  layers: Layer[];
  shapes: Shape[];
  activeLayerId: string;
  electricalElements: ElectricalElement[];
  connectionNodes: ConnectionNode[];
  diagramNodes: DiagramNode[];
  diagramEdges: DiagramEdge[];
}
