/** @type {import('tailwindcss').Config} */
module.exports = {
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
  ],
  theme: {
    extend: {
      colors: {
        ribbon: {
          root: '#0f172a',   // slate-900
          panel: '#1e293b',  // slate-800
          border: '#334155', // slate-700
          hover: '#334155',  // slate-700
          text: '#e2e8f0',   // slate-200
          muted: '#94a3b8',  // slate-400
        }
      }
    },
  },
  plugins: [],
};
