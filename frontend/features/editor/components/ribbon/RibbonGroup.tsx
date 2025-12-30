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
    <div className="flex flex-col h-full gap-1.5">
      <div 
        role="group"
        aria-label={group.label || group.id}
        className={`flex justify-center
          ${group.layout === 'grid-2x3' ? 'grid grid-cols-3 gap-[6px] content-start' : ''}
          ${group.layout === 'stack' ? 'flex flex-col gap-[6px]' : ''}
          ${!group.layout || group.layout === 'flex-row' ? 'flex items-start gap-[6px]' : ''}
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
      
      {/* Group Title */}
      <div className="flex items-center justify-center">
        <span className="text-[10px] text-slate-500 font-semibold select-none whitespace-nowrap text-center uppercase tracking-wider opacity-80 leading-none">
          {group.label}
        </span>
      </div>
    </div>
  );
};
