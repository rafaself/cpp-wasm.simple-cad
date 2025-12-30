
export type ThemeName = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'vite-ui-theme';

export function getInitialTheme(): ThemeName {
  if (typeof window === 'undefined') return 'dark'; // SSR safety

  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      return stored;
    }

    // Check system preference if 'system' or valid default
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch (error) {
    console.warn('Failed to resolve theme', error);
  }

  return 'light';
}

export function applyTheme(theme: ThemeName, persist: boolean = false) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  
  // For compatibility with Tailwind 'class' mode if actively used
  root.classList.remove('light', 'dark');
  root.classList.add(theme);

  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}
