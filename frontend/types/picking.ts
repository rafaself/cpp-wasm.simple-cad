// Matching C++ enums in cpp/engine/pick_system.h

export enum PickSubTarget {
  None = 0,
  Body = 1,
  Edge = 2,
  Vertex = 3,
  ResizeHandle = 4,
  RotateHandle = 5,
  TextBody = 6,
  TextCaret = 7
}

export enum PickEntityKind {
  Unknown = 0,
  Rect = 1,
  Circle = 2,
  Line = 3,
  Polyline = 4,
  Polygon = 5,
  Arrow = 6,
  Text = 7
}

export interface PickResult {
  id: number;          // 0 = miss
  kind: PickEntityKind;
  subTarget: PickSubTarget;
  subIndex: number;     // -1 if N/A
  distance: number;     // Infinity for miss
  hitX?: number;        // Optional, not always populated by fallback
  hitY?: number;
}
