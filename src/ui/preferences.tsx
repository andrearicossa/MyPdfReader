import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import {
  defaultPreferences,
  normalizePreferences,
  type ReadingPreferences,
} from '../core/reading-preferences';
import { readPreferences, writePreferences } from '../storage/preferences';

export function usePreferencesController() {
  const [preferences, setPreferences] = useState<ReadingPreferences>(() => ({
    ...defaultPreferences,
    theme:
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light',
  }));
  const [storage, setStorage] = useState('Caricamento preferenze…');
  const [ready, setReady] = useState(false);
  const changed = useRef(false);
  const latest = useRef(preferences);
  latest.current = preferences;
  const revision = useRef(0);
  useEffect(() => {
    let active = true;
    void readPreferences()
      .then((value) => {
        if (!active) return;
        if (value !== undefined && !changed.current) setPreferences(normalizePreferences(value));
        if (!changed.current) setStorage('Preferenze locali pronte.');
      })
      .catch(() => {
        if (active) setStorage('Preferenze temporanee: archiviazione locale non disponibile.');
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const update = (change: Partial<ReadingPreferences>) => {
    changed.current = true;
    const next = normalizePreferences({ ...latest.current, ...change });
    latest.current = next;
    const id = ++revision.current;
    setPreferences(next);
    setStorage('Salvataggio preferenze…');
    void writePreferences(next)
      .then(() => {
        if (id === revision.current) setStorage('Preferenze salvate su questo dispositivo.');
      })
      .catch(() => {
        if (id === revision.current)
          setStorage('Preferenze temporanee: archiviazione locale non disponibile.');
      });
  };
  return { preferences, update, storage, ready };
}
export const PreferencesContext = createContext<ReturnType<typeof usePreferencesController>>({
  preferences: defaultPreferences,
  update: () => {},
  storage: '',
  ready: false,
});
export const useReadingPreferences = () => useContext(PreferencesContext);
