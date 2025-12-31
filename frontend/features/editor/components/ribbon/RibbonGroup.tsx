import React from 'react';

import { RibbonGroup as RibbonGroupType, RibbonItem } from '../../ui/ribbonConfig';

import { RibbonButton } from './RibbonButton';

interface RibbonGroupProps {
  group: RibbonGroupType;
  activeTool: string;
  activeActions?: Record<string, boolean>;
  onItemClick: (item: RibbonItem) => void;
}

export const RibbonGroup: React.FC<RibbonGroupProps> = ({
  group,
  activeTool,
  activeActions = {},
  onItemClick,
}) => {
  return (
    <div className="flex flex-col h-full gap-1">
      <div
        role="group"
        aria-label={group.label || group.id}
        className={`flex justify-center flex-1
          ${group.layout === 'grid-2x3' ? 'grid grid-cols-3 gap-1 content-center items-center' : ''}
          ${group.layout === 'stack' ? 'flex flex-col gap-1 justify-center' : ''}
          ${!group.layout || group.layout === 'flex-row' ? 'flex items-stretch gap-1' : ''}
        `}
      >
        {group.items.map((item, index) => {
          if (item.kind === 'custom' && item.componentType) {
            const Component = item.componentType;
            return (
              <React.Fragment key={item.id}>
                <Component />
              </React.Fragment>
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
            />
          );
        })}
      </div>

      {/* Group Title */}
      <div className="flex items-center justify-center">
        <span className="text-[10px] text-text-muted font-semibold select-none whitespace-nowrap text-center uppercase tracking-wider opacity-80 leading-none">
          {group.label}
        </span>
      </div>
    </div>
  );
};
