import { LucideIcon } from 'lucide-react';
import React, { useRef, useState, useCallback } from 'react';

export interface SidebarTabConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  component: React.ReactNode;
}

interface SidebarTabsProps {
  tabs: SidebarTabConfig[];
  activeTabId: string;
  onTabChange: (id: string) => void;
}

const SidebarTabs: React.FC<SidebarTabsProps> = ({ tabs, activeTabId, onTabChange }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hasMoved, setHasMoved] = useState(false); // To distinguish click from drag

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setHasMoved(false);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeft(containerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHasMoved(false);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setHasMoved(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // Scroll speed multiplier
    
    // Check if moved significantly to consider it a drag
    if (Math.abs(walk) > 5) {
      setHasMoved(true);
    }
    
    containerRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleTabClick = (tabId: string) => {
    if (!hasMoved) {
      onTabChange(tabId);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (containerRef.current) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div 
      className="flex border-t border-border bg-surface1 select-none"
      style={{ height: '56px' }} // Reduced fixed height
    >
      <div
        ref={containerRef}
        className={`flex overflow-x-auto items-center no-scrollbar px-1 ${
          hasMoved ? 'cursor-grabbing' : 'cursor-pointer'
        }`}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const Icon = tab.icon;
          
          return (
            <div
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`
                flex-shrink-0 flex flex-col items-center justify-center gap-1
                min-w-[60px] h-[48px] rounded-md transition-colors
                ${isActive 
                  ? 'bg-primary/10 text-text' 
                  : 'text-text-muted hover:bg-surface2 hover:text-text'
                }
              `}
              title={tab.label}
              draggable={false}
            >
              <Icon size={18} className="text-current" />
              <span className="text-[9px] font-medium leading-none max-w-[56px] truncate text-center">
                {tab.label}
              </span>
            </div>
          );
        })}
        {/* Spacer */}
        <div className="min-w-[4px] flex-shrink-0" />
      </div>
    </div>
  );
};

export default SidebarTabs;
