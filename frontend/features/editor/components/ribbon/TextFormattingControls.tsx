import React from 'react';

import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';
import { createLogger } from '@/utils/logger';

import { TextFormatGroup } from '../../ribbon/components/TextControls';

const logger = createLogger('textFormattingControls', { minLevel: 'debug' });

export const TextFormattingControls: React.FC = () => {
  const selectionIds = useEngineSelectionIds();
  const selectedTextIds = selectionIds;

  const applyTextUpdate = (diff: any, recalcBounds: boolean) => {
    logger.debug('[TextFormattingControls] Apply update stub', { diff, recalcBounds });
    // TODO: Connect to backend or engine commands when available
  };

  return <TextFormatGroup selectedTextIds={selectedTextIds} applyTextUpdate={applyTextUpdate} />;
};
