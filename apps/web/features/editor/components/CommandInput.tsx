import { Terminal, HelpCircle, Send } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import Dialog, { DialogCard } from '@/components/ui/Dialog';
import { LABELS } from '@/i18n/labels';
import { useCommandStore } from '@/stores/useCommandStore';
import { useUIStore } from '@/stores/useUIStore';

import { useCommandExecutor, getCommandSuggestions } from '../commands/commandExecutor';
import { ensureCommandsRegistered } from '../commands/definitions';
import { useCommandInputCapture } from '../hooks/useCommandInputCapture';
import { CommandHelpContent } from './CommandHelpContent';

export interface CommandInputProps {
  /** Optional className for additional styling */
  className?: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({ className = '' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isComposing, setIsComposing] = React.useState(false);

  // Enable global keyboard capture to route typing to this input
  useCommandInputCapture({ inputRef, isComposing });

  const buffer = useCommandStore((s) => s.buffer);
  const setBuffer = useCommandStore((s) => s.setBuffer);
  const isActive = useCommandStore((s) => s.isActive);
  const setActive = useCommandStore((s) => s.setActive);
  const error = useCommandStore((s) => s.error);
  const clearError = useCommandStore((s) => s.clearError);
  const navigateHistory = useCommandStore((s) => s.navigateHistory);
  const loadHistory = useCommandStore((s) => s.loadHistory);
  const historyIndex = useCommandStore((s) => s.historyIndex);

  const isMouseOverCanvas = useUIStore((s) => s.isMouseOverCanvas);
  const isCapturing = isMouseOverCanvas && !isActive; // Capturing but input not focused
  const isHelpModalOpen = useUIStore((s) => s.isCommandHelpModalOpen);
  const setHelpModalOpen = useUIStore((s) => s.setCommandHelpModalOpen);

  const { execute } = useCommandExecutor();

  // Get autocomplete suggestion for current buffer
  const suggestion = useMemo(() => {
    if (!buffer.trim()) return null;
    const suggestions = getCommandSuggestions(buffer.trim(), 1);
    return suggestions.length > 0 ? suggestions[0] : null;
  }, [buffer]);

  // Load command history on mount
  useEffect(() => {
    ensureCommandsRegistered();
    loadHistory();
  }, [loadHistory]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBuffer(e.target.value);
      clearError();
    },
    [setBuffer, clearError],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          // Don't execute during IME composition
          if (buffer.trim() && !isComposing) {
            execute();
          }
          break;

        case 'Escape':
          e.preventDefault();
          setBuffer('');
          clearError();
          inputRef.current?.blur();
          break;

        case 'ArrowUp':
          e.preventDefault();
          navigateHistory('up');
          break;

        case 'ArrowDown':
          e.preventDefault();
          navigateHistory('down');
          break;

        case 'Tab':
          e.preventDefault();
          e.stopPropagation();
          // Simple tab completion - complete to first suggestion
          if (buffer.trim()) {
            const suggestions = getCommandSuggestions(buffer.trim(), 1);
            if (suggestions.length > 0) {
              setBuffer(suggestions[0].name);
            }
          }
          break;
      }
    },
    [buffer, execute, setBuffer, clearError, navigateHistory, isComposing],
  );

  const handleFocus = useCallback(() => {
    setActive(true);
  }, [setActive]);

  const handleBlur = useCallback(() => {
    setActive(false);
  }, [setActive]);

  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  const handleExecuteClick = useCallback(() => {
    if (buffer.trim() && !isComposing) {
      execute();
    }
  }, [buffer, isComposing, execute]);

  // Determine visual state
  const showCapturing = isCapturing || (isActive && buffer);
  const isNavigatingHistory = historyIndex >= 0;

  return (
    <>
      <div className={`relative flex items-center gap-1 ${className}`}>
        <div
          className={`
            flex items-center gap-1.5 h-6 px-2
            bg-surface1 border rounded
            transition-all duration-150
            ${isActive ? 'border-primary ring-1 ring-primary/30' : ''}
            ${isCapturing && !isActive ? 'border-primary/50 bg-primary/5' : ''}
            ${!isActive && !isCapturing ? 'border-border' : ''}
            ${error ? 'border-red-500 ring-1 ring-red-500/30' : ''}
          `}
        >
        <Terminal
          size={12}
          className={`
            shrink-0 transition-colors duration-150
            ${isActive || isCapturing ? 'text-primary' : 'text-text'}
          `}
        />
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={buffer}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            placeholder={LABELS.statusbar.commandPlaceholder}
            spellCheck={false}
            autoComplete="off"
            className={`
              w-28 h-full bg-transparent relative z-10
              text-xs font-mono
              text-text placeholder:text-text/50
              outline-none
              selection:bg-primary/30
            `}
            aria-label={LABELS.statusbar.commandInputLabel}
            title={LABELS.statusbar.commandTooltip}
          />
          {/* Autocomplete ghost text */}
          {suggestion && buffer && !isNavigatingHistory && (
            <div
              className="
                absolute inset-0 flex items-center
                text-xs font-mono text-text-muted/40
                pointer-events-none select-none
                overflow-hidden
              "
              aria-hidden="true"
            >
              <span className="invisible">{buffer}</span>
              <span>{suggestion.name.slice(buffer.length)}</span>
            </div>
          )}
        </div>

        {/* Execute button - shows when there's content */}
        <button
          onClick={handleExecuteClick}
          className={`
            shrink-0 p-0.5 rounded transition-colors
            ${buffer.trim() ? 'opacity-100 hover:bg-surface2 text-text hover:text-primary' : 'opacity-0 pointer-events-none'}
          `}
          title={LABELS.statusbar.commandExecute}
          aria-label={LABELS.statusbar.commandExecuteLabel}
          disabled={!buffer.trim()}
        >
          <Send size={12} className="rotate-45" />
        </button>
      </div>

      {/* Help button */}
      <button
        onClick={() => setHelpModalOpen(true)}
        className="p-1 hover:bg-surface2 rounded focus-outline text-text hover:text-primary transition-colors"
        title={LABELS.statusbar.commandHelp}
        aria-label={LABELS.statusbar.commandHelpLabel}
      >
        <HelpCircle size={14} />
      </button>

      {/* Suggestion tooltip */}
      {suggestion && buffer && !error && (isActive || showCapturing) && (
        <div
          className="
            absolute bottom-full left-0 mb-1.5
            px-2 py-1 rounded
            bg-surface2 border border-border
            text-[10px] text-text
            whitespace-nowrap
            shadow-lg
            animate-in fade-in slide-in-from-bottom-1 duration-150
          "
        >
          <span className="text-primary font-medium">{suggestion.name}</span>
          <span className="mx-1.5 text-text/30">—</span>
          <span>{suggestion.description}</span>
          <span className="ml-2 text-text/60">[Enter]</span>
        </div>
      )}

      {/* Error tooltip */}
      {error && (
        <div
          className="
            absolute bottom-full left-0 mb-1.5
            px-2 py-1 rounded
            bg-red-500/90 text-white text-[10px]
            whitespace-nowrap
            shadow-lg
            animate-in fade-in slide-in-from-bottom-1 duration-150
          "
          role="alert"
        >
          {error}
        </div>
      )}
      </div>

      <Dialog
        modelValue={isHelpModalOpen}
        onUpdate={setHelpModalOpen}
        maxWidth="700px"
        showCloseButton
        ariaLabel={LABELS.statusbar.commandHelpDialogTitle}
      >
        <DialogCard title={LABELS.statusbar.commandHelpDialogTitle} contentClassName="overflow-hidden p-0">
          <CommandHelpContent />
        </DialogCard>
      </Dialog>
    </>
  );
};

export default CommandInput;
