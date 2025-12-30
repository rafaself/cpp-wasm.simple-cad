import React from 'react';

import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';

import { TextFormatGroup } from '../../ribbon/components/TextControls';

export const TextFormattingControls: React.FC = () => {
  const selectionIds = useEngineSelectionIds();
  const selectedTextIds = selectionIds;

  const applyTextUpdate = (diff: any, recalcBounds: boolean) => {
    if (import.meta.env.DEV) {
      console.warn('[TextFormattingControls] Apply update stub:', diff, recalcBounds);
    }
    // TODO: Connect to backend or engine commands when available
  };

  return <TextFormatGroup selectedTextIds={selectedTextIds} applyTextUpdate={applyTextUpdate} />;
};
