import { getEngineRuntime } from '@/engine/core/singleton';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';
import { TextAlign, TextStyleFlags } from '@/types/text';

import {
  applyTextDefaultsFromSettings,
  ensureFontFamilyLoaded,
  ensureTextToolReady,
  mapFontFamilyToId,
  mapFontIdToFamily,
} from './textToolController';

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

  return { tool, editingTextId, targetIds, runtime };
}

export async function applyFontFamilyUpdate(
  fontFamily: string,
  selectedIds: number[],
): Promise<void> {
  const { tool, editingTextId, targetIds, runtime } = await getContext(selectedIds, fontFamily);
  await ensureFontFamilyLoaded(fontFamily, runtime);
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
  const { tool, editingTextId, targetIds, runtime } = await getContext(selectedIds);
  if ((mask & (TextStyleFlags.Bold | TextStyleFlags.Italic)) !== 0) {
    const fallbackFamily = useSettingsStore.getState().toolDefaults.text.fontFamily;
    const families = new Set<string>();

    if (editingTextId !== null) {
      const snapshot = useUIStore.getState().engineTextStyleSnapshot;
      if (snapshot && snapshot.textId === editingTextId) {
        const family = mapFontIdToFamily(snapshot.snapshot.fontId) ?? fallbackFamily;
        families.add(family);
      } else {
        families.add(fallbackFamily);
      }
    } else {
      for (const id of targetIds) {
        const summary = runtime.text.getTextStyleSummary(id);
        const family = mapFontIdToFamily(summary?.fontId ?? 0) ?? fallbackFamily;
        families.add(family);
      }
    }

    await Promise.all(
      Array.from(families.values(), (family) => ensureFontFamilyLoaded(family, runtime)),
    );
  }

  if (editingTextId !== null) {
    tool.applyStyle(mask, intent);
  } else {
    targetIds.forEach((id) => tool.applyStyleToText(id, mask, intent));
  }
  applyTextDefaultsFromSettings();
}
