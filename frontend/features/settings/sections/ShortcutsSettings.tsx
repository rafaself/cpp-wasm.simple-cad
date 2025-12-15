import React from 'react';
import { KEYBINDINGS, getShortcutLabel } from '../../../config/keybindings';

export const ShortcutsSettings: React.FC = () => {
  // Group bindings by category
  const categories = Object.values(KEYBINDINGS).reduce((acc, binding) => {
    if (!acc[binding.category]) {
      acc[binding.category] = [];
    }
    acc[binding.category].push(binding);
    return acc;
  }, {} as Record<string, typeof KEYBINDINGS[string][]>);

  const categoryLabels: Record<string, string> = {
    ferramentas: 'Ferramentas de Desenho',
    editor: 'Editor e Ações',
    navegacao: 'Navegação',
    eletrica: 'Elétrica (Contexto)'
  };

  return (
    <div className="flex flex-col gap-6 p-1 text-slate-200">
      <div className="text-sm text-slate-400 mb-2">
        Atalhos de teclado configurados para o sistema. Estes atalhos não podem ser alterados.
      </div>

      {Object.entries(categories).map(([category, bindings]) => (
        <div key={category} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wider border-b border-slate-700 pb-1">
            {categoryLabels[category] || category}
          </h3>
          <div className="grid grid-cols-1 gap-2">
            {bindings.map((binding) => (
              <div key={binding.id} className="flex items-center justify-between p-2 rounded bg-slate-800/50 hover:bg-slate-800 transition-colors">
                <div className="flex flex-col">
                  <span className="font-medium text-slate-200">{binding.label}</span>
                  <span className="text-xs text-slate-500">{binding.description}</span>
                </div>
                <div className="flex gap-2">
                  {binding.keys.map((key, i) => (
                    <kbd 
                      key={i}
                      className="px-2 py-1 bg-slate-700 rounded text-xs font-mono text-slate-300 border border-slate-600 shadow-sm min-w-[24px] text-center"
                    >
                      {key.toUpperCase().replace('CTRL', 'Ctrl').replace('SHIFT', 'Shift').replace('META', 'Cmd')}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
