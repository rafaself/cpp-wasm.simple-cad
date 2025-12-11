import React, { useState, useEffect } from 'react';
import { X, Grid3X3 } from 'lucide-react';
import { useUIStore } from '../../stores/useUIStore';
import SettingsSidebar from './SettingsSidebar';
import CanvasSettings from './sections/CanvasSettings';

export type SettingsSection = 'canvas';

const SettingsModal: React.FC = () => {
  const isOpen = useUIStore(s => s.isSettingsModalOpen);
  const setOpen = useUIStore(s => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] = useState<SettingsSection>('canvas');

  // Reset to first section when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveSection('canvas');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sections = [
    { id: 'canvas' as const, label: 'Canvas', icon: Grid3X3 },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'canvas':
        return <CanvasSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
      <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-xl w-[700px] h-[500px] flex flex-col text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <h2 className="font-semibold text-base">Configurações</h2>
          <button 
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-700"
          >
            <X size={18} />
          </button>
        </div>
        
        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <SettingsSidebar 
            sections={sections}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {renderContent()}
          </div>
        </div>

        {/* Footer */}
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
