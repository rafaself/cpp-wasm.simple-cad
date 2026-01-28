import { SelectionMode } from '@/engine/core/EngineRuntime';
import { PickSubTarget, type PickResult } from '@/types/picking';
import { cadDebugLog } from '@/utils/dev/cadDebug';

import type { EngineRuntime } from '../../types';

type CycleState = {
  key: string;
  baseSelection: Set<number>;
  lastAddedId: number | null;
  index: number;
} | null;

export class SelectionCycleController {
  private cycleState: CycleState = null;

  reset(): void {
    this.cycleState = null;
  }

  handleCtrlCycle(
    runtime: EngineRuntime,
    pick: PickResult,
    worldX: number,
    worldY: number,
    tolerance: number,
    shiftKey: boolean,
  ): boolean {
    const candidateIds = this.collectCycleCandidateIds(runtime, worldX, worldY, tolerance);
    if (candidateIds.length < 2) {
      this.reset();
      return false;
    }

    const key = candidateIds.join(',');
    const selectionIds = runtime.getSelectionIds();
    if (!this.cycleState || this.cycleState.key !== key) {
      this.cycleState = {
        key,
        baseSelection: new Set(selectionIds),
        lastAddedId: null,
        index: 0,
      };
    } else {
      this.cycleState.index = (this.cycleState.index + 1) % candidateIds.length;
    }

    const chosenId = candidateIds[this.cycleState.index] ?? pick.id;
    const lastAddedId = this.cycleState.lastAddedId;
    if (
      lastAddedId !== null &&
      lastAddedId !== chosenId &&
      !this.cycleState.baseSelection.has(lastAddedId)
    ) {
      runtime.setSelection([lastAddedId], SelectionMode.Remove);
    }

    const mode = shiftKey ? SelectionMode.Toggle : SelectionMode.Add;
    runtime.setSelection([chosenId], mode);
    this.cycleState.lastAddedId = chosenId;

    cadDebugLog('selection', 'cycle', () => ({
      key,
      chosenId,
      index: this.cycleState?.index ?? 0,
      candidates: candidateIds,
    }));
    return true;
  }

  private collectCycleCandidateIds(
    runtime: EngineRuntime,
    worldX: number,
    worldY: number,
    tolerance: number,
  ): number[] {
    const candidates = runtime.pickCandidates(worldX, worldY, tolerance, 0xff);
    if (candidates.length === 0) return [];

    const seen = new Set<number>();
    const ids: number[] = [];
    for (const candidate of candidates) {
      if (candidate.id === 0) continue;
      if (
        candidate.subTarget === PickSubTarget.ResizeHandle ||
        candidate.subTarget === PickSubTarget.RotateHandle
      ) {
        continue;
      }
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      ids.push(candidate.id);
    }
    return ids;
  }
}

