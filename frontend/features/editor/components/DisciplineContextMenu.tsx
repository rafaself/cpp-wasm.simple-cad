import React, { useRef, useEffect } from 'react';
import { Layers, Import, Eye, EyeOff } from 'lucide-react';
import { useUIStore } from '../../../../stores/useUIStore';

interface DisciplineContextMenuProps {
  discipline: 'architecture' | 'electrical';
  position: { x: number; y: number };
  onClose: () => void;
  onImport?: () => void;
}

const DisciplineContextMenu: React.FC<DisciplineContextMenuProps> = ({
  discipline,
  position,
  onClose,
  onImport
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const referencedDisciplines = useUIStore(s => s.referencedDisciplines);
  const toggleReference = useUIStore(s => s.toggleReference);
  const activeDiscipline = useUIStore(s => s.activeDiscipline);

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

  // Determine potential references (other disciplines)
  // In a real app this would be dynamic. For now we know only 'architecture' and 'electrical' exist.
  const availableReferences = ['architecture', 'electrical'].filter(d => d !== discipline);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-lg py-1 w-48 text-xs text-slate-700"
      style={{ top: position.y, left: position.x }}
    >
      <div className="px-3 py-2 border-b border-slate-100 font-bold text-slate-500 bg-slate-50">
        {discipline === 'architecture' ? 'Arquitetura' : 'Elétrica'}
      </div>

      {/* Import Option (Only for Architecture usually, or generic) */}
      <button
        className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
        onClick={() => {
            if (onImport) onImport();
            onClose();
        }}
      >
        <Import size={14} />
        <span>Importar Planta/Referência</span>
      </button>

      <div className="h-px bg-slate-100 my-1" />

      <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase">
        Referências Visuais
      </div>

      {availableReferences.map(ref => {
          const isReferenced = referencedDisciplines.has(ref);
          return (
            <button
                key={ref}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                onClick={() => {
                    toggleReference(ref);
                    // Don't close immediately to allow multiple toggles? Or close?
                    // Usually context menus close.
                    onClose();
                }}
            >
                {isReferenced ? <Eye size={14} className="text-blue-500" /> : <EyeOff size={14} className="text-slate-400" />}
                <span>
                    {ref === 'architecture' ? 'Arquitetura' : 'Elétrica'}
                </span>
            </button>
          );
      })}
    </div>
  );
};

export default DisciplineContextMenu;
