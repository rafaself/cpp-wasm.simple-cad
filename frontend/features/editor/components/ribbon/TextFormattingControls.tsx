import React from 'react';

import {
  applyFontFamilyUpdate,
  applyFontSizeUpdate,
  applyStyleFlagUpdate,
  applyTextAlignUpdate,
} from '@/features/editor/text/textStyleActions';
import { useEngineSelectionIds } from '@/engine/core/useEngineSelection';
import { createLogger } from '@/utils/logger';
import { TextStyleFlags } from '@/types/text';

import { TextFormatGroup } from '../../ribbon/components/TextControls';

const logger = createLogger('textFormattingControls', { minLevel: 'debug' });

export const TextFormattingControls: React.FC = () => {
  const selectionIds = useEngineSelectionIds();
  const selectedTextIds = selectionIds;

  const applyTextUpdate = async (diff: any, _recalcBounds?: boolean) => {
    logger.debug('[TextFormattingControls] applyTextUpdate', { diff, selectedTextIds });
    if (diff.fontFamily) {
      await applyFontFamilyUpdate(diff.fontFamily, selectedTextIds);
    }
    if (diff.fontSize !== undefined) {
      await applyFontSizeUpdate(diff.fontSize, selectedTextIds);
    }
    if (diff.align) {
      await applyTextAlignUpdate(diff.align, selectedTextIds);
    }
    if (diff.bold !== undefined) {
      await applyStyleFlagUpdate(
        TextStyleFlags.Bold,
        diff.bold ? 'set' : 'clear',
        selectedTextIds,
      );
    }
    if (diff.italic !== undefined) {
      await applyStyleFlagUpdate(
        TextStyleFlags.Italic,
        diff.italic ? 'set' : 'clear',
        selectedTextIds,
      );
    }
    if (diff.underline !== undefined) {
      await applyStyleFlagUpdate(
        TextStyleFlags.Underline,
        diff.underline ? 'set' : 'clear',
        selectedTextIds,
      );
    }
    if (diff.strike !== undefined) {
      await applyStyleFlagUpdate(
        TextStyleFlags.Strikethrough,
        diff.strike ? 'set' : 'clear',
        selectedTextIds,
      );
    }
  };

  return <TextFormatGroup selectedTextIds={selectedTextIds} applyTextUpdate={applyTextUpdate} />;
};
