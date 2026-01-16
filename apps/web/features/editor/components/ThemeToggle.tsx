import { Moon, Sun } from 'lucide-react';
import React from 'react';

import { useTheme } from '@/design/ThemeContext';
import { LABELS } from '@/i18n/labels';

const ThemeToggle: React.FC = () => {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-1 hover:bg-surface2 rounded hover:text-text transition-colors focus-outline text-text-muted"
      title={LABELS.common.toggleTheme}
    >
      <div className="relative w-[14px] h-[14px]">
        <Sun
          size={14}
          className="absolute inset-0 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
        />
        <Moon
          size={14}
          className="absolute inset-0 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
        />
      </div>
      <span className="sr-only">Toggle theme</span>
    </button>
  );
};

export default ThemeToggle;
