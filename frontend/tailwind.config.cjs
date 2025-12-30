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
        ribbon: {
          root: 'hsl(var(--color-surface-strong))',
          panel: 'hsl(var(--color-surface-strong))',
          border: 'hsl(var(--color-border))',
          hover: 'hsl(var(--color-surface-muted))',
          text: 'hsl(var(--color-foreground))',
          muted: 'hsl(var(--color-muted))',
        },
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
