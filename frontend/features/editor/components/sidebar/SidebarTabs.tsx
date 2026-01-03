import { LucideIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import React, { useRef, useState, useCallback } from 'react';

import { useSettingsStore } from '@/stores/useSettingsStore';

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
  const [scrollLeftState, setScrollLeftState] = useState(0); // Renamed to avoid confusion with scrollLeft property
  const [hasMoved, setHasMoved] = useState(false);
  const [wasDragging, setWasDragging] = useState(false);

  const showIndicators = useSettingsStore((s) => s.display.showSidebarScrollIndicators);

  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const checkOverflow = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    
    // Use a small threshold (e.g. 1px) to avoid precision issues
    setShowLeftArrow(scrollLeft > 1);
    setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  React.useEffect(() => {
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [checkOverflow, tabs]); // Re-check if tabs change

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    setIsDragging(true);
    setHasMoved(false);
    setWasDragging(false);
    setStartX(e.pageX - containerRef.current.offsetLeft);
    setScrollLeftState(containerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHasMoved(false);
  };

  const handleMouseUp = () => {
    if (hasMoved) {
      setWasDragging(true);
      setTimeout(() => setWasDragging(false), 50);
    }
    setIsDragging(false);
    setHasMoved(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    e.preventDefault();
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; 
    
    if (Math.abs(x - (startX + scrollLeftState)) > 3) {
      setHasMoved(true);
    }
    
    containerRef.current.scrollLeft = scrollLeftState - walk;
    // We don't checkOverflow here continuously to avoid trash, 
    // but onScroll will handle update visually. 
    // Actually dragging modifies scrollLeft which triggers onScroll.
  };

  const handleTabClick = (tabId: string) => {
    if (!hasMoved && !wasDragging) {
      onTabChange(tabId);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (containerRef.current) {
      containerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Triggered by both wheel, drag, and button scroll
  const handleScroll = () => {
    checkOverflow();
  };

  const scrollByAmount = (amount: number) => {
    if (containerRef.current) {
      containerRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  return (
    <div 
      className="relative flex bg-surface1 select-none group"
      style={{ height: '56px' }}
    >
      {/* Left Overflow Button */}
      {showIndicators && showLeftArrow && (
        <button
          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-surface1/90 shadow-md border border-border/90 text-text-muted hover:text-text flex items-center justify-center transition-opacity"
          onClick={(e) => { e.stopPropagation(); scrollByAmount(-100); }}
          title="Rolar para esquerda"
          aria-hidden="true"
        >
          <ChevronLeft size={14} />
        </button>
      )}

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`flex overflow-x-auto items-center no-scrollbar px-1 ${
          !isDragging ? 'scroll-smooth' : ''
        } ${hasMoved ? 'cursor-grabbing' : 'cursor-pointer'}`}
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
                  ? 'bg-primary/20 text-text active-tab-shadow' 
                  : 'text-text-muted hover:bg-surface2 hover:text-text'
                }
              `}
              title={tab.label}
              draggable={false}
            >
              <Icon size={18} className="text-current" />
              <span className="text-[9px] font-medium leading-normal pb-0.5 max-w-[56px] truncate text-center">
                {tab.label}
              </span>
            </div>
          );
        })}
        {/* Spacer */}
        <div className="min-w-[4px] flex-shrink-0" />
      </div>

       {/* Right Overflow Button */}
       {showIndicators && showRightArrow && (
        <button
          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-6 h-6 rounded-full bg-surface1/90 shadow-md border border-border/90 text-text-muted hover:text-text flex items-center justify-center transition-opacity"
          onClick={(e) => { e.stopPropagation(); scrollByAmount(100); }}
          title="Rolar para direita"
          aria-hidden="true"
        >
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
};

export default SidebarTabs;
