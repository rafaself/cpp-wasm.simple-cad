import { useCallback } from 'react';

import { bumpDocumentSignal } from '@/engine/core/engineDocumentSignals';
import { getEngineRuntime } from '@/engine/core/singleton';
import { LABELS } from '@/i18n/labels';
import { encodeNextDocumentFile, decodeNextDocumentFile } from '@/persistence/nextDocumentFile';
import { useUIStore } from '@/stores/useUIStore';
import { ToolType } from '@/types';

import { useEditorLogic } from '../hooks/useEditorLogic';

export type ItemStatus = 'ready' | 'stub';
export type ActionId =
  | 'new-file'
  | 'open-file'
  | 'save-file'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'open-settings'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-to-fit'
  | 'export-json'
  | 'report-csv'
  | 'export-project'
  | 'view-project'
  | 'grid'
  | (string & {});
export type ToolId = ToolType | (string & {});

const DEFAULT_FRAME = { enabled: false, widthMm: 297, heightMm: 210, marginMm: 10 };

export const stub = (id: string): void => {
  if (import.meta.env.DEV) {
    console.warn(`[UI-STUB] ${id}`);
  }
  useUIStore.getState().showToast(`A funcionalidade "${id}" será implementada em breve.`, 'info');
};

const saveFile = async (): Promise<void> => {
  const runtime = await getEngineRuntime();
  const engineSnapshot = runtime.saveSnapshotBytes();
  const bytes = encodeNextDocumentFile(
    { worldScale: 100, frame: DEFAULT_FRAME },
    { engineSnapshot },
  );
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'eletrocad-next.ewnd';
  a.click();
  URL.revokeObjectURL(url);
};

const openFile = (): void => {
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

    const layers = runtime.getLayersSnapshot();
    if (layers.length > 0) {
      const first = layers.reduce<{ id: number; order: number } | null>((acc, rec) => {
        if (!acc || rec.order < acc.order) return { id: rec.id, order: rec.order };
        return acc;
      }, null);
      if (first) {
        useUIStore.getState().setActiveLayerId(first.id);
      }
    }

    bumpDocumentSignal('layers');
    bumpDocumentSignal('selection');
    bumpDocumentSignal('order');
  };
  input.click();
};

export const useEditorCommands = () => {
  const setTool = useUIStore((s) => s.setTool);
  const setSettingsModalOpen = useUIStore((s) => s.setSettingsModalOpen);
  const setViewTransform = useUIStore((s) => s.setViewTransform);
  const { zoomToFit, deleteSelected } = useEditorLogic();

  const executeAction = useCallback(
    (actionId: ActionId, status: ItemStatus = 'ready') => {
      if (status === 'stub') {
        stub(actionId);
        return;
      }

      switch (actionId) {
        case 'undo':
          void getEngineRuntime().then((runtime) => runtime.undo());
          return;
        case 'redo':
          void getEngineRuntime().then((runtime) => runtime.redo());
          return;
        case 'open-file':
          openFile();
          return;
        case 'save-file':
          void saveFile();
          return;
        case 'open-settings':
          setSettingsModalOpen(true);
          return;
        case 'delete':
          deleteSelected();
          return;
        case 'zoom-in':
          setViewTransform((prev) => ({ ...prev, scale: Math.min(prev.scale * 1.2, 5) }));
          return;
        case 'zoom-out':
          setViewTransform((prev) => ({ ...prev, scale: Math.max(prev.scale / 1.2, 0.1) }));
          return;
        case 'zoom-to-fit':
          zoomToFit();
          return;
        case 'new-file':
          break;
        default:
          break;
      }

      stub(actionId);
    },
    [setSettingsModalOpen, setViewTransform, zoomToFit],
  );

  const selectTool = useCallback(
    (toolId: ToolId, status: ItemStatus = 'ready') => {
      if (status === 'stub') {
        stub(`tool:${toolId}`);
        return;
      }

      setTool(toolId as ToolType);
    },
    [setTool],
  );

  return {
    executeAction,
    selectTool,
  };
};
