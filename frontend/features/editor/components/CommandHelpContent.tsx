import React, { useMemo } from 'react';

import { getAllCommands } from '../commands/commandRegistry';

const CATEGORY_LABELS: Record<string, string> = {
  tools: 'Ferramentas de Desenho',
  edit: 'Edição',
  view: 'Visualização',
  settings: 'Configurações',
  file: 'Arquivo',
  help: 'Ajuda',
};

export const CommandHelpContent: React.FC = () => {
  const allCommands = useMemo(() => getAllCommands(), []);

  // Group commands by category
  const commandsByCategory = useMemo(() => {
    const grouped: Record<string, typeof allCommands> = {};

    allCommands.forEach((cmd) => {
      if (!grouped[cmd.category]) {
        grouped[cmd.category] = [];
      }
      grouped[cmd.category].push(cmd);
    });

    // Sort commands within each category by name
    Object.keys(grouped).forEach((category) => {
      grouped[category].sort((a, b) => a.name.localeCompare(b.name));
    });

    return grouped;
  }, [allCommands]);

  return (
    <div className="flex flex-col gap-6 p-1 text-text overflow-y-auto max-h-[calc(100vh-200px)]">
      <div className="text-sm text-text-muted mb-2">
        Lista completa de comandos disponíveis. Digite um comando no campo inferior ou use Tab para
        autocompletar.
      </div>

      {Object.entries(commandsByCategory).map(([category, commands]) => (
        <div key={category} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-text uppercase tracking-wider border-b border-border pb-1">
            {CATEGORY_LABELS[category] || category}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {commands.map((cmd) => (
              <div
                key={cmd.id}
                className="flex items-center justify-between p-2 rounded bg-surface2/50 hover:bg-surface2 transition-colors"
              >
                <div className="flex flex-col flex-1">
                  <div className="flex items-center gap-2">
                    <code className="font-bold text-text font-mono text-sm">{cmd.name}</code>
                    {cmd.aliases.length > 0 && (
                      <span className="text-xs text-text-muted">
                        ({cmd.aliases.join(', ')})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-text-muted mt-0.5">{cmd.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="px-2 py-3 border-t border-border bg-surface2/30 rounded">
        <p className="text-xs text-text-muted text-center">
          Dica: Use{' '}
          <kbd className="px-1.5 py-0.5 bg-surface1 border border-border rounded text-xs font-mono">
            tab
          </kbd>{' '}
          para autocompletar comandos
        </p>
      </div>
    </div>
  );
};
