import { Terminal } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';

import { useCommandStore } from '@/stores/useCommandStore';
import { useUIStore } from '@/stores/useUIStore';

import { useCommandExecutor, getCommandSuggestions } from '../commands/commandExecutor';
import { ensureCommandsRegistered } from '../commands/definitions';
import { useCommandInputCapture } from '../hooks/useCommandInputCapture';

export interface CommandInputProps {
  /** Optional className for additional styling */
  className?: string;
}

export const CommandInput: React.FC<CommandInputProps> = ({ className = '' }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Enable global keyboard capture to route typing to this input
  useCommandInputCapture({ inputRef });

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
          if (buffer.trim()) {
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
    [buffer, execute, setBuffer, clearError, navigateHistory],
  );

  const handleFocus = useCallback(() => {
    setActive(true);
  }, [setActive]);

  const handleBlur = useCallback(() => {
    setActive(false);
  }, [setActive]);

  // Determine visual state
  const showCapturing = isCapturing || (isActive && buffer);
  const isNavigatingHistory = historyIndex >= 0;

  return (
    <div className={`relative flex items-center ${className}`}>
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
            ${isActive || isCapturing ? 'text-primary' : 'text-text-muted'}
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
            placeholder="Comando..."
            spellCheck={false}
            autoComplete="off"
            className={`
              w-32 h-full bg-transparent relative z-10
              text-xs font-mono
              text-text placeholder:text-text-muted/50
              outline-none
              selection:bg-primary/30
            `}
            aria-label="Command input"
            title="Digite um comando (Ex: L para Linha, R para Retângulo). Pressione Enter para executar."
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
      </div>

      {/* Suggestion tooltip */}
      {suggestion && buffer && !error && (isActive || showCapturing) && (
        <div
          className="
            absolute bottom-full left-0 mb-1.5
            px-2 py-1 rounded
            bg-surface2 border border-border
            text-[10px] text-text-muted
            whitespace-nowrap
            shadow-lg
            animate-in fade-in slide-in-from-bottom-1 duration-150
          "
        >
          <span className="text-primary font-medium">{suggestion.name}</span>
          <span className="mx-1.5 text-border">—</span>
          <span>{suggestion.description}</span>
          <span className="ml-2 text-text-muted/50">[Enter]</span>
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

      {/* Capture mode indicator */}
      {isCapturing && !buffer && (
        <div
          className="
            absolute bottom-full left-0 mb-1.5
            px-2 py-1 rounded
            bg-surface2 border border-primary/30
            text-[10px] text-text-muted
            whitespace-nowrap
            shadow-lg
            animate-in fade-in slide-in-from-bottom-1 duration-150
          "
        >
          <span className="text-primary">Pronto</span>
          <span className="mx-1"> — Digite um comando</span>
        </div>
      )}
    </div>
  );
};

export default CommandInput;
