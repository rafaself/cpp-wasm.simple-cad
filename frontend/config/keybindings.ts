export interface KeyBinding {
  id: string;
  label: string; // Human readable name for the action
  keys: string[]; // Primary keys (e.g. ['L'], ['Control', 'Z'])
  description: string;
  category: 'ferramentas' | 'editor' | 'navegacao';
}

export const KEYBINDINGS: Record<string, KeyBinding> = {
  // Tools
  'tools.select': {
    id: 'tools.select',
    label: 'Selecionar',
    keys: ['v'],
    description: 'Ferramenta de seleção',
    category: 'ferramentas',
  },
  'tools.line': {
    id: 'tools.line',
    label: 'Linha',
    keys: ['l'],
    description: 'Ferramenta de linha',
    category: 'ferramentas',
  },
  'tools.polyline': {
    id: 'tools.polyline',
    label: 'Polilinha',
    keys: ['p'],
    description: 'Ferramenta de polilinha',
    category: 'ferramentas',
  },
  'tools.rect': {
    id: 'tools.rect',
    label: 'Retângulo',
    keys: ['r'],
    description: 'Ferramenta de retângulo',
    category: 'ferramentas',
  },
  'tools.circle': {
    id: 'tools.circle',
    label: 'Elipse',
    keys: ['c'],
    description: 'Ferramenta de elipse',
    category: 'ferramentas',
  },
  'tools.polygon': {
    id: 'tools.polygon',
    label: 'Polígono',
    keys: ['g'],
    description: 'Ferramenta de polígono',
    category: 'ferramentas',
  },
  'tools.measure': {
    id: 'tools.measure',
    label: 'Medir',
    keys: ['m'],
    description: 'Ferramenta de medição',
    category: 'ferramentas',
  },
  'tools.text': {
    id: 'tools.text',
    label: 'Texto',
    keys: ['t'],
    description: 'Ferramenta de texto',
    category: 'ferramentas',
  },

  // Editor Actions
  'editor.delete': {
    id: 'editor.delete',
    label: 'Excluir',
    keys: ['delete'],
    description: 'Excluir elementos selecionados',
    category: 'editor',
  },
  'editor.undo': {
    id: 'editor.undo',
    label: 'Desfazer',
    keys: ['ctrl+z', 'meta+z'],
    description: 'Desfazer última ação',
    category: 'editor',
  },
  'editor.redo': {
    id: 'editor.redo',
    label: 'Refazer',
    keys: ['ctrl+y', 'meta+shift+z'],
    description: 'Refazer última ação desfeita',
    category: 'editor',
  },
  'editor.cancel': {
    id: 'editor.cancel',
    label: 'Cancelar',
    keys: ['escape'],
    description: 'Cancelar ferramenta atual ou desmarcar',
    category: 'editor',
  },
  'transform.rotate': {
    id: 'transform.rotate',
    label: 'Rotacionar 90°',
    keys: ['shift+r'],
    description: 'Rotacionar seleção em 90°',
    category: 'editor',
  },
  'transform.flipH': {
    id: 'transform.flipH',
    label: 'Espelhar Horizontal',
    keys: ['shift+h'],
    description: 'Espelhar seleção na horizontal',
    category: 'editor',
  },
  'transform.flipV': {
    id: 'transform.flipV',
    label: 'Espelhar Vertical',
    keys: ['shift+v'],
    description: 'Espelhar seleção na vertical',
    category: 'editor',
  },

  // Navigation
  'nav.pan': {
    id: 'nav.pan',
    label: 'Pan',
    keys: ['h', 'space'],
    description: 'Mover a visualização',
    category: 'navegacao',
  },
  'nav.zoomFit': {
    id: 'nav.zoomFit',
    label: 'Ajustar Zoom',
    keys: ['z'],
    description: 'Ajustar zoom para caber tudo',
    category: 'navegacao',
  },
};

export const getShortcutLabel = (id: string): string => {
  const binding = KEYBINDINGS[id];
  if (!binding || binding.keys.length === 0) return '';

  // Return the first key as the primary label
  // Capitalize first letter and replace standard modifiers
  let label = binding.keys[0];

  // Format for display (e.g. "ctrl+z" -> "Ctrl+Z")
  label = label
    .replace('ctrl', 'Ctrl')
    .replace('meta', 'Cmd')
    .replace('shift', 'Shift')
    .replace('alt', 'Alt');

  // Capitalize single letters
  if (label.length === 1) return label.toUpperCase();

  // Capitalize split parts
  return label
    .split('+')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('+');
};
