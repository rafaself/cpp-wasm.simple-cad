/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './src/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './stores/**/*.{ts,tsx}',
    './utils/**/*.{ts,tsx}',
    './design/**/*.css',
    './theme/**/*.css',
    './shared/**/*.{ts,tsx,css}',
  ],
  theme: {
    extend: {
      colors: {
        // Semantic Tokens (Single Source of Truth)
        bg: 'hsl(var(--color-bg) / <alpha-value>)',
        'surface-1': 'hsl(var(--color-surface-1) / <alpha-value>)',
        'surface-2': 'hsl(var(--color-surface-2) / <alpha-value>)',
        border: 'hsl(var(--color-border) / <alpha-value>)',
        
        text: 'hsl(var(--color-text) / <alpha-value>)',
        'text-muted': 'hsl(var(--color-text-muted) / <alpha-value>)',
        'text-subtle': 'hsl(var(--color-text-subtle) / <alpha-value>)',
        
        primary: 'hsl(var(--color-primary) / <alpha-value>)',
        'primary-hover': 'hsl(var(--color-primary-hover) / <alpha-value>)',
        'primary-contrast': 'hsl(var(--color-primary-contrast) / <alpha-value>)',
        
        secondary: 'hsl(var(--color-secondary) / <alpha-value>)',
        'secondary-hover': 'hsl(var(--color-secondary-hover) / <alpha-value>)',
        
        success: 'hsl(var(--color-success) / <alpha-value>)',
        warning: 'hsl(var(--color-warning) / <alpha-value>)',
        error: 'hsl(var(--color-error) / <alpha-value>)',
        info: 'hsl(var(--color-info) / <alpha-value>)',
        
        header: 'hsl(var(--color-header-bg) / <alpha-value>)',
        'header-tab-active': 'hsl(var(--color-header-tab-active) / <alpha-value>)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        none: 'var(--shadow-0)',
        sm: 'var(--shadow-1)',
        md: 'var(--shadow-2)',
        lg: 'var(--shadow-3)',
        xl: 'var(--shadow-4)',
        // Legacy mappings
        card: 'var(--shadow-3)',
        focus: '0 0 0 2px hsl(var(--color-focus) / 0.35)',
      },
      spacing: {
        '0_5': 'var(--space-0_5)',
        1: 'var(--space-1)',
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        5: 'var(--space-5)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
        10: 'var(--space-10)',
        12: 'var(--space-12)',
        16: 'var(--space-16)',
      },
      zIndex: {
        'canvas-base': 'var(--z-canvas-base)',
        'canvas-overlay': 'var(--z-canvas-overlay)',
        'canvas-hud': 'var(--z-canvas-hud)',
        dropdown: 'var(--z-dropdown)',
        tooltip: 'var(--z-tooltip)',
        modal: 'var(--z-modal)',
        toast: 'var(--z-toast)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        normal: 'var(--duration-normal)',
      },
      transitionTimingFunction: {
        default: 'var(--easing-default)',
      }
    },
  },
  plugins: [],
};
