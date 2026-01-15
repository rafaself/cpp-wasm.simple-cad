import React from 'react';

import { getShortcutLabel } from '../../../../config/keybindings';

const TransformShortcuts: React.FC = () => (
  <div className="flex flex-col justify-center gap-1 h-full px-3 text-center">
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-surface2 rounded text-[10px] font-mono text-text border border-border">
          {getShortcutLabel('transform.rotate')}
        </kbd>
        <span className="text-[10px] text-text-muted">Girar 90 graus</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-surface2 rounded text-[10px] font-mono text-text border border-border">
          {getShortcutLabel('transform.flipH')}
        </kbd>
        <span className="text-[10px] text-text-muted">Espelhar H</span>
      </div>
      <div className="flex items-center gap-2">
        <kbd className="px-1.5 py-0.5 bg-surface2 rounded text-[10px] font-mono text-text border border-border">
          {getShortcutLabel('transform.flipV')}
        </kbd>
        <span className="text-[10px] text-text-muted">Espelhar V</span>
      </div>
    </div>
  </div>
);

export default TransformShortcuts;
