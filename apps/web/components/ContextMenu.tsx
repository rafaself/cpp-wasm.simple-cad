import React, { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  items: ContextMenuItem[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ isOpen, position, onClose, items }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, handleClickOutside]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="absolute bg-surface1 border border-border rounded-md shadow-lg z-dropdown py-1"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          onClick={() => {
            item.onClick();
            onClose();
          }}
          disabled={item.disabled}
          className={`block w-full text-left px-4 py-2 text-sm text-text hover:bg-primary hover:text-primary-contrast transition-colors
                      ${item.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default ContextMenu;
