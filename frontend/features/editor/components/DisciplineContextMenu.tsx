import React, { useRef, useEffect } from 'react';
import { Layers, Import, Eye, EyeOff } from 'lucide-react';
import { useUIStore } from '../../../stores/useUIStore';

interface DisciplineContextMenuProps {
  floorId: string;
  discipline: 'architecture' | 'electrical';
  position: { x: number; y: number };
  onClose: () => void;
  onImportPdf?: () => void;
  onImportImage?: () => void;
  onImportDxf?: () => void;
}

const DisciplineContextMenu: React.FC<DisciplineContextMenuProps> = ({
  floorId,
  discipline,
  position,
  onClose,
  onImportPdf,
  onImportImage,
  onImportDxf
}) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const allReferences = useUIStore(s => s.referencedDisciplines);
  const referencedDisciplines = (allReferences instanceof Map ? allReferences.get(floorId) : null) || new Set();
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
  // For 'architecture', we don't reference anything in this context menu.
  // For 'electrical', we can reference 'architecture'.
  const availableReferences: ('architecture' | 'electrical')[] = [];
  if (discipline === 'electrical') {
      availableReferences.push('architecture');
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white border border-slate-200 rounded-md shadow-lg py-1 w-48 text-xs text-slate-700"
      style={{ top: position.y, left: position.x }}
    >
      <div className="px-3 py-2 border-b border-slate-100 font-bold text-slate-500 bg-slate-50">
        {discipline === 'architecture' ? 'Arquitetura' : 'Elétrica'} ({floorId === 'terreo' ? 'Térreo' : floorId})
      </div>

      {discipline === 'architecture' && (
        <>
            {onImportPdf && (
                <button
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                    onClick={() => {
                        onImportPdf();
                        onClose();
                    }}
                >
                    <Import size={14} />
                    <span>Importar Planta (PDF/SVG)</span>
                </button>
            )}
            {onImportImage && (
                <button
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                    onClick={() => {
                        onImportImage();
                        onClose();
                    }}
                >
                    <Import size={14} />
                    <span>Importar Imagem (PNG/JPG)</span>
                </button>
            )}
            {onImportDxf && (
                <button
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2"
                    onClick={() => {
                        onImportDxf();
                        onClose();
                    }}
                >
                    <Import size={14} />
                    <span>Importar DWG / DXF</span>
                </button>
            )}
        </>
      )}

      {availableReferences.length > 0 && (
        <>
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
                          toggleReference(floorId, ref);
                          onClose();
                      }}
                  >
                      {isReferenced ? <Eye size={14} className="text-blue-500" /> : <EyeOff size={14} className="text-slate-400" />}
                      <span>
                          Referenciar {ref === 'architecture' ? 'Arquitetura' : 'Elétrica'}
                      </span>
                  </button>
                );
            })}
        </>
      )}
    </div>
  );
};

export default DisciplineContextMenu;
