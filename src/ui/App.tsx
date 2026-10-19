import { useEffect, useState } from 'preact/hooks';
import { FileWorkbench } from './FileWorkbench';

type Theme = 'light' | 'dark';

function initialTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function App() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div class="app-shell">
      <header class="app-header">
        <p class="wordmark">
          Fluido <span class="wordmark-sub">· lettore PDF</span>
        </p>
        <button
          type="button"
          class="theme-toggle"
          aria-label={theme === 'dark' ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main class="app-main">
        <FileWorkbench />
      </main>

      <footer class="app-footer">
        <p>
          Fluido v0.1.0-spike.1 · Fase 1 · <a href="https://opensource.org/licenses/MIT">MIT</a>
        </p>
      </footer>
    </div>
  );
}

function SunIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
