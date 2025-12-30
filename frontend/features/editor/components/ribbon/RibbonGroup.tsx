import React from 'react';
import { RibbonGroup as RibbonGroupType, RibbonItem } from '../../ui/ribbonConfig';
import { RibbonButton } from './RibbonButton';

interface RibbonGroupProps {
  group: RibbonGroupType;
  activeTool: string;
  onItemClick: (item: RibbonItem) => void;
}

export const RibbonGroup: React.FC<RibbonGroupProps> = ({
  group,
  activeTool,
  onItemClick,
}) => {
  return (
    <div 
      role="group"
      aria-label={group.id}
      className={`
      ${group.layout === 'grid-2x3' ? 'grid grid-cols-3 gap-[6px]' : ''}
      ${group.layout === 'stack' ? 'flex flex-col gap-[6px]' : ''}
      ${!group.layout || group.layout === 'flex-row' ? 'flex items-center gap-[6px] h-full' : ''}
    `}>
      {group.items.map((item, index) => {
        if (item.kind === 'custom' && item.componentType) {
          const Component = item.componentType;
          return <React.Fragment key={item.id}><Component /></React.Fragment>;
        }
        return (
          <RibbonButton
            key={item.id}
            item={item}
            layout={group.layout}
            isActive={item.kind === 'tool' && activeTool === item.toolId}
            onClick={onItemClick}
          />
        );
      })}
    </div>
  );
};
