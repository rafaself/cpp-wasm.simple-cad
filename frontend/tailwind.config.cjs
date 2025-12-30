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
    './shared/**/*.{ts,tsx,css}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--color-background))',
        surface: 'hsl(var(--color-surface))',
        'surface-strong': 'hsl(var(--color-surface-strong))',
        'surface-muted': 'hsl(var(--color-surface-muted))',
        foreground: 'hsl(var(--color-foreground))',
        muted: 'hsl(var(--color-muted))',
        border: 'hsl(var(--color-border))',
        accent: {
          DEFAULT: 'hsl(var(--color-accent))',
          foreground: 'hsl(var(--color-accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--color-destructive))',
          foreground: 'hsl(var(--color-destructive-foreground))',
        },

        // New Semantic Tokens (v1)
        bg: 'hsl(var(--color-bg) / <alpha-value>)',
        surface1: 'hsl(var(--color-surface-1) / <alpha-value>)',
        surface2: 'hsl(var(--color-surface-2) / <alpha-value>)',
        // border is already defined as hsl(var(--color-border)), which matches our new system
        text: 'hsl(var(--color-text) / <alpha-value>)',
        'text-muted': 'hsl(var(--color-text-muted) / <alpha-value>)',
        primary: 'hsl(var(--color-primary) / <alpha-value>)',
        'primary-hover': 'hsl(var(--color-primary-hover) / <alpha-value>)',
        'primary-contrast': 'hsl(var(--color-primary-contrast) / <alpha-value>)',
        secondary: 'hsl(var(--color-secondary) / <alpha-value>)',
        'secondary-hover': 'hsl(var(--color-secondary-hover) / <alpha-value>)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        focus: 'var(--shadow-focus)',
      },
    },
  },
  plugins: [],
};
