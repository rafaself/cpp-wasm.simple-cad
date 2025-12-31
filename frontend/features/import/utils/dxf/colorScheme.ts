import { toGrayscale } from './styles';

export type DxfColorScheme = 'original' | 'fixedGray153' | 'grayscale' | 'custom';

export interface ColorSchemePreferences {
  scheme: DxfColorScheme;
  customColor?: string;
}

export const FIXED_GRAY_153 = '#999999';

export const resolveColorScheme = (options?: {
  colorScheme?: DxfColorScheme;
  customColor?: string;
}): ColorSchemePreferences => {
  if (!options || !options.colorScheme) {
    return { scheme: 'original' };
  }
  return {
    scheme: options.colorScheme,
    customColor: options.customColor,
  };
};

const normalizeColorValue = (value?: string): string => {
  if (!value) return '#000000';
  return value.startsWith('#') ? value.toLowerCase() : value;
};

export const applyColorScheme = (
  baseColor: string,
  scheme: DxfColorScheme,
  customColor?: string,
): string => {
  const normalizedBase = baseColor?.toLowerCase() || '#000000';

  switch (scheme) {
    case 'original':
      return normalizedBase;
    case 'fixedGray153':
      return FIXED_GRAY_153;
    case 'grayscale':
      return toGrayscale(normalizedBase);
    case 'custom':
      return normalizeColorValue(customColor);
  }
};

export const usesCustomColorMode = (scheme: DxfColorScheme): boolean => scheme !== 'original';
