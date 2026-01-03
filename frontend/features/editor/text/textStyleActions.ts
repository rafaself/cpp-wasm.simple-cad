import { getEngineRuntime } from '@/engine/core/singleton';
import { TextAlign, TextStyleFlags } from '@/types/text';
import { applyTextDefaultsFromSettings, ensureTextToolReady, mapFontFamilyToId } from './textToolController';
import { useUIStore } from '@/stores/useUIStore';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';

const alignMap: Record<'left' | 'center' | 'right', TextAlign> = {
  left: TextAlign.Left,
  center: TextAlign.Center,
  right: TextAlign.Right,
};

async function filterTextIds(ids: number[], runtime: EngineRuntime): Promise<number[]> {
  const metas = runtime.getAllTextMetas();
  if (!metas.length) return [];
  const textIds = new Set(metas.map((m) => m.id));
  return ids.filter((id) => textIds.has(id));
}

async function getContext(selectedIds: number[], fontFamilyHint?: string) {
  const editingState = useUIStore.getState().engineTextEditState;
  const editingTextId = editingState.active ? editingState.textId : null;
  const runtime = await getEngineRuntime();
  const tool = await ensureTextToolReady(runtime, fontFamilyHint);
  const targetIds = editingTextId === null ? await filterTextIds(selectedIds, runtime) : [];

  return { tool, editingTextId, targetIds };
}

export async function applyFontFamilyUpdate(fontFamily: string, selectedIds: number[]): Promise<void> {
  const { tool, editingTextId, targetIds } = await getContext(selectedIds, fontFamily);
  const fontId = mapFontFamilyToId(fontFamily);

  if (editingTextId !== null) {
    tool.applyFontId(fontId);
  } else {
    targetIds.forEach((id) => tool.applyFontIdToText(id, fontId));
  }

  applyTextDefaultsFromSettings();
}

export async function applyFontSizeUpdate(fontSize: number, selectedIds: number[]): Promise<void> {
  const { tool, editingTextId, targetIds } = await getContext(selectedIds);
  if (editingTextId !== null) {
    tool.applyFontSize(fontSize);
  } else {
    targetIds.forEach((id) => tool.applyFontSizeToText(id, fontSize));
  }
  applyTextDefaultsFromSettings();
}

export async function applyTextAlignUpdate(
  align: 'left' | 'center' | 'right',
  selectedIds: number[],
): Promise<void> {
  const { tool, editingTextId, targetIds } = await getContext(selectedIds);
  const alignEnum = alignMap[align];

  if (editingTextId !== null) {
    tool.applyTextAlign(alignEnum);
  } else {
    targetIds.forEach((id) => tool.applyTextAlignToText(id, alignEnum));
  }
  applyTextDefaultsFromSettings();
}

export async function applyStyleFlagUpdate(
  mask: TextStyleFlags,
  intent: 'set' | 'clear' | 'toggle',
  selectedIds: number[],
): Promise<void> {
  const { tool, editingTextId, targetIds } = await getContext(selectedIds);

  if (editingTextId !== null) {
    tool.applyStyle(mask, intent);
  } else {
    targetIds.forEach((id) => tool.applyStyleToText(id, mask, intent));
  }
  applyTextDefaultsFromSettings();
}
