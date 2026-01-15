import React from 'react';
import ReactDOM from 'react-dom/client';

import './design/index.css';
import './theme/theme.css';
import { ThemeProvider } from './design/ThemeContext';
import { applyTheme, getInitialTheme } from './theme/applyTheme';

// Apply theme immediately to avoid flicker
applyTheme(getInitialTheme());
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
