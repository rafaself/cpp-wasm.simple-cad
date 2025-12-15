import React, { useState, useEffect } from 'react';
import { X, Grid3X3, Magnet, Ruler, Keyboard } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import SettingsSidebar from './SettingsSidebar';
import CanvasSettings from './sections/CanvasSettings';
import SnappingSettings from './sections/SnappingSettings';
import DocumentSettings from './sections/DocumentSettings';
import { ShortcutsSettings } from './sections/ShortcutsSettings';

export type SettingsSection = 'document' | 'canvas' | 'snapping' | 'shortcuts';

const SettingsModal: React.FC = () => {
  const isOpen = useUIStore(s => s.isSettingsModalOpen);
  const setOpen = useUIStore(s => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] = useState<SettingsSection>('document');

  useEffect(() => {
    if (isOpen) {
      setActiveSection('document');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sections = [
    { id: 'document' as const, label: 'Documento', icon: Ruler },
    { id: 'canvas' as const, label: 'Canvas', icon: Grid3X3 },
    { id: 'snapping' as const, label: 'Snapping', icon: Magnet },
    { id: 'shortcuts' as const, label: 'Atalhos', icon: Keyboard },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'document':
        return <DocumentSettings />;
      case 'canvas':
        return <CanvasSettings />;
      case 'snapping':
        return <SnappingSettings />;
      case 'shortcuts':
        return <ShortcutsSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[700px] h-[500px] flex flex-col text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-base">Configuracoes</h2>
          <button 
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          <SettingsSidebar 
            sections={sections}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />
          
          <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-700 flex justify-end gap-2">
          <button 
            onClick={() => setOpen(false)}
            className="px-4 py-1.5 rounded text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-300"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
