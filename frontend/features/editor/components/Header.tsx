import React from 'react';
import {
  FilePlus,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  Settings,
  Maximize,
  Minimize
} from 'lucide-react';
import { useUIStore } from '@/stores/useUIStore';
import { getEngineRuntime } from '@/engine/core/singleton';
import Dialog, { DialogCard, DialogButton } from '@/components/ui/Dialog';
import { LABELS } from '@/i18n/labels';

const Header: React.FC = () => {
  const setSettingsModalOpen = useUIStore(s => s.setSettingsModalOpen);
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const handleUndo = () => {
    void getEngineRuntime().then((runtime) => runtime.undo());
  };
  const handleRedo = () => {
    void getEngineRuntime().then((runtime) => runtime.redo());
  };

  // Detect OS for correct fullscreen shortcut
  const isMac = React.useMemo(() => {
    return navigator.platform.toUpperCase().includes('MAC') || 
           navigator.userAgent.toUpperCase().includes('MAC');
  }, []);

  // Fullscreen shortcut varies by OS
  const fullscreenShortcut = isMac ? '⌃⌘F' : 'F11';
  const fullscreenShortcutReadable = isMac ? 'Ctrl + Cmd + F' : 'F11';

  // Detect native fullscreen state (F11)
  React.useEffect(() => {
    const checkFullScreen = () => {
      // Check if window dimensions match screen dimensions (F11 fullscreen detection)
      const isFull = window.innerHeight === screen.height && window.innerWidth === screen.width;
      setIsFullScreen(isFull);
    };

    checkFullScreen();
    window.addEventListener('resize', checkFullScreen);
    return () => window.removeEventListener('resize', checkFullScreen);
  }, []);

  return (
    <div className="h-8 bg-[#0f172a] flex items-center justify-between px-2 select-none border-b border-[#1e293b]">
      <div className="flex items-center gap-1.5">
        <div className="w-6 h-6 bg-red-600 flex items-center justify-center rounded-sm text-white font-bold text-sm">
          E
        </div>
        <div className="text-white font-semibold text-xs tracking-wide mr-1">
          EndeavourPower
        </div>
        <div className="h-4 w-px bg-slate-700 mx-0.5"></div>
        <div className="flex items-center gap-0.5 text-slate-400">
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.newFile} (Ctrl+N)`}
            onClick={() => console.log('New File clicked')}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.openFile} (Ctrl+O)`}
            onClick={() => console.log('Open File clicked')}
          >
            <FolderOpen size={14} />
          </button>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.saveFile} (Ctrl+S)`}
            onClick={() => console.log('Save clicked')}
          >
            <Save size={14} />
          </button>
          <div className="h-4 w-px bg-slate-700 mx-0.5"></div>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.undo} (Ctrl+Z)`}
            onClick={handleUndo}
          >
            <Undo2 size={14} />
          </button>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.redo} (Ctrl+Y)`}
            onClick={handleRedo}
          >
            <Redo2 size={14} />
          </button>
          <div className="h-4 w-px bg-slate-700 mx-0.5"></div>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={LABELS.menu.settings}
            onClick={() => setSettingsModalOpen(true)}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center text-slate-400">
        <Dialog
          maxWidth="400px"
          closeOnResize
          activator={({ onClick }) => (
            <button
              className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
              title={isFullScreen ? `Sair da Tela Cheia (${fullscreenShortcut})` : `Tela Cheia (${fullscreenShortcut})`}
              onClick={onClick}
            >
              {isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          )}
        >
          {({ close }) => (
            <DialogCard
              title="Modo Tela Cheia"
              actions={
                <DialogButton variant="primary" onClick={close}>
                  {LABELS.common.ok}
                </DialogButton>
              }
            >
              <div className="flex flex-col items-center gap-4 py-2">
                <p className="text-center text-slate-300">
                  {isFullScreen 
                    ? "Você está no modo tela cheia. Para sair, pressione:"
                    : "Para alternar o modo tela cheia, pressione:"
                  }
                </p>
                <kbd className="bg-slate-700 px-4 py-2 rounded-lg text-lg font-mono font-bold border border-slate-500 text-white shadow-lg">
                  {fullscreenShortcut}
                </kbd>
                <p className="text-center text-slate-400 text-sm">
                  Use {fullscreenShortcutReadable} para entrar ou sair do modo tela cheia.
                </p>
              </div>
            </DialogCard>
          )}
        </Dialog>
      </div>
    </div>
  );
};

export default Header;



