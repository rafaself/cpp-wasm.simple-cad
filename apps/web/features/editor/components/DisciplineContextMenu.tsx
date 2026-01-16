import { Import } from 'lucide-react';
import React, { useRef, useEffect } from 'react';

interface DisciplineContextMenuProps {
  floorId: string;

  position: { x: number; y: number };
  onClose: () => void;
  onImportPdf?: () => void;
  onImportDxf?: () => void;
}

const DisciplineContextMenu: React.FC<DisciplineContextMenuProps> = ({
  floorId,

  position,
  onClose,
  onImportPdf,
  onImportDxf,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-surface-2 border border-border rounded-md shadow-lg py-1 w-48 text-xs text-text"
      style={{ top: position.y, left: position.x }}
    >
      <div className="px-3 py-2 border-b border-border font-bold text-text-muted bg-surface-2">
        Arquitetura ({floorId === 'terreo' ? 'Térreo' : floorId})
      </div>

      {onImportPdf && (
        <button
          className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2"
          onClick={() => {
            onImportPdf();
            onClose();
          }}
        >
          <Import size={14} />
          <span>Importar Planta (PDF/SVG)</span>
        </button>
      )}

      {onImportDxf && (
        <button
          className="w-full text-left px-3 py-2 hover:bg-surface-2 flex items-center gap-2"
          onClick={() => {
            onImportDxf();
            onClose();
          }}
        >
          <Import size={14} />
          <span>Importar Planta (DXF)</span>
        </button>
      )}
    </div>
  );
};

export default DisciplineContextMenu;
