import {
  ZoomIn,
  ZoomOut,
  Target,
  CircleDot,
  Square,
  ChevronUp,
  MousePointer2,
  Undo2,
  Redo2,
  Scan,
  Grid3x3,
  Crosshair,
} from 'lucide-react';
import React, { useState } from 'react';

import { useEditorCommands } from '@/features/editor/commands/useEditorCommands';
import { LABELS } from '@/i18n/labels';

import EditableNumber from '../../../components/EditableNumber';
import { useSettingsStore } from '../../../stores/useSettingsStore';
import { useUIStore } from '../../../stores/useUIStore';
import { SnapOptions } from '../../../types';
import { getRibbonTabs } from '../ui/ribbonConfig';

import { CommandInput } from './CommandInput';

const EditorStatusBar: React.FC = () => {
  const mousePos = useUIStore((s) => s.mousePos);
  const viewTransform = useUIStore((s) => s.viewTransform);
  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const history = useUIStore((s) => s.history);
  const snapSettings = useSettingsStore((s) => s.snap);
  const setSnapEnabled = useSettingsStore((s) => s.setSnapEnabled);
  const setSnapOption = useSettingsStore((s) => s.setSnapOption);
  const enableColorsRibbon = useSettingsStore((s) => s.featureFlags.enableColorsRibbon);
  const [showSnapMenu, setShowSnapMenu] = useState(false);
  const { executeAction } = useEditorCommands();

  const toggleSnap = () => setSnapEnabled(!snapSettings.enabled);
  const toggleOption = (key: keyof SnapOptions) => setSnapOption(key, !snapSettings[key]);

  const activeTool = useUIStore((s) => s.activeTool);

  const ToolIcon = React.useMemo(() => {
    const ribbonTabs = getRibbonTabs(enableColorsRibbon);
    for (const tab of ribbonTabs) {
      for (const group of tab.groups) {
        for (const item of group.items) {
          if (item.kind === 'tool' && item.toolId === activeTool) {
            return item.icon || MousePointer2;
          }
        }
      }
    }
    return MousePointer2;
  }, [activeTool, enableColorsRibbon]);

  return (
    <div className="w-full h-8 bg-surface-1 border-t border-border flex items-center justify-between px-4 text-xs text-text select-none z-50 relative">
      <div className="font-mono flex items-center gap-4 text-text text-[10px]">
        {mousePos ? (
          <>
            <ToolIcon size={12} className="text-text" />
            <div className="flex gap-3">
              <span>
                <span className="mr-1">X:</span>
                {mousePos.x.toFixed(2)}
              </span>
              <span>
                <span className="mr-1">Y:</span>
                {mousePos.y.toFixed(2)}
              </span>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-2 opacity-40">
            <ToolIcon size={12} />
            <span>—</span>
          </div>
        )}
      </div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <CommandInput />
      </div>

      <div className="flex items-center gap-2">
        <div className="relative">
          <div className="flex items-center bg-surface-1 rounded border border-border">
            <button
              onClick={toggleSnap}
              className={`flex items-center gap-1 px-2 py-0.5 hover:bg-surface-2 focus-outline ${snapSettings.enabled ? 'text-primary font-bold' : 'text-text'}`}
              title={snapSettings.enabled ? 'SNAP Ativo' : 'SNAP Inativo'}
            >
              <Crosshair size={14} />
            </button>
            <button
              onClick={() => setShowSnapMenu(!showSnapMenu)}
              className="px-1 py-0.5 border-l border-border hover:bg-surface-2 focus-outline text-text"
              title={LABELS.statusbar.snapOptions}
              aria-label={LABELS.statusbar.snapOptions}
            >
              <ChevronUp size={14} />
            </button>
          </div>

          {showSnapMenu && (
            <div className="absolute bottom-full mb-1 right-0 w-40 bg-surface-1 border border-border shadow-xl rounded p-2 flex flex-col gap-1 menu-transition">
              <div className="text-[10px] text-text uppercase mb-1 font-bold">
                {LABELS.statusbar.snapToObject}
              </div>
              <label className="flex items-center gap-2 hover:bg-surface-2 p-1 rounded cursor-pointer focus-outline text-text text-xs">
                <input
                  type="checkbox"
                  checked={snapSettings.endpoint}
                  onChange={() => toggleOption('endpoint')}
                />{' '}
                <Square size={12} /> {LABELS.settings.endpoints}
              </label>
              <label className="flex items-center gap-2 hover:bg-surface-2 p-1 rounded cursor-pointer focus-outline text-text text-xs">
                <input
                  type="checkbox"
                  checked={snapSettings.midpoint}
                  onChange={() => toggleOption('midpoint')}
                />{' '}
                <Target size={12} /> {LABELS.settings.midpoints}
              </label>
              <label className="flex items-center gap-2 hover:bg-surface-2 p-1 rounded cursor-pointer focus-outline text-text text-xs">
                <input
                  type="checkbox"
                  checked={snapSettings.center}
                  onChange={() => toggleOption('center')}
                />{' '}
                <CircleDot size={12} /> {LABELS.settings.centers}
              </label>
              <label className="flex items-center gap-2 hover:bg-surface-2 p-1 rounded cursor-pointer focus-outline text-text text-xs">
                <input
                  type="checkbox"
                  checked={snapSettings.nearest}
                  onChange={() => toggleOption('nearest')}
                />{' '}
                <Crosshair size={12} /> {LABELS.settings.nearest}
              </label>
              <label className="flex items-center gap-2 hover:bg-surface-2 p-1 rounded cursor-pointer focus-outline text-text text-xs">
                <input
                  type="checkbox"
                  checked={snapSettings.grid}
                  onChange={() => toggleOption('grid')}
                />{' '}
                <Grid3x3 size={12} /> {LABELS.settings.grid}
              </label>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-text/20 mx-2" />

        <button
          onClick={() => executeAction('undo')}
          className={`p-1 hover:bg-surface-2 rounded focus-outline text-text ${history.canUndo ? '' : 'opacity-50 cursor-not-allowed'}`}
          disabled={!history.canUndo}
          title={`${LABELS.menu.undo} (Ctrl+Z)`}
          aria-label={LABELS.menu.undo}
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={() => executeAction('redo')}
          className={`p-1 hover:bg-surface-2 rounded focus-outline text-text ${history.canRedo ? '' : 'opacity-50 cursor-not-allowed'}`}
          disabled={!history.canRedo}
          title={`${LABELS.menu.redo} (Ctrl+Y)`}
          aria-label={LABELS.menu.redo}
        >
          <Redo2 size={14} />
        </button>

        <div className="h-4 w-px bg-text/20 mx-2" />

        <button
          onClick={() => executeAction('zoom-to-fit')}
          className="p-1 hover:bg-surface-2 rounded focus-outline text-text"
          title={LABELS.statusbar.zoomOut} // Using generic label or adding specific 'Adjust to Fit' in future
          aria-label={LABELS.statusbar.zoomOut}
        >
          <Scan size={14} />
        </button>

        <div className="w-16 h-full flex items-center justify-center py-0.5">
          <EditableNumber
            value={viewTransform.scale * 100}
            onChange={(val) => setViewTransform((prev) => ({ ...prev, scale: val / 100 }))}
            min={10}
            max={500}
            step={10}
            suffix="%"
            className="w-full h-full"
            spinnerClassName="text-xs bg-surface-1 !h-full"
            displayClassName="text-xs"
          />
        </div>

        <button
          onClick={() => executeAction('zoom-out')}
          className="p-1 hover:bg-surface-2 rounded focus-outline text-text"
          title={LABELS.statusbar.zoomOut}
          aria-label={LABELS.statusbar.zoomOut}
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={() => executeAction('zoom-in')}
          className="p-1 hover:bg-surface-2 rounded focus-outline text-text"
          title={LABELS.statusbar.zoomIn}
          aria-label={LABELS.statusbar.zoomIn}
        >
          <ZoomIn size={14} />
        </button>
      </div>
    </div>
  );
};

export default EditorStatusBar;
