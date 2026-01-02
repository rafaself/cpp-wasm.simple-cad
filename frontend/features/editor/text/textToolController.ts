import { getEngineRuntime } from '@/engine/core/singleton';
import { TextTool, createTextTool } from '@/engine/tools/TextTool';
import { TextStyleFlags } from '@/types/text';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { TextToolCallbacks, TextToolState, TextStyleDefaults } from '@/engine/tools/TextTool';
import type { TextAlign } from '@/types/text';

type TextToolListener = Partial<TextToolCallbacks>;

type FontRegistryEntry = {
  fontId: number;
  url: string;
};

const FONT_REGISTRY: Record<string, FontRegistryEntry> = {
  // Map common UI labels to engine font ids.
  Inter: { fontId: 4, url: '/fonts/DejaVuSans.ttf' },
  Arial: { fontId: 4, url: '/fonts/DejaVuSans.ttf' },
  Roboto: { fontId: 4, url: '/fonts/DejaVuSans.ttf' },
  'DejaVu Sans': { fontId: 4, url: '/fonts/DejaVuSans.ttf' },
  Times: { fontId: 5, url: '/fonts/DejaVuSerif.ttf' },
  'DejaVu Serif': { fontId: 5, url: '/fonts/DejaVuSerif.ttf' },
};

const listeners = new Set<TextToolListener>();
const loadedFonts = new Set<number>();
const pendingFontLoads = new Map<number, Promise<boolean>>();
let lastState: TextToolState | null = null;

const broadcastCallbacks: TextToolCallbacks = {
  onStateChange: (state) => {
    lastState = state;
    listeners.forEach((listener) => listener.onStateChange?.(state));
  },
  onCaretUpdate: (...args) => {
    listeners.forEach((listener) => listener.onCaretUpdate?.(...args));
  },
  onSelectionUpdate: (rects) => {
    listeners.forEach((listener) => listener.onSelectionUpdate?.(rects));
  },
  onStyleSnapshot: (textId, snapshot) => {
    listeners.forEach((listener) => listener.onStyleSnapshot?.(textId, snapshot));
    useUIStore.getState().setEngineTextStyleSnapshot(textId, snapshot);
  },
  onEditEnd: () => {
    listeners.forEach((listener) => listener.onEditEnd?.());
  },
  onTextCreated: (...args) => {
    listeners.forEach((listener) => listener.onTextCreated?.(...args));
  },
  onTextUpdated: (...args) => {
    listeners.forEach((listener) => listener.onTextUpdated?.(...args));
  },
  onTextDeleted: (textId) => {
    listeners.forEach((listener) => listener.onTextDeleted?.(textId));
  },
};

const textTool = createTextTool(broadcastCallbacks);

export function getSharedTextTool(): TextTool {
  return textTool;
}

export function addTextToolListener(listener: TextToolListener): () => void {
  listeners.add(listener);
  if (lastState && listener.onStateChange) {
    listener.onStateChange(lastState);
  }
  return () => {
    listeners.delete(listener);
  };
}

async function ensureInitialized(runtime?: EngineRuntime): Promise<EngineRuntime> {
  const rt = runtime ?? (await getEngineRuntime());
  if (!textTool.isReady()) {
    textTool.initialize(rt);
  }
  return rt;
}

async function loadFont(
  fontId: number,
  entry: FontRegistryEntry,
  _runtime: EngineRuntime,
): Promise<boolean> {
  if (loadedFonts.has(fontId)) return true;
  if (pendingFontLoads.has(fontId)) {
    return pendingFontLoads.get(fontId)!;
  }

  if (import.meta.env.MODE === 'test' || typeof window === 'undefined' || typeof fetch === 'undefined') {
    return false;
  }

  const promise = (async () => {
    try {
      const res = await fetch(entry.url);
      if (!res.ok) return false;
      const buffer = await res.arrayBuffer();
      const ok = textTool.loadFont(fontId, new Uint8Array(buffer));
      if (ok) {
        loadedFonts.add(fontId);
      }
      return ok;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[textToolController] failed to load font', { fontId, url: entry.url, err });
      }
      return false;
    } finally {
      pendingFontLoads.delete(fontId);
    }
  })();

  pendingFontLoads.set(fontId, promise);
  return promise;
}

export function mapFontFamilyToId(fontFamily: string | undefined): number {
  if (!fontFamily) return 4;
  const entry = FONT_REGISTRY[fontFamily];
  return entry?.fontId ?? 4;
}

export async function ensureTextToolReady(runtime?: EngineRuntime, fontFamily?: string): Promise<TextTool> {
  const rt = await ensureInitialized(runtime);
  const activeFontId = mapFontFamilyToId(fontFamily);
  const fontEntry = Object.values(FONT_REGISTRY).find((entry) => entry.fontId === activeFontId);
  if (fontEntry) {
    void loadFont(activeFontId, fontEntry, rt);
  }
  return textTool;
}

export function getLastTextState(): TextToolState | null {
  return lastState;
}

export function applyTextDefaultsFromSettings(): TextStyleDefaults {
  const { fontSize, fontFamily, align, bold, italic, underline, strike } =
    useSettingsStore.getState().toolDefaults.text;

  const fontId = mapFontFamilyToId(fontFamily);
  const flags =
    (bold ? TextStyleFlags.Bold : 0) |
    (italic ? TextStyleFlags.Italic : 0) |
    (underline ? TextStyleFlags.Underline : 0) |
    (strike ? TextStyleFlags.Strikethrough : 0);

  const defaults: Partial<TextStyleDefaults> = {
    fontId,
    fontSize,
    align: align as TextAlign,
    flags,
  };

  textTool.setStyleDefaults(defaults);
  return textTool.getStyleDefaults();
}
