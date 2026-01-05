import { useCallback, useEffect, useState } from 'react';

import { ChangeMask, EventType, SelectionStyleState, StyleSource } from '@/engine/core/protocol';
import { useEngineEvents } from '@/engine/core/useEngineEvents';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';
import { useUIStore } from '@/stores/useUIStore';

export interface StyleController {
  state: SelectionStyleState;
  setStrokeColor: (r: number, g: number, b: number, a: number) => void;
  setFillColor: (r: number, g: number, b: number, a: number) => void;
  setFillEnabled: (enabled: boolean) => void;
  clearStrokeOverride: () => void;
  clearFillOverride: () => void;
}

const DEFAULT_STYLE: SelectionStyleState = {
  strokeSource: StyleSource.ByLayer,
  fillSource: StyleSource.ByLayer,
  commonStrokeR: 0,
  commonStrokeG: 0,
  commonStrokeB: 0,
  commonStrokeA: 1,
  commonFillR: 0,
  commonFillG: 0,
  commonFillB: 0,
  commonFillA: 0,
  hasMixedStrokeColor: false,
  hasMixedFillColor: false,
};

export const useSelectionStyle = (): StyleController => {
  const runtime = useEngineRuntime();
  const [styleState, setStyleState] = useState<SelectionStyleState>(DEFAULT_STYLE);

  // We need to refresh when:
  // 1. Selection changes (IDs change)
  // 2. Selected entities change (Style/Geometry/Layer)
  // 3. Layer properties change (if Inherited)
  // 4. Undo/Redo happens

  const refresh = useCallback(() => {
    if (!runtime) return;
    const s = runtime.getSelectionStyleState();
    setStyleState(s);
  }, [runtime]);

  useEngineEvents(
    useCallback((event) => {
      // Filter relevant events
      if (
        event.type === EventType.SelectionChanged ||
        event.type === EventType.HistoryChanged ||
        (event.type === EventType.EntityChanged && (event.flags & ChangeMask.Style || event.flags & ChangeMask.Layer)) ||
        (event.type === EventType.LayerChanged)
      ) {
        refresh();
      }
    }, [refresh])
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setStrokeColor = useCallback((r: number, g: number, b: number, a: number) => {
    if (!runtime) return;
    const ids = Array.from(runtime.getSelectionIds());
    if (ids.length > 0) {
      runtime.setEntityOverride(ids, true, r, g, b, a);
    } else {
      // TODO: Handle Tool Defaults or Layer Defaults
      // For MVP, handling Selection or Layer
      // Priority: Selection > Tool > Layer
      // If no selection, update active layer?
      // Spec says: 1) Selection 2) Tool 3) Layer
      // Since we don't have tool state here, let's just do selection or layer.
      // But wait, Layer update needs different API.
      // For now, this hook focuses on Selection.
      // The Logic for "What to target" should probably be in the UI handler, not this hook?
      // Or this hook manages the state of the "Color Picker" which reflects selection.
      // If selection is empty, it should reflect Layer/Tool.

      // Actually, if IDs empty, we should update Active Layer default?
      // Assuming UI passes that intent.
      // Let's implement generic helpers here.
    }
  }, [runtime]);

  const setFillColor = useCallback((r: number, g: number, b: number, a: number) => {
    if (!runtime) return;
    const ids = Array.from(runtime.getSelectionIds());
    if (ids.length > 0) {
      runtime.setEntityOverride(ids, false, r, g, b, a);
    }
  }, [runtime]);

  const setFillEnabled = useCallback((enabled: boolean) => {
    if (!runtime) return;
    const ids = Array.from(runtime.getSelectionIds());
    if (ids.length > 0) {
      runtime.setFillEnabled(ids, enabled);
    }
  }, [runtime]);

  const clearStrokeOverride = useCallback(() => {
    if (!runtime) return;
    const ids = Array.from(runtime.getSelectionIds());
    if (ids.length > 0) {
      runtime.clearEntityOverride(ids, true);
    }
  }, [runtime]);

  const clearFillOverride = useCallback(() => {
    if (!runtime) return;
    const ids = Array.from(runtime.getSelectionIds());
    if (ids.length > 0) {
      runtime.clearEntityOverride(ids, false);
    }
  }, [runtime]);

  return {
    state: styleState,
    setStrokeColor,
    setFillColor,
    setFillEnabled,
    clearStrokeOverride,
    clearFillOverride
  };
};
