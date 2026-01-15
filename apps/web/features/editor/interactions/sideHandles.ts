export enum SideHandleType {
  N = 'n',
  E = 'e',
  S = 's',
  W = 'w',
}

export const SIDE_HANDLE_Cursor: Record<SideHandleType, string> = {
  [SideHandleType.N]: 'ns-resize',
  [SideHandleType.S]: 'ns-resize',
  [SideHandleType.E]: 'ew-resize',
  [SideHandleType.W]: 'ew-resize',
};

// Indices for hit testing (arbitrary, but distinct from 0-3 corners)
export const SIDE_HANDLE_INDICES = {
  N: 4,
  E: 5,
  S: 6,
  W: 7,
};

/**
 * Convert SideHandleType to engine side index
 * Engine uses: 0=S (South/Bottom), 1=E (East/Right), 2=N (North/Top), 3=W (West/Left)
 */
export const SIDE_HANDLE_TO_ENGINE_INDEX: Record<SideHandleType, number> = {
  [SideHandleType.S]: 0,
  [SideHandleType.E]: 1,
  [SideHandleType.N]: 2,
  [SideHandleType.W]: 3,
};
