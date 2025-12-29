import React from 'react';
import { FolderOpen, Save, Undo2, Redo2, Type, MousePointer2, Square, Circle, Minus, PenTool } from 'lucide-react';

import { useUIStore } from '../../../stores/useUIStore';
import { getEngineRuntime } from '@/engine/core/singleton';
import { encodeNextDocumentFile, decodeNextDocumentFile } from '../../../persistence/nextDocumentFile';
      // Use engine-authoritative API instead of re-decoding snapshot
      // Text metadata is already loaded into engine by loadSnapshotBytes
      // No need to sync to IdRegistry anymore as we use Engine-First architecture
import { bumpDocumentSignal } from '@/engine/core/engineDocumentSignals';
import { LABELS } from '@/i18n/labels';

const DEFAULT_FRAME = { enabled: false, widthMm: 297, heightMm: 210, marginMm: 10 };

const TOOL_BUTTONS = [
  { id: 'select', label: LABELS.tools.select, icon: MousePointer2 },
  { id: 'line', label: LABELS.tools.line, icon: Minus },
  { id: 'rect', label: LABELS.tools.rect, icon: Square },
  { id: 'circle', label: LABELS.tools.circle, icon: Circle },
  { id: 'polyline', label: LABELS.tools.polyline, icon: PenTool },
  { id: 'text', label: LABELS.tools.text, icon: Type },
];

const EditorRibbon: React.FC = () => {
  const activeTool = useUIStore((s) => s.activeTool);
  const setTool = useUIStore((s) => s.setTool);

  const handleSave = () => {
    void (async () => {
      const runtime = await getEngineRuntime();
      const engineSnapshot = runtime.saveSnapshotBytes();
      const bytes = encodeNextDocumentFile({ worldScale: 100, frame: DEFAULT_FRAME }, { engineSnapshot });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'eletrocad-next.ewnd';
      a.click();
      URL.revokeObjectURL(url);
    })();
  };

  const handleOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ewnd,application/octet-stream';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const buf = await file.arrayBuffer();
      let payload;
      try {
        payload = decodeNextDocumentFile(new Uint8Array(buf));
      } catch (err) {
        console.error(err);
        alert(LABELS.common.errorInvalidFile);
        return;
      }

      if (!payload.engineSnapshot || payload.engineSnapshot.byteLength === 0) {
        alert(LABELS.common.errorNoSnapshot);
        return;
      }

      const runtime = await getEngineRuntime();

      runtime.resetIds();
      runtime.resetIds();
      runtime.loadSnapshotBytes(payload.engineSnapshot);

      // Text metadata is already loaded into engine by loadSnapshotBytes

      if (runtime.engine.getLayersSnapshot) {
        const vec = runtime.engine.getLayersSnapshot();
        const count = vec.size();
        let firstId: number | null = null;
        let minOrder = Number.POSITIVE_INFINITY;
        for (let i = 0; i < count; i++) {
          const rec = vec.get(i);
          if (rec.order < minOrder) {
            minOrder = rec.order;
            firstId = rec.id;
          }
        }
        vec.delete();
        if (firstId !== null) useUIStore.getState().setActiveLayerId(firstId);
      }

      bumpDocumentSignal('layers');
      bumpDocumentSignal('selection');
      bumpDocumentSignal('order');
    };
    input.click();
  };

  const handleUndo = () => {
    void getEngineRuntime().then((runtime) => runtime.undo());
  };

  const handleRedo = () => {
    void getEngineRuntime().then((runtime) => runtime.redo());
  };

  return (
    <div className="h-10 bg-slate-900 border-b border-slate-800 flex items-center gap-2 px-3 text-slate-200">
      <div className="flex items-center gap-1">
        <button
          onClick={handleOpen}
          className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1"
          title={LABELS.menu.openFile}
        >
          <FolderOpen size={14} />
          {LABELS.menu.openFile}
        </button>
        <button
          onClick={handleSave}
          className="h-7 px-2 rounded bg-slate-800 hover:bg-slate-700 text-xs flex items-center gap-1"
          title={LABELS.menu.saveFile}
        >
          <Save size={14} />
          {LABELS.menu.saveFile}
        </button>
        <button
          onClick={handleUndo}
          className="h-7 w-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
          title={LABELS.menu.undo}
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={handleRedo}
          className="h-7 w-7 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
          title={LABELS.menu.redo}
        >
          <Redo2 size={14} />
        </button>
      </div>

      <div className="h-5 w-px bg-slate-700 mx-2" />

      <div className="flex items-center gap-1">
        {TOOL_BUTTONS.map((tool) => {
          const Icon = tool.icon;
          const active = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setTool(tool.id as any)}
              className={`h-7 px-2 rounded text-xs flex items-center gap-1 transition-colors ${
                active ? 'bg-blue-600 text-white' : 'bg-slate-800 hover:bg-slate-700'
              }`}
              title={tool.label}
            >
              <Icon size={14} />
              {tool.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EditorRibbon;
