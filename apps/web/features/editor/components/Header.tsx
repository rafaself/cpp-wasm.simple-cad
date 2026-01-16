import {
  FilePlus,
  FolderOpen,
  Save,
  Settings,
  Maximize,
  Minimize,
  Zap,
} from 'lucide-react';
import React from 'react';

import Dialog, { DialogCard, DialogButton } from '@/components/ui/Dialog';
import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';
import ThemeToggle from '@/features/editor/components/ThemeToggle';
import { LABELS } from '@/i18n/labels';
import { useProjectStore } from '@/stores/useProjectStore';

const Header: React.FC = () => {
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const { executeAction } = useEditorCommands();
  const projectTitle = useProjectStore((s) => s.projectTitle);

  // Detect OS for correct fullscreen shortcut
  const isMac = React.useMemo(() => {
    return (
      navigator.platform.toUpperCase().includes('MAC') ||
      navigator.userAgent.toUpperCase().includes('MAC')
    );
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
    <div className="relative h-[26px] py-[2px] bg-surface-2 flex items-center justify-between px-2 select-none border-b border-border text-text">
      <div className="flex items-center gap-1.5">
        <div className="flex items-center justify-center">
          <svg
            width="0"
            height="0"
            className="absolute w-0 h-0 pointer-events-none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="blazar-gradient-header" x1="10%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0ea5e9" /> {/* Electric Sky Blue */}
                <stop offset="25%" stopColor="#f97316" /> {/* Orange takes over early */}
                <stop offset="100%" stopColor="#ea580c" /> {/* Deep Orange finish */}
              </linearGradient>
            </defs>
          </svg>
          <Zap
            size={20}
            className="text-transparent"
            fill="url(#blazar-gradient-header)"
            stroke="url(#blazar-gradient-header)"
          />
        </div>
        <div className="font-semibold text-xs tracking-wide mr-1">Blazar</div>
        <div className="h-4 w-px bg-border mx-0.5"></div>
        <div className="flex items-center gap-0.5 text-text-muted">
          <button
            className="p-1 hover:bg-surface-2 rounded hover:text-text transition-colors focus-outline"
            title={`${LABELS.menu.newFile} (Ctrl+N)`}
            onClick={() => executeAction('new-file', 'stub')}
          >
            <FilePlus size={14} />
          </button>
          <button
            className="p-1 hover:bg-surface-2 rounded hover:text-text transition-colors focus-outline"
            title={`${LABELS.menu.openFile} (Ctrl+O)`}
            onClick={() => executeAction('open-file')}
          >
            <FolderOpen size={14} />
          </button>
          <button
            className="p-1 hover:bg-surface-2 rounded hover:text-text transition-colors focus-outline"
            title={`${LABELS.menu.saveFile} (Ctrl+S)`}
            onClick={() => executeAction('save-file')}
          >
            <Save size={14} />
          </button>

          <div className="h-4 w-px bg-border mx-0.5"></div>
          <button
            className="p-1 hover:bg-surface-2 rounded hover:text-text transition-colors focus-outline"
            title={LABELS.menu.settings}
            onClick={() => executeAction('open-settings')}
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Project Title */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-semibold text-sm text-text/80 pointer-events-none text-center">
        {projectTitle}
      </div>

      <div className="flex items-center text-text-muted gap-1">
        <ThemeToggle />
        <Dialog
          maxWidth="400px"
          closeOnResize
          activator={({ onClick }) => (
            <button
              className="p-1 hover:bg-surface-2 rounded hover:text-text transition-colors focus-outline"
              title={
                isFullScreen
                  ? `${LABELS.common.fullScreenExit} (${fullscreenShortcut})`
                  : `${LABELS.common.fullScreenEnter} (${fullscreenShortcut})`
              }
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
                <p className="text-center text-text">
                  {isFullScreen
                    ? LABELS.common.fullScreenMessageExit
                    : LABELS.common.fullScreenMessageEnter}
                </p>
                <kbd className="bg-surface-2 px-4 py-2 rounded-lg text-lg font-mono font-bold border border-border text-text shadow-card">
                  {fullscreenShortcut}
                </kbd>
                <p className="text-center text-text-muted text-sm">
                  {LABELS.common.fullScreenInstruction.replace(
                    '{shortcut}',
                    fullscreenShortcutReadable,
                  )}
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
