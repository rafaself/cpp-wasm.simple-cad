import { X, Grid3X3, Magnet, Keyboard, Briefcase, LayoutTemplate, Terminal } from 'lucide-react';
import React, { useState } from 'react';

import { Dialog, Button } from '@/components/ui';

import { useUIStore } from '../../stores/useUIStore';

import CanvasSettings from './sections/CanvasSettings';
import DeveloperSettings from './sections/DeveloperSettings';
import InterfaceSettings from './sections/InterfaceSettings';
import ProjectSettings from './sections/ProjectSettings';
import { ShortcutsSettings } from './sections/ShortcutsSettings';
import SnappingSettings from './sections/SnappingSettings';
import SettingsSidebar from './SettingsSidebar';

export type SettingsSection =
  | 'canvas'
  | 'snapping'
  | 'shortcuts'
  | 'project'
  | 'interface'
  | 'developer';

const SettingsModal: React.FC = () => {
  const isOpen = useUIStore((s) => s.isSettingsModalOpen);
  const setOpen = useUIStore((s) => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] = useState<SettingsSection>('canvas');

  const close = () => {
    setOpen(false);
  };

  const sections = [
    { id: 'project' as const, label: 'Projeto', icon: Briefcase },
    { id: 'interface' as const, label: 'Interface', icon: LayoutTemplate },
    { id: 'canvas' as const, label: 'Canvas', icon: Grid3X3 },
    { id: 'snapping' as const, label: 'Snapping', icon: Magnet },
    { id: 'shortcuts' as const, label: 'Atalhos', icon: Keyboard },
    { id: 'developer' as const, label: 'Desenvolvedor', icon: Terminal },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'canvas':
        return <CanvasSettings />;
      case 'snapping':
        return <SnappingSettings />;
      case 'shortcuts':
        return <ShortcutsSettings />;
      case 'interface':
        return <InterfaceSettings />;
      case 'project':
        return <ProjectSettings />;
      case 'developer':
        return <DeveloperSettings />;
      default:
        return null;
    }
  };

  return (
    <Dialog
      modelValue={isOpen}
      onUpdate={setOpen}
      maxWidth="700px"
      showCloseButton={false}
      className="bg-surface-2 h-[500px] p-0 flex flex-col overflow-hidden"
      ariaLabel="Configuracoes"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2">
        <h2 className="font-semibold text-base">Configuracoes</h2>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-text-muted hover:text-text"
          onClick={close}
          title="Fechar"
        >
          <X size={18} />
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <SettingsSidebar
          sections={sections}
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        <div className="flex-1 overflow-y-auto p-4">{renderContent()}</div>
      </div>

      <div className="px-4 py-3 border-t border-border flex justify-end gap-2 bg-surface-2">
        <Button variant="secondary" size="sm" onClick={close}>
          Fechar
        </Button>
      </div>
    </Dialog>
  );
};

export default SettingsModal;
