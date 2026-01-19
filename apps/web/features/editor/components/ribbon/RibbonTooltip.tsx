import React from 'react';

import { Tooltip } from '@/components/ui/Tooltip';

import { RibbonItem } from '../../ui/ribbonConfig';

import { getTooltipData } from './ribbonUtils';

interface RibbonTooltipProps {
  item: RibbonItem;
  children: React.ReactNode;
}

export const RibbonTooltip: React.FC<RibbonTooltipProps> = ({ item, children }) => {
  const { label, shortcut, description } = getTooltipData(item);

  const content = (
    <div className="ribbon-tooltip-content">
      <div className="ribbon-tooltip-title">
        <span>{label}</span>
        {shortcut ? <span className="ribbon-tooltip-shortcut">{shortcut}</span> : null}
      </div>
      {description ? <div className="ribbon-tooltip-description">{description}</div> : null}
    </div>
  );

  return (
    <Tooltip content={content} className="ribbon-tooltip">
      {children}
    </Tooltip>
  );
};

export default RibbonTooltip;
