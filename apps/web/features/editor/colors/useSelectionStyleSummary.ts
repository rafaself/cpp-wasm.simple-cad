import { useMemo } from 'react';

import { useDocumentSignal } from '@/engine/core/engineDocumentSignals';
import {
  SelectionStyleSummary,
  StyleState,
  TriState,
  type StyleTargetSummary,
} from '@/engine/core/protocol';
import { useEngineRuntime } from '@/engine/core/useEngineRuntime';

const EMPTY_TARGET: StyleTargetSummary = {
  state: StyleState.None,
  enabledState: TriState.Off,
  supportedState: TriState.Off,
  reserved: 0,
  colorRGBA: 0,
  layerId: 0,
};

const EMPTY_SUMMARY: SelectionStyleSummary = {
  selectionCount: 0,
  stroke: EMPTY_TARGET,
  fill: EMPTY_TARGET,
  textColor: EMPTY_TARGET,
  textBackground: EMPTY_TARGET,
};

export const useSelectionStyleSummary = (): SelectionStyleSummary => {
  const runtime = useEngineRuntime();
  const selectionGeneration = useDocumentSignal('selection');
  const styleGeneration = useDocumentSignal('style');

  return useMemo(() => {
    void selectionGeneration;
    void styleGeneration;
    if (!runtime) return EMPTY_SUMMARY;
    return runtime.style.getSelectionStyleSummary() ?? EMPTY_SUMMARY;
  }, [runtime, selectionGeneration, styleGeneration]);
};
