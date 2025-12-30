import React from 'react';
import { TextFormatGroup } from '../../ribbon/components/TextControls';
import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';

export const TextFormattingControls: React.FC = () => {
  const selectionIds = useEngineSelectionIds();
  const selectedTextIds = selectionIds;

  const applyTextUpdate = (diff: any, recalcBounds: boolean) => {
    console.log('[TextFormattingControls] Apply update stub:', diff, recalcBounds);
    // TODO: Connect to backend or engine commands when available
  };

  return <TextFormatGroup selectedTextIds={selectedTextIds} applyTextUpdate={applyTextUpdate} />;
};
