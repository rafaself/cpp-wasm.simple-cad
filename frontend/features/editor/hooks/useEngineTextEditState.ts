import { useMemo } from 'react';

import { useUIStore } from '@/stores/useUIStore';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { TextStyleSnapshot } from '@/types/text';

export interface EngineTextData {
  content: string;
  caretIndex: number;
  selectionStart: number;
  selectionEnd: number;
}

export function useEngineTextEditState(runtime: EngineRuntime | null): EngineTextData {
  const { active, textId, editGeneration } = useUIStore((s) => s.engineTextEditState);

  return useMemo(() => {
    if (!active || textId === null || !runtime) {
      return { content: '', caretIndex: 0, selectionStart: 0, selectionEnd: 0 };
    }

    // 1. Get Content (Engine as Source of Truth)
    const content = runtime.getTextContent(textId) ?? '';

    // 2. Get Selection/Caret (Engine as Source of Truth)
    let caretIndex = 0;
    let selectionStart = 0;
    let selectionEnd = 0;

    const snapshot = runtime.text.getTextStyleSnapshot(textId);
    if (snapshot) {
      // Use Logical indices (characters) which are compute by Engine's utf8 helper
      caretIndex = snapshot.caretLogical;
      selectionStart = snapshot.selectionStartLogical;
      selectionEnd = snapshot.selectionEndLogical;
    }

    return {
      content,
      caretIndex,
      selectionStart,
      selectionEnd,
    };
  }, [active, textId, editGeneration, runtime]);
}
