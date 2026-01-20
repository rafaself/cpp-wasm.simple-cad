import React from 'react';

import { RibbonGroup as RibbonGroupType, RibbonItem } from '../../ui/ribbonConfig';

import { RibbonButton } from './RibbonButton';
import { isRibbonDebugEnabled } from './ribbonDebug';

type RibbonLayout = NonNullable<RibbonGroupType['layout']>;

const LAYOUT_CLASSES: Record<RibbonLayout, string> = {
  'flex-row': 'ribbon-flex-row',
  'grid-2x3': 'ribbon-grid-2x3',
  stack: 'ribbon-stack',
};

const RibbonGroupContent: React.FC<{
  layout?: RibbonGroupType['layout'];
  ariaLabel: string;
  children: React.ReactNode;
}> = ({ layout, ariaLabel, children }) => {
  const effectiveLayout: RibbonLayout = (layout ?? 'flex-row') as RibbonLayout;
  return (
    <div className="ribbon-group-body w-full shrink-0 overflow-hidden rounded-none">
      <div
        role="group"
        aria-label={ariaLabel}
        className={`h-full w-full ${LAYOUT_CLASSES[effectiveLayout]}`}
      >
        {children}
      </div>
    </div>
  );
};

const RibbonGroupTitle: React.FC<{ label: string }> = ({ label }) => (
  <div className="ribbon-group-label">
    <span className="text-text-muted opacity-80 leading-[18px] select-none whitespace-nowrap uppercase tracking-wider font-semibold">
      {label}
    </span>
  </div>
);

interface RibbonGroupProps {
  group: RibbonGroupType;
  activeTool: string;
  activeActions?: Record<string, boolean>;
  onItemClick: (item: RibbonItem) => void;
  tabId: string;
}

export const RibbonGroup: React.FC<RibbonGroupProps> = ({
  group,
  activeTool,
  activeActions = {},
  onItemClick,
  tabId,
}) => {
  const displayLabel = group.label || group.id;
  const debugMode = isRibbonDebugEnabled();
  const rootClass = `ribbon-group flex flex-col h-full gap-0 shrink-0${
    debugMode ? ' ribbon-debug-group' : ''
  }`;
  return (
    <div className={rootClass}>
      <RibbonGroupContent layout={group.layout} ariaLabel={displayLabel}>
        {group.items.map((item) => {
          if (item.kind === 'custom' && item.componentType) {
            const Component = item.componentType;
            const wrapperClass = `h-full flex items-center shrink-0${
              debugMode ? ' ribbon-debug-control' : ''
            }`;
            return (
              <div key={item.id} className={wrapperClass}>
                <Component />
              </div>
            );
          }
          const isActive =
            (item.kind === 'tool' && activeTool === item.toolId) ||
            (item.kind === 'action' && item.actionId && activeActions[item.actionId]);

          return (
            <RibbonButton
              key={item.id}
              item={item}
              layout={group.layout}
              isActive={!!isActive}
              onClick={onItemClick}
              tabId={tabId}
              groupId={group.id}
            />
          );
        })}
      </RibbonGroupContent>
      <RibbonGroupTitle label={displayLabel} />
    </div>
  );
};
