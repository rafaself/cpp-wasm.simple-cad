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
import Dialog, { DialogCard, DialogButton } from '@/components/ui/Dialog';
import { LABELS } from '@/i18n/labels';
import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';

const Header: React.FC = () => {
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const { executeAction } = useEditorCommands();

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
            onClick={() => executeAction('new-file', 'stub')}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.openFile} (Ctrl+O)`}
            onClick={() => executeAction('open-file')}
          >
            <FolderOpen size={14} />
          </button>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.saveFile} (Ctrl+S)`}
            onClick={() => executeAction('save-file')}
          >
            <Save size={14} />
          </button>
          <div className="h-4 w-px bg-slate-700 mx-0.5"></div>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.undo} (Ctrl+Z)`}
            onClick={() => executeAction('undo')}
          >
            <Undo2 size={14} />
          </button>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={`${LABELS.menu.redo} (Ctrl+Y)`}
            onClick={() => executeAction('redo')}
          >
            <Redo2 size={14} />
          </button>
          <div className="h-4 w-px bg-slate-700 mx-0.5"></div>
          <button
            className="p-1 hover:bg-slate-800 rounded hover:text-white transition-colors"
            title={LABELS.menu.settings}
            onClick={() => executeAction('open-settings')}
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
              title={isFullScreen ? `${LABELS.common.fullScreenExit} (${fullscreenShortcut})` : `${LABELS.common.fullScreenEnter} (${fullscreenShortcut})`}
              onClick={onClick}
            >
              {isFullScreen ? <Minimize size={14} /> : <Maximize size={14} />}
            </button>
          )}
        >
          {({ close }) => (
            <DialogCard
              title={LABELS.common.fullScreenToggle}
              actions={
                <DialogButton variant="primary" onClick={close}>
                  {LABELS.common.ok}
                </DialogButton>
              }
            >
              <div className="flex flex-col items-center gap-4 py-2">
                <p className="text-center text-slate-300">
                  {isFullScreen 
                    ? LABELS.common.fullScreenMessageExit
                    : LABELS.common.fullScreenMessageEnter
                  }
                </p>
                <kbd className="bg-slate-700 px-4 py-2 rounded-lg text-lg font-mono font-bold border border-slate-500 text-white shadow-lg">
                  {fullscreenShortcut}
                </kbd>
                <p className="text-center text-slate-400 text-sm">
                  {LABELS.common.fullScreenInstruction.replace('{shortcut}', fullscreenShortcutReadable)}
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


