'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

type ThemeName = 'day' | 'night';

const STORAGE_KEY = 'nexora-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>('day');

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const nextTheme = saved === 'night' ? 'night' : 'day';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  function toggleTheme() {
    const nextTheme = theme === 'night' ? 'day' : 'night';
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  const isNight = theme === 'night';

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isNight ? 'Switch to day theme' : 'Switch to night theme'}
      aria-pressed={isNight}
    >
      {isNight ? <Moon size={16} /> : <Sun size={16} />}
      <span>{isNight ? 'Night' : 'Day'}</span>
    </button>
  );
}
