import { Link2, Slash, Unlock } from 'lucide-react';
import React from 'react';

import { LABELS } from '@/i18n/labels';

import type { ColorStateIndicator } from './colorState';

const renderIndicatorIcon = (indicator: ColorStateIndicator) => {
  switch (indicator.kind) {
    case 'layer':
      return <Link2 size={12} />;
    case 'override':
      return <Unlock size={12} />;
    case 'none':
      return <Slash size={12} />;
    case 'mixed':
      return <span className="text-[10px]">{LABELS.text.mixed}</span>;
    default:
      return null;
  }
};

export const ColorStateBadge: React.FC<{
  indicator: ColorStateIndicator | null;
  onRestore?: () => void;
}> = ({ indicator, onRestore }) => {
  if (!indicator) return null;

  const isOverride = indicator.kind === 'override';
  const canRestore = isOverride && onRestore;

  const content = (
    <span
      className={`flex items-center justify-center text-text-muted ${
        canRestore ? 'cursor-pointer hover:text-text hover:bg-surface2 rounded p-0.5' : ''
      }`}
      title={indicator.tooltip}
      aria-label={indicator.tooltip}
      onClick={(e) => {
        if (canRestore) {
          e.stopPropagation();
          onRestore();
        }
      }}
    >
      {renderIndicatorIcon(indicator)}
    </span>
  );

  return content;
};
