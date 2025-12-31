import { X, Grid3X3, Magnet, Keyboard, Briefcase, LayoutTemplate } from 'lucide-react';
import React, { useState, useEffect } from 'react';

import { useUIStore } from '../../stores/useUIStore';

import CanvasSettings from './sections/CanvasSettings';
import InterfaceSettings from './sections/InterfaceSettings';
import ProjectSettings from './sections/ProjectSettings';
import { ShortcutsSettings } from './sections/ShortcutsSettings';
import SnappingSettings from './sections/SnappingSettings';
import SettingsSidebar from './SettingsSidebar';

export type SettingsSection = 'canvas' | 'snapping' | 'shortcuts' | 'project' | 'interface';

const focusableSelectors =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

const SettingsModal: React.FC = () => {
  const isOpen = useUIStore((s) => s.isSettingsModalOpen);
  const setOpen = useUIStore((s) => s.setSettingsModalOpen);
  const [activeSection, setActiveSection] = useState<SettingsSection>('canvas');
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const lastFocusRef = React.useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      setActiveSection('project');
      const container = dialogRef.current;
      if (container) {
        const first = container.querySelector<HTMLElement>(focusableSelectors);
        first?.focus();
      }
    }
  }, [isOpen]);

  const trapFocus = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(focusableSelectors);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const close = () => {
    setOpen(false);
    if (lastFocusRef.current) {
      lastFocusRef.current.focus();
    }
  };

  if (!isOpen) return null;

  const sections = [
    { id: 'project' as const, label: 'Projeto', icon: Briefcase },
    { id: 'interface' as const, label: 'Interface', icon: LayoutTemplate },
    { id: 'canvas' as const, label: 'Canvas', icon: Grid3X3 },
    { id: 'snapping' as const, label: 'Snapping', icon: Magnet },
    { id: 'shortcuts' as const, label: 'Atalhos', icon: Keyboard },
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
      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="bg-surface-strong border border-border rounded-lg shadow-xl w-[700px] h-[500px] flex flex-col text-text"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 id="settings-modal-title" className="font-semibold text-base">
            Configuracoes
          </h2>
          <button
            onClick={close}
            className="text-text-muted hover:text-text p-1 rounded hover:bg-surface2 focus-outline"
            aria-label="Fechar"
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

          <div className="flex-1 overflow-y-auto p-4">{renderContent()}</div>
        </div>

        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={close}
            className="px-4 py-1.5 rounded text-sm font-medium bg-surface2 hover:bg-surface1 text-text-muted focus-outline"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
