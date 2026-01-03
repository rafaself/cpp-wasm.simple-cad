import { getEngineRuntime } from '@/engine/core/singleton';
import { TextTool, createTextTool } from '@/engine/tools/TextTool';
import { TextStyleFlags } from '@/types/text';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useUIStore } from '@/stores/useUIStore';

import type { EngineRuntime } from '@/engine/core/EngineRuntime';
import type { TextToolCallbacks, TextToolState, TextStyleDefaults } from '@/engine/tools/TextTool';
import type { TextAlign } from '@/types/text';

type TextToolListener = Partial<TextToolCallbacks>;

// =============================================================================
// Font Family System with Real Variants
// =============================================================================

type FontStyle = 'regular' | 'bold' | 'italic' | 'boldItalic';

interface FontVariant {
  fontId: number;
  url: string;
  bold: boolean;
  italic: boolean;
}

interface FontFamilyConfig {
  baseId: number;
  variants: Record<FontStyle, FontVariant>;
}

// Font families with real bold/italic variants for professional quality rendering.
// Each variant is a separate TTF file with proper typographic design.
const FONT_FAMILIES: Record<string, FontFamilyConfig> = {
  'Open Sans': {
    baseId: 1,
    variants: {
      regular:    { fontId: 1,  url: '/fonts/OpenSans-Regular.ttf', bold: false, italic: false },
      bold:       { fontId: 2,  url: '/fonts/OpenSans-Bold.ttf', bold: true, italic: false },
      italic:     { fontId: 3,  url: '/fonts/OpenSans-Italic.ttf', bold: false, italic: true },
      boldItalic: { fontId: 4,  url: '/fonts/OpenSans-BoldItalic.ttf', bold: true, italic: true },
    },
  },
  'Noto Serif': {
    baseId: 10,
    variants: {
      regular:    { fontId: 10, url: '/fonts/NotoSerif-Regular.ttf', bold: false, italic: false },
      bold:       { fontId: 11, url: '/fonts/NotoSerif-Bold.ttf', bold: true, italic: false },
      italic:     { fontId: 12, url: '/fonts/NotoSerif-Italic.ttf', bold: false, italic: true },
      boldItalic: { fontId: 13, url: '/fonts/NotoSerif-BoldItalic.ttf', bold: true, italic: true },
    },
  },
};

// Map familiar font names to available fonts
const FAMILY_ALIASES: Record<string, string> = {
  'Times': 'Noto Serif',
  'Times New Roman': 'Noto Serif',
  'Georgia': 'Noto Serif',
  'DejaVu Serif': 'Noto Serif',
  // Sans-serif aliases now point to Open Sans
  'Arial': 'Open Sans',
  'Helvetica': 'Open Sans',
  'Inter': 'Open Sans',
  'Roboto': 'Open Sans',
  'DejaVu Sans': 'Open Sans',
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

async function loadFontVariant(
  variant: FontVariant,
  _runtime: EngineRuntime,
): Promise<boolean> {
  if (loadedFonts.has(variant.fontId)) return true;
  if (pendingFontLoads.has(variant.fontId)) {
    return pendingFontLoads.get(variant.fontId)!;
  }

  if (import.meta.env.MODE === 'test' || typeof window === 'undefined' || typeof fetch === 'undefined') {
    return false;
  }

  const promise = (async () => {
    try {
      const res = await fetch(variant.url);
      if (!res.ok) return false;
      const buffer = await res.arrayBuffer();
      const ok = textTool.loadFontEx(variant.fontId, new Uint8Array(buffer), variant.bold, variant.italic);
      if (ok) {
        loadedFonts.add(variant.fontId);
      }
      return ok;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[textToolController] failed to load font', { fontId: variant.fontId, url: variant.url, err });
      }
      return false;
    } finally {
      pendingFontLoads.delete(variant.fontId);
    }
  })();

  pendingFontLoads.set(variant.fontId, promise);
  return promise;
}

/**
 * Resolve a font family name to our internal family config.
 */
function resolveFamily(fontFamily: string | undefined): FontFamilyConfig {
  if (!fontFamily) return FONT_FAMILIES['Open Sans'];
  const aliased = FAMILY_ALIASES[fontFamily] ?? fontFamily;
  return FONT_FAMILIES[aliased] ?? FONT_FAMILIES['Open Sans'];
}

/**
 * Get the font variant for a family based on bold/italic state.
 */
function getFontStyle(bold: boolean, italic: boolean): FontStyle {
  if (bold && italic) return 'boldItalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'regular';
}

/**
 * Resolve family + style to the specific font variant.
 */
export function resolveFontVariant(fontFamily: string | undefined, bold: boolean, italic: boolean): FontVariant {
  const family = resolveFamily(fontFamily);
  const style = getFontStyle(bold, italic);
  return family.variants[style];
}

/**
 * Get fontId for a family (regular variant).
 * @deprecated Use resolveFontVariant for style-aware resolution.
 */
export function mapFontFamilyToId(fontFamily: string | undefined): number {
  return resolveFamily(fontFamily).baseId;
}

/**
 * Ensure a specific font variant is loaded.
 */
export async function ensureFontVariantLoaded(
  fontFamily: string | undefined,
  bold: boolean,
  italic: boolean,
  runtime?: EngineRuntime
): Promise<number> {
  const rt = await ensureInitialized(runtime);
  const variant = resolveFontVariant(fontFamily, bold, italic);
  await loadFontVariant(variant, rt);
  return variant.fontId;
}

export async function ensureTextToolReady(runtime?: EngineRuntime, fontFamily?: string): Promise<TextTool> {
  const rt = await ensureInitialized(runtime);
  // Load the regular variant by default
  const variant = resolveFontVariant(fontFamily, false, false);
  void loadFontVariant(variant, rt);
  return textTool;
}

export function getLastTextState(): TextToolState | null {
  return lastState;
}

export function applyTextDefaultsFromSettings(): TextStyleDefaults {
  const { fontSize, fontFamily, align, bold, italic, underline, strike } =
    useSettingsStore.getState().toolDefaults.text;

  // Get the base family config - we use the BASE fontId, not the variant!
  // The Engine will resolve to the correct variant based on style flags.
  // This avoids the "font not found" error when creating text with bold active
  // before the bold variant is loaded.
  const family = resolveFamily(fontFamily);
  const baseVariant = family.variants.regular;
  
  // Preload the variant that matches current style (async, for when user types)
  const styleVariant = resolveFontVariant(fontFamily, bold, italic);
  void getEngineRuntime().then((rt) => {
    // Load base first, then the styled variant
    void loadFontVariant(baseVariant, rt);
    if (styleVariant.fontId !== baseVariant.fontId) {
      void loadFontVariant(styleVariant, rt);
    }
  });

  // Use BASE fontId with style FLAGS - Engine resolves to variant internally
  const flags =
    (bold ? TextStyleFlags.Bold : 0) |
    (italic ? TextStyleFlags.Italic : 0) |
    (underline ? TextStyleFlags.Underline : 0) |
    (strike ? TextStyleFlags.Strikethrough : 0);

  const defaults: Partial<TextStyleDefaults> = {
    fontId: baseVariant.fontId,  // Always use base font ID!
    fontSize,
    align: align as TextAlign,
    flags,  // Engine uses flags to resolve to variant
  };

  textTool.setStyleDefaults(defaults);
  return textTool.getStyleDefaults();
}
