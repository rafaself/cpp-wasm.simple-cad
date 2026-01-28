import { PickEntityKind, PickSubTarget, type PickResult } from '@/types/picking';

export const isLineOrArrow = (kind: PickEntityKind): boolean =>
  kind === PickEntityKind.Line || kind === PickEntityKind.Arrow;

export const supportsSideHandles = (kind: PickEntityKind): boolean =>
  kind !== PickEntityKind.Line &&
  kind !== PickEntityKind.Arrow &&
  kind !== PickEntityKind.Polyline &&
  kind !== PickEntityKind.Text;

export const SIDE_SUBINDEX_TO_ENGINE_INDEX: Record<number, number> = {
  4: 2, // N
  5: 1, // E
  6: 0, // S
  7: 3, // W
};

export const EMPTY_PICK_RESULT: PickResult = {
  id: 0,
  kind: PickEntityKind.Unknown,
  subTarget: PickSubTarget.None,
  subIndex: -1,
  distance: Infinity,
};
